from datetime import timedelta
import os
from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import views, status, response, permissions
from rest_framework_simplejwt.tokens import RefreshToken
from apps.core.audit import log_audit_event
from .models import User, UserRole, PasswordResetToken, EmailVerificationToken
from .serializers import UserSerializer, ProfileUpdateSerializer, RegisterSerializer, ChangePasswordSerializer


def _send_transactional_email(to_email: str, subject: str, body: str):
    """Dispatches transactional verification/reset emails via configured SMTP or console backend."""
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@smarthire.local'),
            recipient_list=[to_email],
            fail_silently=True,
        )
    except Exception:
        pass


def revoke_all_user_tokens(user):
    """Blacklists all outstanding SimpleJWT refresh tokens for the given user."""
    try:
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
    except Exception:
        pass


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
            _send_transactional_email(
                user.email,
                'Verify your SmartHire AI account',
                f"Welcome to SmartHire AI.\n\nYour email verification token is:\n{verify_token.token}\n\nThis token expires in 24 hours.",
            )
            refresh = RefreshToken.for_user(user)
            update_last_login(None, user)
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
        email = str(request.data.get('email', '')).strip().lower()
        password = str(request.data.get('password', ''))

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
        update_last_login(None, user)
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
                if str(token.get('user_id', '')) == str(request.user.id):
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
        user.save(update_fields=['is_active', 'updated_at'])
        revoke_all_user_tokens(user)
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
        revoke_all_user_tokens(request.user)
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
        email = str(request.data.get('email', '')).strip().lower()
        # Account enumeration protection: always return generic 200 OK
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        reset_token_str = None
        if user:
            PasswordResetToken.objects.filter(user=user, used=False).update(used=True)
            token_obj = PasswordResetToken.objects.create(
                user=user,
                expires_at=timezone.now() + timedelta(minutes=30),
            )
            reset_token_str = str(token_obj.token)
            _send_transactional_email(
                email,
                'SmartHire AI Password Reset',
                f"A password reset was requested for your SmartHire AI account.\n\nReset token (valid 30 minutes):\n{reset_token_str}",
            )
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
        token_str = str(request.data.get('token', '')).strip()
        new_password = str(request.data.get('new_password', ''))
        if not token_str or not new_password:
            return response.Response({'error': 'Valid reset token and new password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token_obj = PasswordResetToken.objects.select_related('user').get(token=token_str)
        except (PasswordResetToken.DoesNotExist, ValueError):
            return response.Response({'error': 'Invalid or expired reset token.'}, status=status.HTTP_400_BAD_REQUEST)

        if not token_obj.is_valid() or not token_obj.user.is_active:
            return response.Response({'error': 'Invalid or expired reset token.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user=token_obj.user)
        except DjangoValidationError as exc:
            return response.Response({'error': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        token_obj.user.set_password(new_password)
        token_obj.user.save()
        PasswordResetToken.objects.filter(user=token_obj.user, used=False).update(used=True)
        revoke_all_user_tokens(token_obj.user)
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
    throttle_scope = 'auth_login'

    def post(self, request):
        token_str = str(request.data.get('token', '')).strip()
        try:
            token_obj = EmailVerificationToken.objects.select_related('user').get(token=token_str)
        except (EmailVerificationToken.DoesNotExist, ValueError):
            return response.Response({'error': 'Invalid verification token.'}, status=status.HTTP_400_BAD_REQUEST)

        if not token_obj.is_valid():
            return response.Response({'error': 'Verification token expired or already used.'}, status=status.HTTP_400_BAD_REQUEST)

        token_obj.user.is_email_verified = True
        token_obj.user.save(update_fields=['is_email_verified', 'updated_at'])
        EmailVerificationToken.objects.filter(user=token_obj.user, used=False).update(used=True)
        log_audit_event(
            'AUTH_EMAIL_VERIFIED',
            f"Email verified for {token_obj.user.email}",
            level='INFO',
            user_email=token_obj.user.email,
            request=request,
        )
        return response.Response({'message': 'Email verified successfully.'}, status=status.HTTP_200_OK)


class ResendVerificationView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'auth_login'

    def post(self, request):
        user = request.user
        if user.is_email_verified:
            return response.Response({'message': 'Email is already verified.'}, status=status.HTTP_200_OK)

        EmailVerificationToken.objects.filter(user=user, used=False).update(used=True)
        verify_token = EmailVerificationToken.objects.create(
            user=user,
            expires_at=timezone.now() + timedelta(hours=24),
        )
        payload = {'message': 'Verification token re-issued.'}
        if settings.DEBUG:
            payload['verification_token_preview'] = str(verify_token.token)
        return response.Response(payload, status=status.HTTP_200_OK)


class AuthProvidersView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        google_configured = bool(os.getenv('GOOGLE_OAUTH_CLIENT_ID', '').strip())
        github_configured = bool(os.getenv('GITHUB_OAUTH_CLIENT_ID', '').strip())
        needs_initial_setup = not User.objects.filter(role=UserRole.ADMIN).exists()
        return response.Response({
            'jwt': True,
            'needs_initial_setup': needs_initial_setup,
            'google_oauth2': {'enabled': google_configured},
            'github_sso': {'enabled': github_configured},
        })


class BootstrapAdminView(views.APIView):
    """
    Allows provisioning the very first Administrator account on a fresh, empty database.
    Permanently locks (403 Forbidden) once any Admin account exists.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth_register'

    def post(self, request):
        if User.objects.filter(role=UserRole.ADMIN).exists():
            return response.Response(
                {'error': 'Initial administrator setup has already been completed.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        email = str(request.data.get('email') or '').strip().lower()
        password = str(request.data.get('password') or '')
        full_name = str(request.data.get('full_name') or '').strip()

        if not email or not password:
            return response.Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email__iexact=email).exists():
            return response.Response({'error': 'An account with this email already exists.'}, status=status.HTTP_409_CONFLICT)

        try:
            validate_password(password)
        except DjangoValidationError as exc:
            return response.Response({'error': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        import uuid as _uuid
        base = email.split('@')[0][:20]
        admin_user = User.objects.create_user(
            username=f"{base}_{_uuid.uuid4().hex[:8]}",
            email=email,
            password=password,
            full_name=full_name or base.title(),
            role=UserRole.ADMIN,
            is_staff=True,
            is_superuser=True,
            is_email_verified=True,
            recording_consent=True,
        )
        refresh = RefreshToken.for_user(admin_user)
        update_last_login(None, admin_user)
        log_audit_event(
            'ADMIN_BOOTSTRAPPED',
            f"Initial administrator account provisioned: {admin_user.email}",
            level='WARN',
            user_email=admin_user.email,
            request=request,
        )
        return response.Response({
            'message': 'Administrator account initialized.',
            'user': UserSerializer(admin_user).data,
            'token': str(refresh.access_token),
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            },
        }, status=status.HTTP_201_CREATED)


class ExportUserDataView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.resumes.models import Resume
        from apps.resumes.serializers import ResumeSerializer
        from apps.interviews.models import InterviewSession, RoadmapMilestone
        from apps.interviews.serializers import InterviewSessionSerializer
        from apps.evaluations.models import Evaluation
        from apps.evaluations.serializers import EvaluationSerializer
        from apps.core.models import MentorChatMessage

        resumes = Resume.objects.filter(user=request.user).order_by('-created_at')
        sessions = InterviewSession.objects.filter(candidate=request.user).prefetch_related('questions', 'answers').order_by('-created_at')
        evaluations = Evaluation.objects.filter(session__candidate=request.user).order_by('-created_at')
        milestones = RoadmapMilestone.objects.filter(user=request.user).values('milestone_key', 'completed', 'updated_at')
        chat_msgs = MentorChatMessage.objects.filter(user=request.user).values('role', 'content', 'input_source', 'created_at')

        log_audit_event(
            'USER_DATA_EXPORTED',
            f"User {request.user.email} exported personal data archive.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )
        return response.Response({
            'exported_at': timezone.now().isoformat(),
            'user': UserSerializer(request.user).data,
            'resumes': ResumeSerializer(resumes, many=True).data,
            'interviews': InterviewSessionSerializer(sessions, many=True).data,
            'evaluations': EvaluationSerializer(evaluations, many=True).data,
            'roadmap_milestones': list(milestones),
            'mentor_chat_messages': list(chat_msgs),
        })
