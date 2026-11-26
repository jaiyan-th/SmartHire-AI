from datetime import timedelta
import time
import uuid
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from django.db.models import Avg, Q, Sum
from django.utils import timezone
from rest_framework import views, status, response
from apps.accounts.models import User, UserRole, PasswordResetToken
from apps.accounts.permissions import IsAdminUserRole
from apps.accounts.serializers import UserSerializer
from apps.accounts.views import revoke_all_user_tokens
from apps.core.audit import log_audit_event
from apps.core.models import AuditLog, PlatformConfig, AIUsageRecord, BackgroundJob
from apps.core.views import APP_START_MONOTONIC
from apps.evaluations.models import Evaluation
from apps.interviews.models import InterviewSession
from apps.resumes.models import Resume


def _format_uptime(seconds: int) -> str:
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    if days > 0:
        return f"{days}d {hours}h {minutes}m"
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m {seconds % 60}s"


class AdminOverviewView(views.APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        total_users = User.objects.count()
        candidate_count = User.objects.filter(role=UserRole.CANDIDATE).count()
        recruiter_count = User.objects.filter(role=UserRole.RECRUITER).count()
        total_sessions = InterviewSession.objects.count()
        total_resumes = Resume.objects.count()
        total_evaluations = Evaluation.objects.count()

        usage_agg = AIUsageRecord.objects.aggregate(
            total_prompt=Sum('prompt_tokens'),
            total_completion=Sum('completion_tokens'),
            total_cost=Sum('estimated_cost_usd'),
            avg_latency=Avg('latency_ms'),
        )
        total_tokens = (usage_agg['total_prompt'] or 0) + (usage_agg['total_completion'] or 0)
        avg_latency = int(round(usage_agg['avg_latency'] or 0))
        failed_jobs = BackgroundJob.objects.filter(status='failed').count()
        completed_jobs = BackgroundJob.objects.filter(status='completed').count()

        db_ok = True
        db_start = time.monotonic()
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
            db_ping_ms = round((time.monotonic() - db_start) * 1000, 2)
        except Exception:
            db_ok = False
            db_ping_ms = None

        config = PlatformConfig.get_solo()
        uptime_secs = int(time.monotonic() - APP_START_MONOTONIC)

        return response.Response({
            'db_status': 'Healthy' if db_ok else 'Degraded',
            'db_engine': connection.vendor,
            'db_ping_ms': db_ping_ms,
            'llm_backend': config.llm_backend,
            'llm_latency_ms': avg_latency,
            'registered_users': total_users,
            'candidate_count': candidate_count,
            'recruiter_count': recruiter_count,
            'total_sessions': total_sessions,
            'total_evaluations': total_evaluations,
            'total_resumes': total_resumes,
            'token_consumption_total': total_tokens,
            'estimated_total_cost': f"${(usage_agg['total_cost'] or 0.0):.4f}",
            'background_jobs_completed': completed_jobs,
            'background_jobs_failed': failed_jobs,
            'maintenance_mode': config.maintenance_mode,
            'uptime_seconds': uptime_secs,
            'system_uptime': _format_uptime(uptime_secs),
        })


class AdminUsersView(views.APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        users = User.objects.all().order_by('-created_at')
        q = (request.query_params.get('q') or '').strip()
        role_filter = (request.query_params.get('role') or '').strip().lower()
        if q:
            users = users.filter(Q(email__icontains=q) | Q(full_name__icontains=q))
        if role_filter:
            users = users.filter(role__iexact=role_filter)
        return response.Response(UserSerializer(users, many=True).data)

    def post(self, request):
        email = str(request.data.get('email') or '').strip().lower()
        password = str(request.data.get('password') or '')
        full_name = str(request.data.get('full_name') or '').strip()
        role = str(request.data.get('role') or UserRole.CANDIDATE).strip().lower()

        if not email or not password:
            return response.Response({'error': 'email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_roles = [r[0] for r in UserRole.choices]
        if role not in valid_roles:
            return response.Response({'error': f'Invalid role. Allowed: {valid_roles}'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email__iexact=email).exists():
            return response.Response({'error': 'An account with this email already exists.'}, status=status.HTTP_409_CONFLICT)

        try:
            validate_password(password)
        except DjangoValidationError as exc:
            return response.Response({'error': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        base = email.split('@')[0][:20]
        user = User.objects.create_user(
            username=f"{base}_{uuid.uuid4().hex[:8]}",
            email=email,
            password=password,
            full_name=full_name or base.title(),
            role=role,
            is_staff=(role == UserRole.ADMIN),
            is_email_verified=True,
        )
        log_audit_event(
            'ADMIN_USER_CREATED',
            f"Admin {request.user.email} provisioned {role} account for {user.email}.",
            level='WARN',
            user_email=request.user.email,
            request=request,
        )
        return response.Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    def patch(self, request, pk=None):
        user_id = pk or request.data.get('user_id')
        new_role = request.data.get('role')
        is_active = request.data.get('is_active')
        issue_reset = bool(request.data.get('issue_password_reset', False))

        try:
            user = User.objects.get(id=user_id)
        except (User.DoesNotExist, ValueError):
            return response.Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        if user.id == request.user.id and is_active is False:
            return response.Response({'error': 'Administrators cannot deactivate their own active account.'}, status=status.HTTP_400_BAD_REQUEST)

        if user.id == request.user.id and new_role and new_role != UserRole.ADMIN:
            return response.Response({'error': 'Administrators cannot demote their own admin role.'}, status=status.HTTP_400_BAD_REQUEST)

        if new_role:
            valid_roles = [r[0] for r in UserRole.choices]
            if new_role not in valid_roles:
                return response.Response({'error': f'Invalid role. Allowed: {valid_roles}'}, status=status.HTTP_400_BAD_REQUEST)
            old_role = user.role
            user.role = new_role
            user.is_staff = (new_role == UserRole.ADMIN)
            log_audit_event(
                'ADMIN_ROLE_CHANGED',
                f"Admin {request.user.email} changed role of {user.email} from {old_role} to {new_role}.",
                level='WARN',
                user_email=request.user.email,
                request=request,
            )

        if is_active is not None:
            user.is_active = bool(is_active)
            if not user.is_active:
                revoke_all_user_tokens(user)
            log_audit_event(
                'ADMIN_ACCOUNT_STATUS_CHANGED',
                f"Admin {request.user.email} set is_active={user.is_active} for {user.email}.",
                level='WARN',
                user_email=request.user.email,
                request=request,
            )

        user.save()

        reset_token_preview = None
        if issue_reset:
            PasswordResetToken.objects.filter(user=user, used=False).update(used=True)
            token_obj = PasswordResetToken.objects.create(
                user=user,
                expires_at=timezone.now() + timedelta(minutes=30),
            )
            reset_token_preview = str(token_obj.token)
            log_audit_event(
                'ADMIN_PASSWORD_RESET_ISSUED',
                f"Admin {request.user.email} issued a password reset token for {user.email}.",
                level='INFO',
                user_email=request.user.email,
                request=request,
            )

        data = UserSerializer(user).data
        if reset_token_preview:
            data['reset_token_issued'] = True
        return response.Response(data)


class AdminLogsView(views.APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        level_filter = (request.query_params.get('level') or '').strip()
        event_type = (request.query_params.get('event_type') or '').strip()
        q = (request.query_params.get('q') or '').strip()

        logs = AuditLog.objects.all()
        if level_filter:
            logs = logs.filter(level__iexact=level_filter)
        if event_type:
            logs = logs.filter(event_type__icontains=event_type)
        if q:
            logs = logs.filter(Q(message__icontains=q) | Q(user_email__icontains=q) | Q(event_type__icontains=q))
        logs = logs[:100]

        return response.Response([
            {
                'id': str(l.id),
                'timestamp': l.timestamp.isoformat(),
                'level': l.level,
                'event_type': l.event_type,
                'user_email': l.user_email,
                'message': l.message,
            }
            for l in logs
        ])


class AdminSettingsView(views.APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        config = PlatformConfig.get_solo()
        return response.Response({
            'llm_backend': config.llm_backend,
            'temperature': config.temperature,
            'max_tokens': config.max_tokens,
            'max_question_count': config.max_question_count,
            'daily_token_budget': config.daily_token_budget,
            'maintenance_mode': config.maintenance_mode,
            'available_backends': ['Groq Llama-3.1-8B-Instant', 'OpenAI GPT-4o-mini', 'Local Ollama Llama-3'],
        })

    def post(self, request):
        config = PlatformConfig.get_solo()
        try:
            if 'llm_backend' in request.data:
                config.llm_backend = str(request.data['llm_backend']).strip()[:100]
            if 'temperature' in request.data:
                temp = float(request.data['temperature'])
                if not (0.0 <= temp <= 1.0):
                    return response.Response({'error': 'Temperature must be between 0.0 and 1.0.'}, status=status.HTTP_400_BAD_REQUEST)
                config.temperature = temp
            if 'max_tokens' in request.data:
                tokens = int(request.data['max_tokens'])
                if not (200 <= tokens <= 8000):
                    return response.Response({'error': 'max_tokens must be between 200 and 8000.'}, status=status.HTTP_400_BAD_REQUEST)
                config.max_tokens = tokens
            if 'max_question_count' in request.data:
                config.max_question_count = max(1, min(int(request.data['max_question_count']), 20))
            if 'daily_token_budget' in request.data:
                config.daily_token_budget = max(1000, int(request.data['daily_token_budget']))
            if 'maintenance_mode' in request.data:
                config.maintenance_mode = bool(request.data['maintenance_mode'])
        except (TypeError, ValueError):
            return response.Response({'error': 'Invalid numeric configuration parameter.'}, status=status.HTTP_400_BAD_REQUEST)

        config.save()

        log_audit_event(
            'PLATFORM_SETTINGS_UPDATED',
            f"Admin {request.user.email} updated AI/Platform config ({config.llm_backend}, temp={config.temperature}, max_tokens={config.max_tokens}).",
            level='WARN',
            user_email=request.user.email,
            request=request,
        )

        return response.Response({
            'message': 'Platform configuration persisted successfully',
            'settings': {
                'llm_backend': config.llm_backend,
                'temperature': config.temperature,
                'max_tokens': config.max_tokens,
                'max_question_count': config.max_question_count,
                'daily_token_budget': config.daily_token_budget,
                'maintenance_mode': config.maintenance_mode,
            },
        })
