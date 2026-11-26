from django.db import transaction
from django.utils import timezone
from rest_framework import views, status, response, permissions
from apps.core.audit import log_audit_event
from apps.core.models import PlatformConfig
from apps.evaluations.engine import evaluate_completed_interview
from .models import (
    InterviewSession,
    InterviewQuestion,
    InterviewAnswer,
    InterviewStatus,
    InterviewTemplate,
)
from .serializers import InterviewSessionSerializer, InterviewAnswerSerializer
from .question_bank import get_questions_for_interview
from .speech_analysis import analyze_speech_content


class StartInterviewView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'ai_ops'

    def post(self, request):
        config = PlatformConfig.get_solo()
        if config.maintenance_mode and request.user.role != 'admin':
            return response.Response(
                {'error': 'Platform is currently in maintenance mode. Please try again shortly.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        template_id = request.data.get('template_id')
        template = None
        if template_id:
            template = InterviewTemplate.objects.filter(id=template_id, is_active=True).first()

        domain = (request.data.get('domain') or (template.domain if template else 'Software Engineering')).strip()
        category = (request.data.get('category') or (template.category if template else 'Technical')).strip()
        difficulty = (request.data.get('difficulty') or (template.level if template else 'Mid-Level')).strip()
        duration_minutes = int(request.data.get('duration_minutes') or (template.duration_minutes if template else 20))
        focus_skills = request.data.get('focus_skills') or (template.target_skills if template else [])
        if isinstance(focus_skills, str):
            focus_skills = [s.strip() for s in focus_skills.split(',') if s.strip()]

        requested_count = int(request.data.get('question_count') or (template.question_count if template else 5))
        question_count = max(1, min(requested_count, config.max_question_count))
        camera_enabled = bool(request.data.get('camera_enabled', True))
        recording_consent = bool(request.data.get('recording_consent', True))

        if not recording_consent:
            return response.Response(
                {'error': 'Explicit recording/assessment consent is required to start an interview session.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            session = InterviewSession.objects.create(
                candidate=request.user,
                template=template,
                domain=domain,
                category=category,
                difficulty=difficulty,
                duration_minutes=duration_minutes,
                focus_skills=focus_skills,
                total_questions=question_count,
                status=InterviewStatus.IN_PROGRESS,
                camera_enabled=camera_enabled,
                recording_consent=recording_consent,
                started_at=timezone.now(),
            )

            generated_questions = get_questions_for_interview(
                domain=domain,
                category=category,
                difficulty=difficulty,
                count=question_count,
                focus_skills=focus_skills,
                user_email=request.user.email,
            )

            for idx, q_data in enumerate(generated_questions, start=1):
                InterviewQuestion.objects.create(
                    session=session,
                    order=idx,
                    category=q_data.get('category', category),
                    competency=q_data.get('competency', domain),
                    prompt=q_data['prompt'],
                    expected_keywords=q_data.get('expected_keywords', []),
                    model_answer=q_data.get('model_answer', ''),
                )

        log_audit_event(
            'INTERVIEW_STARTED',
            f"Interview session {str(session.id)[:8]} started by {request.user.email} ({domain} / {category}).",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )

        serializer = InterviewSessionSerializer(session)
        return response.Response({
            'message': 'Interview session successfully initialized',
            'session': serializer.data,
            'session_id': str(session.id),
        }, status=status.HTTP_201_CREATED)


class SessionDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            session = InterviewSession.objects.prefetch_related('questions', 'answers').get(id=pk)
        except (InterviewSession.DoesNotExist, ValueError):
            return response.Response({'error': 'Interview session not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_owner = session.candidate_id == request.user.id
        is_authorized_recruiter = (
            request.user.role in ('recruiter', 'admin')
            and (session.is_recruiter_assigned or session.shared_with_recruiters or request.user.role == 'admin')
        )
        if not (is_owner or is_authorized_recruiter):
            return response.Response({'error': 'Access denied for this interview session.'}, status=status.HTTP_403_FORBIDDEN)

        # Authoritative remaining server seconds calculation
        elapsed = 0
        if session.started_at:
            elapsed = max(0, int((timezone.now() - session.started_at).total_seconds()))
        total_allowed = session.duration_minutes * 60
        remaining_total_seconds = max(0, total_allowed - elapsed)

        data = InterviewSessionSerializer(session).data
        data['remaining_total_seconds'] = remaining_total_seconds
        return response.Response(data)


class SubmitAnswerView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        session_id = request.data.get('session_id')
        question_id = request.data.get('question_id')
        input_mode = request.data.get('input_mode', 'speech')
        language = request.data.get('language', 'python')
        transcript_text = (request.data.get('transcript_text') or '').strip()
        code_text = (request.data.get('code_text') or '').strip()
        duration_seconds = max(1, int(request.data.get('duration_seconds', 30) or 30))

        # Camera-optional fairness: do not invent high eye-contact if camera disabled
        raw_eye = request.data.get('eye_contact_percentage')
        eye_contact = float(raw_eye) if raw_eye is not None else 0.0

        try:
            session = InterviewSession.objects.get(id=session_id)
        except (InterviewSession.DoesNotExist, ValueError):
            return response.Response({'error': 'Interview session not found.'}, status=status.HTTP_404_NOT_FOUND)

        if session.candidate_id != request.user.id and request.user.role != 'admin':
            return response.Response({'error': 'You cannot submit answers to another candidate session.'}, status=status.HTTP_403_FORBIDDEN)

        if session.status in (InterviewStatus.COMPLETED, InterviewStatus.CANCELLED, InterviewStatus.EXPIRED):
            return response.Response({'error': f'Session is already {session.status} and cannot accept answers.'}, status=status.HTTP_409_CONFLICT)

        # If session is assigned/started on READY, move to IN_PROGRESS
        if session.status == InterviewStatus.READY:
            session.status = InterviewStatus.IN_PROGRESS
            session.started_at = session.started_at or timezone.now()

        try:
            if question_id:
                question = InterviewQuestion.objects.get(id=question_id, session=session)
            else:
                question = session.questions.all().order_by('order')[session.current_question_index]
        except (InterviewQuestion.DoesNotExist, IndexError, ValueError):
            return response.Response({'error': 'Question not found for this session.'}, status=status.HTTP_400_BAD_REQUEST)

        combined_text = transcript_text if transcript_text else code_text
        speech_metrics = analyze_speech_content(transcript_text or combined_text, duration_seconds=duration_seconds)

        # Idempotent upsert per (session, question) so edits/re-saves never duplicate
        answer, _ = InterviewAnswer.objects.update_or_create(
            session=session,
            question=question,
            defaults={
                'input_mode': input_mode,
                'language': language,
                'transcript_text': transcript_text,
                'code_text': code_text,
                'wpm': speech_metrics['wpm'],
                'filler_words_count': speech_metrics['filler_count'],
                'filler_words_detected': speech_metrics['fillers_detected'],
                'eye_contact_percentage': eye_contact,
                'duration_seconds': duration_seconds,
            },
        )

        # Update pointer if requested or advance naturally
        next_idx = request.data.get('next_question_index')
        if next_idx is not None:
            session.current_question_index = max(0, min(int(next_idx), session.total_questions - 1))
        elif session.current_question_index + 1 < session.total_questions:
            session.current_question_index += 1
        session.save()

        return response.Response({
            'message': 'Answer saved successfully',
            'answer': InterviewAnswerSerializer(answer).data,
            'speech_analysis': speech_metrics,
            'next_question_index': session.current_question_index,
        }, status=status.HTTP_200_OK)


class FinishInterviewView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        session_id = request.data.get('session_id')
        try:
            session = InterviewSession.objects.get(id=session_id)
        except (InterviewSession.DoesNotExist, ValueError):
            return response.Response({'error': 'Session not found.'}, status=status.HTTP_404_NOT_FOUND)

        if session.candidate_id != request.user.id and request.user.role != 'admin':
            return response.Response({'error': 'You cannot finalize another candidate session.'}, status=status.HTTP_403_FORBIDDEN)

        if session.status == InterviewStatus.CANCELLED:
            return response.Response({'error': 'Cancelled sessions cannot be evaluated.'}, status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            if session.status != InterviewStatus.COMPLETED:
                session.status = InterviewStatus.COMPLETED
                session.completed_at = timezone.now()
                session.save()
            evaluation_data = evaluate_completed_interview(session)

        log_audit_event(
            'INTERVIEW_COMPLETED',
            f"Session {str(session.id)[:8]} evaluated for {request.user.email} (Score: {evaluation_data['overall_score']}).",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )

        return response.Response({
            'message': 'Interview concluded and evaluated successfully',
            'session_id': str(session.id),
            'evaluation': evaluation_data,
        }, status=status.HTTP_200_OK)


class ShareSessionView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        try:
            session = InterviewSession.objects.get(id=pk)
        except (InterviewSession.DoesNotExist, ValueError):
            return response.Response({'error': 'Session not found.'}, status=status.HTTP_404_NOT_FOUND)

        if session.candidate_id != request.user.id:
            return response.Response({'error': 'Only the owning candidate can control private report sharing.'}, status=status.HTTP_403_FORBIDDEN)

        shared = bool(request.data.get('shared_with_recruiters', not session.shared_with_recruiters))
        session.shared_with_recruiters = shared
        session.save(update_fields=['shared_with_recruiters'])
        log_audit_event(
            'SHARING_PREFERENCE_UPDATED',
            f"Candidate {request.user.email} set shared_with_recruiters={shared} on session {str(session.id)[:8]}.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )
        return response.Response({
            'session_id': str(session.id),
            'shared_with_recruiters': session.shared_with_recruiters,
        })


class InterviewHistoryView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        sessions = InterviewSession.objects.filter(candidate=request.user).prefetch_related('questions', 'answers').order_by('-created_at')
        results = []
        for s in sessions:
            eval_obj = getattr(s, 'evaluation', None)
            item = InterviewSessionSerializer(s).data
            item['overall_score'] = eval_obj.overall_score if eval_obj else None
            item['rating_band'] = eval_obj.rating_band if eval_obj else None
            results.append(item)
        return response.Response(results)
