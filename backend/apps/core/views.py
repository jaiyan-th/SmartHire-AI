from datetime import timedelta
import os
import time
from django.conf import settings
from django.core.mail import send_mail
from django.db import connection
from django.utils import timezone
from rest_framework import views, status, response, permissions
from integrations.ai.provider import AIProviderService
from .models import MentorChatMessage, Notification, PlatformConfig

APP_START_MONOTONIC = time.monotonic()


def _detect_ai_mode():
    if os.getenv('GEMINI_API_KEY', '').strip():
        return 'gemini_configured'
    if os.getenv('GROQ_API_KEY', '').strip():
        return 'groq_configured'
    if os.getenv('OPENAI_API_KEY', '').strip():
        return 'openai_configured'
    if os.getenv('OLLAMA_BASE_URL', '').strip():
        return 'ollama_configured'
    return 'deterministic_fallback'


def _build_user_mentor_context(user) -> tuple:
    from apps.resumes.models import Resume
    from apps.evaluations.models import Evaluation
    from apps.interviews.models import InterviewSession, RoadmapMilestone

    latest_resume = Resume.objects.filter(user=user).order_by('-created_at').first()
    latest_eval = Evaluation.objects.filter(session__candidate=user).select_related('session').order_by('-created_at').first()
    latest_session = InterviewSession.objects.filter(candidate=user).order_by('-created_at').first()
    total_sessions = InterviewSession.objects.filter(candidate=user, status='completed').count()
    completed_milestones = RoadmapMilestone.objects.filter(user=user, completed=True).count()

    extracted_skills = []
    if latest_resume and isinstance(latest_resume.skills_extracted, dict):
        extracted_skills = [s for sub in latest_resume.skills_extracted.values() for s in sub]

    target_role = (
        (latest_eval.session.domain if latest_eval else None)
        or (latest_session.domain if latest_session else None)
        or (latest_resume.target_role if latest_resume else None)
        or getattr(user, 'target_role', '')
        or ''
    )

    context = {
        'first_name': (getattr(user, 'full_name', '') or '').split(' ')[0] or 'there',
        'role': getattr(user, 'role', 'candidate'),
        'target_role': target_role,
        'has_resume': latest_resume is not None,
        'resume_file_name': latest_resume.file_name if latest_resume else None,
        'ats_score': latest_resume.ats_score if latest_resume else None,
        'extracted_skills': extracted_skills[:20],
        'missing_skills': list(latest_resume.missing_skills[:10]) if latest_resume and latest_resume.missing_skills else [],
        'has_evaluation': latest_eval is not None,
        'completed_sessions': total_sessions,
        'completed_milestones': completed_milestones,
        'latest_evaluation': (
            {
                'domain': latest_eval.session.domain,
                'difficulty': latest_eval.session.difficulty,
                'overall_score': latest_eval.overall_score,
                'rating_band': latest_eval.rating_band,
                'technical_score': latest_eval.technical_relevance_score,
                'communication_score': latest_eval.communication_score,
                'confidence_score': latest_eval.confidence_score,
                'professionalism_score': latest_eval.professionalism_score,
                'weaknesses': list(latest_eval.weaknesses or [])[:4],
                'suggestions': list(latest_eval.improvement_suggestions or [])[:3],
            }
            if latest_eval
            else None
        ),
    }

    suggestions = []
    if not latest_resume:
        suggestions.append('How do I optimize my resume for ATS?')
    else:
        suggestions.append(f'How do I improve my {latest_resume.ats_score}% ATS match?')
    if latest_resume and latest_resume.missing_skills:
        suggestions.append(f'How should I prepare for {latest_resume.missing_skills[0]}?')
    if latest_eval:
        suggestions.append(f'Explain my {latest_eval.overall_score}/100 interview score')
    elif target_role:
        suggestions.append(f'Give me a prep checklist for {target_role}')
    else:
        suggestions.append('How should I prepare for my first mock interview?')
    suggestions.append('How do I structure STAR behavioral answers?')

    summary = {
        'target_role': target_role,
        'has_resume': latest_resume is not None,
        'ats_score': latest_resume.ats_score if latest_resume else None,
        'completed_sessions': total_sessions,
        'latest_score': latest_eval.overall_score if latest_eval else None,
    }
    return context, suggestions[:4], summary


class LiveHealthView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return response.Response({
            'status': 'live',
            'service': 'smarthire-ai-api',
            'version': '1.0.0',
            'uptime_seconds': int(time.monotonic() - APP_START_MONOTONIC),
        }, status=status.HTTP_200_OK)


class ReadyHealthView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        start = time.monotonic()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            db_latency_ms = round((time.monotonic() - start) * 1000, 2)
            db_status = "connected"
        except Exception as e:
            return response.Response({
                'status': 'degraded',
                'database': f'error: {str(e)}',
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        config = PlatformConfig.get_solo()
        return response.Response({
            'status': 'ready',
            'database': db_status,
            'db_latency_ms': db_latency_ms,
            'llm_engine': _detect_ai_mode(),
            'speech_engine': 'operational',
            'maintenance_mode': config.maintenance_mode,
        }, status=status.HTTP_200_OK)


class MentorChatView(views.APIView):
    """
    Personalized career & interview doubt-resolution chatbot endpoint.
    Accepts text or voice-transcribed questions and returns text-only grounded answers.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'ai_ops'

    @staticmethod
    def _serialize(msg: MentorChatMessage) -> dict:
        return {
            'id': str(msg.id),
            'role': msg.role,
            'content': msg.content,
            'input_source': msg.input_source,
            'provider': msg.provider,
            'created_at': msg.created_at.isoformat(),
        }

    @staticmethod
    def _pair_qa_history(ordered_messages: list) -> list:
        pairs = []
        i = 0
        while i < len(ordered_messages):
            msg = ordered_messages[i]
            if msg.role == 'user':
                answer_msg = (
                    ordered_messages[i + 1]
                    if (i + 1 < len(ordered_messages) and ordered_messages[i + 1].role == 'assistant')
                    else None
                )
                pairs.append({
                    'question_id': str(msg.id),
                    'answer_id': str(answer_msg.id) if answer_msg else None,
                    'question': msg.content,
                    'answer': answer_msg.content if answer_msg else '',
                    'input_source': msg.input_source,
                    'provider': answer_msg.provider if answer_msg else msg.provider,
                    'created_at': msg.created_at.isoformat(),
                })
                i += 2 if answer_msg else 1
            else:
                i += 1
        pairs.reverse()  # Newest doubts first for quick referral
        return pairs

    def get(self, request):
        ctx, suggestions, summary = _build_user_mentor_context(request.user)
        search_q = str(request.query_params.get('q') or '').strip().lower()

        all_recent = list(
            MentorChatMessage.objects.filter(user=request.user).order_by('-created_at')[:200]
        )
        all_recent.reverse()

        qa_history = self._pair_qa_history(all_recent)
        if search_q:
            # Search across full persisted database history if query is provided
            full_msgs = list(MentorChatMessage.objects.filter(user=request.user).order_by('created_at'))
            full_pairs = self._pair_qa_history(full_msgs)
            qa_history = [
                p for p in full_pairs
                if search_q in p['question'].lower() or search_q in p['answer'].lower()
            ]

        history = [self._serialize(m) for m in all_recent]
        return response.Response({
            'messages': history,
            'qa_history': qa_history,
            'total_questions': MentorChatMessage.objects.filter(user=request.user, role='user').count(),
            'context_summary': summary,
            'suggested_prompts': suggestions,
        })

    def post(self, request):
        message_text = str(request.data.get('message') or '').strip()
        if not message_text:
            return response.Response({'error': 'Message text is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(message_text) > 2000:
            return response.Response({'error': 'Message exceeds 2000 character limit.'}, status=status.HTTP_400_BAD_REQUEST)

        input_source = 'voice' if str(request.data.get('input_source') or '').lower() == 'voice' else 'text'
        ctx, suggestions, summary = _build_user_mentor_context(request.user)

        recent_turns = list(
            MentorChatMessage.objects.filter(user=request.user)
            .order_by('-created_at')
            .values('role', 'content')[:8]
        )
        recent_turns.reverse()

        ai_res = AIProviderService(user_email=request.user.email).mentor_chat(
            user_context=ctx,
            question=message_text,
            recent_history=recent_turns,
        )

        user_msg = MentorChatMessage.objects.create(
            user=request.user,
            role='user',
            content=message_text,
            input_source=input_source,
            provider=input_source,
        )
        bot_msg = MentorChatMessage.objects.create(
            user=request.user,
            role='assistant',
            content=ai_res['reply'],
            input_source='text',
            provider=ai_res.get('provider', 'personalized_engine'),
        )

        return response.Response({
            'user_message': self._serialize(user_msg),
            'assistant_message': self._serialize(bot_msg),
            'context_summary': summary,
            'suggested_prompts': suggestions,
        }, status=status.HTTP_200_OK)

    def delete(self, request):
        question_id = str(request.query_params.get('question_id') or '').strip()
        if question_id:
            target_q = MentorChatMessage.objects.filter(user=request.user, id=question_id, role='user').first()
            if not target_q:
                return response.Response({'error': 'Saved doubt not found.'}, status=status.HTTP_404_NOT_FOUND)
            # Delete matching assistant reply immediately following this user question
            next_msg = (
                MentorChatMessage.objects.filter(user=request.user, created_at__gt=target_q.created_at)
                .order_by('created_at')
                .first()
            )
            if next_msg and next_msg.role == 'assistant':
                next_msg.delete()
            target_q.delete()
            ctx, suggestions, summary = _build_user_mentor_context(request.user)
            return response.Response({
                'message': 'Saved doubt removed.',
                'context_summary': summary,
                'suggested_prompts': suggestions,
            }, status=status.HTTP_200_OK)

        MentorChatMessage.objects.filter(user=request.user).delete()
        ctx, suggestions, summary = _build_user_mentor_context(request.user)
        return response.Response({
            'message': 'Conversation cleared.',
            'context_summary': summary,
            'suggested_prompts': suggestions,
        }, status=status.HTTP_200_OK)


def create_user_notification(user, title: str, message: str, category: str = 'alert', link: str = '', send_email: bool = False):
    """Creates an in-app Notification record and optionally sends an email reminder/alert."""
    if not user:
        return None
    notif = Notification.objects.create(
        user=user,
        title=title[:160],
        message=message,
        category=category[:30],
        link=link[:255],
    )
    if send_email and getattr(user, 'email', ''):
        try:
            send_mail(
                subject=f"[SmartHire AI] {title}",
                message=message,
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@smarthire.local'),
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception:
            pass
    return notif


class NotificationListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def _serialize(n: Notification) -> dict:
        return {
            'id': str(n.id),
            'title': n.title,
            'message': n.message,
            'category': n.category,
            'link': n.link,
            'is_read': n.is_read,
            'created_at': n.created_at.isoformat(),
        }

    def get(self, request):
        from apps.interviews.models import InterviewSession, InterviewStatus

        # Generate proactive due-soon interview deadline reminders (once per session within 48h window)
        now = timezone.now()
        due_soon = InterviewSession.objects.filter(
            candidate=request.user,
            status__in=[InterviewStatus.READY, InterviewStatus.IN_PROGRESS],
            deadline__isnull=False,
            deadline__gte=now,
            deadline__lte=now + timedelta(hours=48),
        )
        for sess in due_soon:
            link = f'/interview/room/{sess.id}'
            if not Notification.objects.filter(user=request.user, category='reminder', link=link).exists():
                hrs = max(1, int((sess.deadline - now).total_seconds() // 3600))
                create_user_notification(
                    user=request.user,
                    title=f'Interview deadline in ~{hrs}h',
                    message=f'Your {sess.domain} ({sess.difficulty}) assessment is due by {sess.deadline.strftime("%b %d, %H:%M UTC")}.',
                    category='reminder',
                    link=link,
                )

        items = list(Notification.objects.filter(user=request.user)[:30])
        unread = Notification.objects.filter(user=request.user, is_read=False).count()
        return response.Response({
            'notifications': [self._serialize(n) for n in items],
            'unread_count': unread,
        })

    def patch(self, request):
        notif_id = str(request.data.get('id') or '').strip()
        if notif_id:
            Notification.objects.filter(user=request.user, id=notif_id).update(is_read=True)
        else:
            Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        unread = Notification.objects.filter(user=request.user, is_read=False).count()
        return response.Response({'unread_count': unread}, status=status.HTTP_200_OK)

    def delete(self, request):
        Notification.objects.filter(user=request.user, is_read=True).delete()
        return response.Response({'message': 'Read notifications cleared.'}, status=status.HTTP_200_OK)
