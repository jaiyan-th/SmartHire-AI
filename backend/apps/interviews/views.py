from django.db import transaction
from django.utils import timezone
from rest_framework import views, status, response, permissions
from apps.core.audit import log_audit_event
from apps.core.models import PlatformConfig
from apps.evaluations.engine import evaluate_completed_interview
from apps.evaluations.models import Evaluation
from apps.evaluations.serializers import EvaluationSerializer
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


def _parse_int(value, default, min_val, max_val, field_name):
    if value is None or value == '':
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a valid integer.")
    return max(min_val, min(parsed, max_val))


def _parse_float(value, default, min_val, max_val, field_name):
    if value is None or value == '':
        return default
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a valid number.")
    return max(min_val, min(parsed, max_val))


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
            try:
                template = InterviewTemplate.objects.filter(id=template_id, is_active=True).first()
            except ValueError:
                return response.Response({'error': 'Invalid template_id format.'}, status=status.HTTP_400_BAD_REQUEST)
            if not template:
                return response.Response({'error': 'Interview template not found or inactive.'}, status=status.HTTP_404_NOT_FOUND)

        domain = str(request.data.get('domain') or (template.domain if template else 'Software Engineering')).strip()[:100]
        category = str(request.data.get('category') or (template.category if template else 'Technical')).strip()[:50]
        difficulty = str(request.data.get('difficulty') or (template.level if template else 'Mid-Level')).strip()[:50]

        try:
            duration_minutes = _parse_int(
                request.data.get('duration_minutes'),
                template.duration_minutes if template else 20,
                5,
                120,
                'duration_minutes',
            )
            requested_count = _parse_int(
                request.data.get('question_count'),
                template.question_count if template else 5,
                1,
                config.max_question_count,
                'question_count',
            )
        except ValueError as exc:
            return response.Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        focus_skills = request.data.get('focus_skills') or (template.target_skills if template else [])
        if isinstance(focus_skills, str):
            focus_skills = [s.strip() for s in focus_skills.split(',') if s.strip()]
        elif isinstance(focus_skills, list):
            focus_skills = [str(s).strip() for s in focus_skills if str(s).strip()][:20]
        else:
            focus_skills = []

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
                total_questions=requested_count,
                status=InterviewStatus.IN_PROGRESS,
                camera_enabled=camera_enabled,
                recording_consent=recording_consent,
                started_at=timezone.now(),
            )

            generated_questions = get_questions_for_interview(
                domain=domain,
                category=category,
                difficulty=difficulty,
                count=requested_count,
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

            if len(generated_questions) != requested_count:
                session.total_questions = len(generated_questions)
                session.save(update_fields=['total_questions'])

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

        elapsed = 0
        if session.started_at:
            elapsed = max(0, int((timezone.now() - session.started_at).total_seconds()))
        total_allowed = session.duration_minutes * 60
        remaining_total_seconds = max(0, total_allowed - elapsed)

        data = InterviewSessionSerializer(session).data
        data['remaining_total_seconds'] = remaining_total_seconds
        data['deadline_passed'] = bool(session.deadline and timezone.now() > session.deadline and session.status != InterviewStatus.COMPLETED)
        return response.Response(data)

    def delete(self, request, pk):
        try:
            session = InterviewSession.objects.get(id=pk)
        except (InterviewSession.DoesNotExist, ValueError):
            return response.Response({'error': 'Interview session not found.'}, status=status.HTTP_404_NOT_FOUND)

        if session.candidate_id != request.user.id and request.user.role != 'admin':
            return response.Response({'error': 'Only the session owner or an administrator can delete this session.'}, status=status.HTTP_403_FORBIDDEN)

        if session.is_recruiter_assigned and request.user.role != 'admin':
            return response.Response({'error': 'Recruiter-assigned assessments cannot be deleted by candidates.'}, status=status.HTTP_403_FORBIDDEN)

        session_short = str(session.id)[:8]
        session.delete()
        log_audit_event(
            'INTERVIEW_DELETED',
            f"User {request.user.email} deleted interview session {session_short}.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )
        return response.Response({'message': 'Interview session deleted.'}, status=status.HTTP_200_OK)


class CancelInterviewView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            session = InterviewSession.objects.get(id=pk)
        except (InterviewSession.DoesNotExist, ValueError):
            return response.Response({'error': 'Interview session not found.'}, status=status.HTTP_404_NOT_FOUND)

        if session.candidate_id != request.user.id and request.user.role != 'admin':
            return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        if session.status == InterviewStatus.COMPLETED:
            return response.Response({'error': 'Completed sessions cannot be cancelled.'}, status=status.HTTP_409_CONFLICT)

        session.status = InterviewStatus.CANCELLED
        session.save(update_fields=['status'])
        log_audit_event(
            'INTERVIEW_CANCELLED',
            f"Session {str(session.id)[:8]} cancelled by {request.user.email}.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )
        return response.Response({'session_id': str(session.id), 'status': session.status})


class ProctoringTelemetryView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            session = InterviewSession.objects.get(id=pk)
        except (InterviewSession.DoesNotExist, ValueError):
            return response.Response({'error': 'Interview session not found.'}, status=status.HTTP_404_NOT_FOUND)

        if session.candidate_id != request.user.id:
            return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        event_name = str(request.data.get('event_type') or 'FOCUS_CHECK').strip()[:60]
        try:
            tab_switches = _parse_int(request.data.get('tab_switches'), 0, 0, 500, 'tab_switches')
        except ValueError as exc:
            return response.Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if tab_switches >= 3 and not session.proctoring_flagged:
            session.proctoring_flagged = True
            session.save(update_fields=['proctoring_flagged'])

        log_audit_event(
            'PROCTORING_TELEMETRY',
            f"Session {str(session.id)[:8]} telemetry event '{event_name}' (tab_switches={tab_switches}, flagged={session.proctoring_flagged}).",
            level='WARN' if session.proctoring_flagged else 'INFO',
            user_email=request.user.email,
            request=request,
            metadata={'session_id': str(session.id), 'event_type': event_name, 'tab_switches': tab_switches},
        )
        return response.Response({
            'session_id': str(session.id),
            'proctoring_flagged': session.proctoring_flagged,
        })


class SubmitAnswerView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        session_id = request.data.get('session_id')
        question_id = request.data.get('question_id')
        input_mode = str(request.data.get('input_mode', 'speech')).strip().lower()
        if input_mode not in ('speech', 'code', 'text'):
            return response.Response({'error': "input_mode must be 'speech', 'code', or 'text'."}, status=status.HTTP_400_BAD_REQUEST)

        language = str(request.data.get('language', 'python')).strip()[:30]
        transcript_text = str(request.data.get('transcript_text') or '').strip()[:15000]
        code_text = str(request.data.get('code_text') or '').strip()[:25000]

        try:
            duration_seconds = _parse_int(request.data.get('duration_seconds'), 30, 1, 3600, 'duration_seconds')
            eye_contact = _parse_float(request.data.get('eye_contact_percentage'), 0.0, 0.0, 100.0, 'eye_contact_percentage')
            next_idx_raw = request.data.get('next_question_index')
            next_idx = _parse_int(next_idx_raw, None, 0, 100, 'next_question_index') if next_idx_raw is not None else None
        except ValueError as exc:
            return response.Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session = InterviewSession.objects.get(id=session_id)
        except (InterviewSession.DoesNotExist, ValueError):
            return response.Response({'error': 'Interview session not found.'}, status=status.HTTP_404_NOT_FOUND)

        if session.candidate_id != request.user.id and request.user.role != 'admin':
            return response.Response({'error': 'You cannot submit answers to another candidate session.'}, status=status.HTTP_403_FORBIDDEN)

        if session.status in (InterviewStatus.COMPLETED, InterviewStatus.CANCELLED, InterviewStatus.EXPIRED):
            return response.Response({'error': f'Session is already {session.status} and cannot accept answers.'}, status=status.HTTP_409_CONFLICT)

        if not session.camera_enabled:
            eye_contact = 0.0

        try:
            if question_id:
                question = InterviewQuestion.objects.get(id=question_id, session=session)
            else:
                questions_qs = session.questions.all().order_by('order')
                if session.current_question_index >= questions_qs.count():
                    return response.Response({'error': 'Question index out of bounds.'}, status=status.HTTP_400_BAD_REQUEST)
                question = questions_qs[session.current_question_index]
        except (InterviewQuestion.DoesNotExist, IndexError, ValueError):
            return response.Response({'error': 'Question not found for this session.'}, status=status.HTTP_400_BAD_REQUEST)

        combined_text = transcript_text if transcript_text else code_text
        speech_metrics = analyze_speech_content(transcript_text or combined_text, duration_seconds=duration_seconds)

        with transaction.atomic():
            if session.status == InterviewStatus.READY:
                session.status = InterviewStatus.IN_PROGRESS
                session.started_at = session.started_at or timezone.now()

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

            max_idx = max(0, session.total_questions - 1)
            if next_idx is not None:
                session.current_question_index = max(0, min(next_idx, max_idx))
            elif session.current_question_index < max_idx:
                session.current_question_index += 1
            session.save(update_fields=['status', 'started_at', 'current_question_index'])

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
        if not session_id:
            return response.Response({'error': 'session_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            try:
                session = InterviewSession.objects.select_for_update().get(id=session_id)
            except (InterviewSession.DoesNotExist, ValueError):
                return response.Response({'error': 'Session not found.'}, status=status.HTTP_404_NOT_FOUND)

            if session.candidate_id != request.user.id and request.user.role != 'admin':
                return response.Response({'error': 'You cannot finalize another candidate session.'}, status=status.HTTP_403_FORBIDDEN)

            if session.status == InterviewStatus.CANCELLED:
                return response.Response({'error': 'Cancelled sessions cannot be evaluated.'}, status=status.HTTP_409_CONFLICT)

            existing_eval = Evaluation.objects.filter(session=session).first()
            if session.status == InterviewStatus.COMPLETED and existing_eval:
                evaluation_data = EvaluationSerializer(existing_eval).data
                evaluation_data['id'] = str(existing_eval.id)
                return response.Response({
                    'message': 'Interview evaluation retrieved',
                    'session_id': str(session.id),
                    'evaluation': evaluation_data,
                }, status=status.HTTP_200_OK)

            session.status = InterviewStatus.COMPLETED
            session.completed_at = session.completed_at or timezone.now()
            session.save(update_fields=['status', 'completed_at'])
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
        sessions = (
            InterviewSession.objects.filter(candidate=request.user)
            .select_related('evaluation')
            .prefetch_related('questions', 'answers')
            .order_by('-created_at')
        )
        status_filter = (request.query_params.get('status') or '').strip()
        domain_filter = (request.query_params.get('domain') or '').strip()
        if status_filter:
            sessions = sessions.filter(status__iexact=status_filter)
        if domain_filter:
            sessions = sessions.filter(domain__iexact=domain_filter)

        results = []
        for s in sessions:
            try:
                eval_obj = s.evaluation
            except Evaluation.DoesNotExist:
                eval_obj = None
            item = InterviewSessionSerializer(s).data
            item['overall_score'] = eval_obj.overall_score if eval_obj else None
            item['rating_band'] = eval_obj.rating_band if eval_obj else None
            results.append(item)
        return response.Response(results)
