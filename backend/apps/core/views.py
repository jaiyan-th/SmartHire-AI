import os
import time
from django.db import connection
from rest_framework import views, status, response, permissions
from integrations.ai.provider import AIProviderService
from .models import MentorChatMessage, PlatformConfig

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
    total_sessions = InterviewSession.objects.filter(candidate=user, status='completed').count()
    completed_milestones = RoadmapMilestone.objects.filter(user=user, completed=True).count()

    extracted_skills = []
    if latest_resume and isinstance(latest_resume.skills_extracted, dict):
        extracted_skills = [s for sub in latest_resume.skills_extracted.values() for s in sub]

    target_role = (
        (latest_resume.target_role if latest_resume else None)
        or getattr(user, 'target_role', '')
        or 'Software Engineering'
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
    else:
        suggestions.append(f'Give me a prep checklist for {target_role}')
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

    def get(self, request):
        ctx, suggestions, summary = _build_user_mentor_context(request.user)
        messages_qs = MentorChatMessage.objects.filter(user=request.user).order_by('created_at')
        history = [self._serialize(m) for m in messages_qs[:60]]
        return response.Response({
            'messages': history,
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
        MentorChatMessage.objects.filter(user=request.user).delete()
        ctx, suggestions, summary = _build_user_mentor_context(request.user)
        return response.Response({
            'message': 'Conversation cleared.',
            'context_summary': summary,
            'suggested_prompts': suggestions,
        }, status=status.HTTP_200_OK)
