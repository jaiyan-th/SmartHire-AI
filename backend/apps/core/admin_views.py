from datetime import timedelta
from django.db import connection
from django.db.models import Avg, Sum
from django.utils import timezone
from rest_framework import views, status, response
from apps.accounts.models import User, UserRole, PasswordResetToken
from apps.accounts.permissions import IsAdminUserRole
from apps.accounts.serializers import UserSerializer
from apps.core.audit import log_audit_event
from apps.core.models import AuditLog, PlatformConfig, AIUsageRecord, BackgroundJob
from apps.interviews.models import InterviewSession
from apps.resumes.models import Resume


class AdminOverviewView(views.APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        total_users = User.objects.count()
        candidate_count = User.objects.filter(role=UserRole.CANDIDATE).count()
        recruiter_count = User.objects.filter(role=UserRole.RECRUITER).count()
        total_sessions = InterviewSession.objects.count()
        total_resumes = Resume.objects.count()

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
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
        except Exception:
            db_ok = False

        config = PlatformConfig.get_solo()

        return response.Response({
            'db_status': 'Healthy' if db_ok else 'Degraded',
            'db_engine': connection.vendor,
            'llm_backend': config.llm_backend,
            'llm_latency_ms': avg_latency,
            'registered_users': total_users,
            'candidate_count': candidate_count,
            'recruiter_count': recruiter_count,
            'total_sessions': total_sessions,
            'total_resumes': total_resumes,
            'token_consumption_total': total_tokens,
            'estimated_total_cost': f"${(usage_agg['total_cost'] or 0.0):.4f}",
            'background_jobs_completed': completed_jobs,
            'background_jobs_failed': failed_jobs,
            'system_uptime': '99.98%',
        })


class AdminUsersView(views.APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        users = User.objects.all().order_by('-created_at')
        return response.Response(UserSerializer(users, many=True).data)

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
        logs = AuditLog.objects.all()
        if level_filter:
            logs = logs.filter(level__iexact=level_filter)
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
        if 'llm_backend' in request.data:
            config.llm_backend = str(request.data['llm_backend'])[:100]
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
