from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from rest_framework import views, status, response, permissions
from rest_framework_simplejwt.tokens import RefreshToken
from apps.core.audit import log_audit_event
from .models import User, PasswordResetToken, EmailVerificationToken
from .serializers import UserSerializer, ProfileUpdateSerializer, RegisterSerializer, ChangePasswordSerializer


class RegisterView(views.APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth_register'

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            verify_token = EmailVerificationToken.objects.create(
                user=user,
                expires_at=timezone.now() + timedelta(hours=24),
            )
            refresh = RefreshToken.for_user(user)
            log_audit_event(
                'AUTH_REGISTER',
                f"New candidate account registered: {user.email}",
                level='INFO',
                user_email=user.email,
                request=request,
            )
            return response.Response({
                'message': 'Registration successful. Verification link issued.',
                'user': UserSerializer(user).data,
                'token': str(refresh.access_token),
                'tokens': {
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                },
                'verification_token_preview': str(verify_token.token) if settings.DEBUG else None,
            }, status=status.HTTP_201_CREATED)
        return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(views.APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth_login'

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')

        if not email or not password:
            return response.Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.check_password(password):
            log_audit_event(
                'AUTH_LOGIN_FAILED',
                f"Failed login attempt for {email}",
                level='WARN',
                user_email=email,
                request=request,
            )
            return response.Response({'error': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            log_audit_event(
                'AUTH_LOGIN_SUSPENDED',
                f"Suspended account login attempt for {email}",
                level='WARN',
                user_email=email,
                request=request,
            )
            return response.Response({'error': 'This account has been deactivated. Contact an administrator.'}, status=status.HTTP_403_FORBIDDEN)

        refresh = RefreshToken.for_user(user)
        log_audit_event(
            'AUTH_LOGIN',
            f"User {user.email} ({user.role}) authenticated successfully via JWT.",
            level='INFO',
            user_email=user.email,
            request=request,
        )
        return response.Response({
            'message': 'Login successful',
            'user': UserSerializer(user).data,
            'token': str(refresh.access_token),
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            },
        }, status=status.HTTP_200_OK)


class LogoutView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                pass
        log_audit_event(
            'AUTH_LOGOUT',
            f"User {request.user.email} signed out and revoked session.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )
        return response.Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)


class ProfileView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return response.Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit_event(
                'PROFILE_UPDATED',
                f"User {request.user.email} updated profile settings.",
                level='INFO',
                user_email=request.user.email,
                request=request,
            )
            return response.Response(UserSerializer(request.user).data)
        return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request):
        user = request.user
        user.is_active = False
        user.save()
        log_audit_event(
            'ACCOUNT_DEACTIVATED',
            f"User {user.email} deactivated their account.",
            level='WARN',
            user_email=user.email,
            request=request,
        )
        return response.Response({'message': 'Account deactivated successfully.'}, status=status.HTTP_200_OK)


class ChangePasswordView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if not request.user.check_password(serializer.validated_data['current_password']):
            return response.Response({'error': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        log_audit_event(
            'PASSWORD_CHANGED',
            f"User {request.user.email} changed their password.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )
        return response.Response({'message': 'Password updated successfully.'}, status=status.HTTP_200_OK)


class ForgotPasswordView(views.APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth_login'

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        # Account enumeration protection: always return generic 200 OK
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        reset_token_str = None
        if user:
            token_obj = PasswordResetToken.objects.create(
                user=user,
                expires_at=timezone.now() + timedelta(minutes=30),
            )
            reset_token_str = str(token_obj.token)
            log_audit_event(
                'PASSWORD_RESET_REQUESTED',
                f"Password reset token issued for {email}",
                level='INFO',
                user_email=email,
                request=request,
            )
        payload = {'message': 'If an active account exists for that email, reset instructions have been issued.'}
        if reset_token_str and settings.DEBUG:
            payload['dev_reset_token'] = reset_token_str
        return response.Response(payload, status=status.HTTP_200_OK)


class ResetPasswordView(views.APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth_login'

    def post(self, request):
        token_str = request.data.get('token', '').strip()
        new_password = request.data.get('new_password', '')
        if not token_str or len(new_password) < 8:
            return response.Response({'error': 'Valid reset token and password (min 8 chars) required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token_obj = PasswordResetToken.objects.get(token=token_str)
        except (PasswordResetToken.DoesNotExist, ValueError):
            return response.Response({'error': 'Invalid or expired reset token.'}, status=status.HTTP_400_BAD_REQUEST)

        if not token_obj.is_valid():
            return response.Response({'error': 'Invalid or expired reset token.'}, status=status.HTTP_400_BAD_REQUEST)

        token_obj.user.set_password(new_password)
        token_obj.user.save()
        token_obj.used = True
        token_obj.save()
        log_audit_event(
            'PASSWORD_RESET_COMPLETED',
            f"Password reset completed for {token_obj.user.email}",
            level='INFO',
            user_email=token_obj.user.email,
            request=request,
        )
        return response.Response({'message': 'Password has been reset successfully.'}, status=status.HTTP_200_OK)


class VerifyEmailView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token_str = request.data.get('token', '').strip()
        try:
            token_obj = EmailVerificationToken.objects.get(token=token_str)
        except (EmailVerificationToken.DoesNotExist, ValueError):
            return response.Response({'error': 'Invalid verification token.'}, status=status.HTTP_400_BAD_REQUEST)

        if not token_obj.is_valid():
            return response.Response({'error': 'Verification token expired or already used.'}, status=status.HTTP_400_BAD_REQUEST)

        token_obj.user.is_email_verified = True
        token_obj.user.save()
        token_obj.used = True
        token_obj.save()
        return response.Response({'message': 'Email verified successfully.'}, status=status.HTTP_200_OK)


class ExportUserDataView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.resumes.models import Resume
        from apps.resumes.serializers import ResumeSerializer
        from apps.interviews.models import InterviewSession
        from apps.interviews.serializers import InterviewSessionSerializer

        resumes = Resume.objects.filter(user=request.user).order_by('-created_at')
        sessions = InterviewSession.objects.filter(candidate=request.user).order_by('-created_at')
        return response.Response({
            'exported_at': timezone.now().isoformat(),
            'user': UserSerializer(request.user).data,
            'resumes': ResumeSerializer(resumes, many=True).data,
            'interviews': InterviewSessionSerializer(sessions, many=True).data,
        })
