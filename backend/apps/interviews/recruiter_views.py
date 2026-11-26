import csv
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import views, status, response
from apps.accounts.models import User, UserRole
from apps.accounts.permissions import IsRecruiter
from apps.core.audit import log_audit_event
from apps.evaluations.models import Evaluation
from .models import (
    InterviewSession,
    InterviewTemplate,
    InterviewQuestion,
    InterviewStatus,
    RecruiterReviewStatus,
)
from .serializers import InterviewTemplateSerializer, InterviewSessionSerializer
from .question_bank import get_questions_for_interview


def _authorized_recruiter_sessions(user):
    """
    Privacy enforcement: Recruiters never automatically see a candidate's private practice mocks.
    They only see sessions assigned by a recruiter OR explicitly shared by the candidate.
    """
    qs = InterviewSession.objects.select_related('candidate', 'template').prefetch_related('questions', 'answers')
    if user.role == UserRole.ADMIN:
        return qs.order_by('-created_at')
    return qs.filter(Q(is_recruiter_assigned=True) | Q(shared_with_recruiters=True)).order_by('-created_at')


class RecruiterCandidatesView(views.APIView):
    permission_classes = [IsRecruiter]

    def get(self, request):
        sessions = _authorized_recruiter_sessions(request.user)
        candidate_roster = []
        total_score_accum = 0.0
        scored_count = 0
        shortlisted_count = 0
        flagged_count = 0

        for s in sessions:
            eval_record = Evaluation.objects.filter(session=s).first()
            if eval_record:
                total_score_accum += eval_record.overall_score
                scored_count += 1
            if s.recruiter_status == RecruiterReviewStatus.SHORTLISTED:
                shortlisted_count += 1
            if s.proctoring_flagged or s.recruiter_status == RecruiterReviewStatus.FLAGGED:
                flagged_count += 1

            answers = list(s.answers.all())
            avg_wpm = round(sum(a.wpm for a in answers) / len(answers)) if answers else 0
            total_fillers = sum(a.filler_words_count for a in answers)
            cam_answers = [a.eye_contact_percentage for a in answers if a.eye_contact_percentage > 0]
            avg_eye = round(sum(cam_answers) / len(cam_answers), 1) if cam_answers else None

            scores = {
                'overall': eval_record.overall_score if eval_record else None,
                'technical': eval_record.technical_relevance_score if eval_record else None,
                'communication': eval_record.communication_score if eval_record else None,
                'confidence': eval_record.confidence_score if eval_record else None,
                'professionalism': eval_record.professionalism_score if eval_record else None,
                'rating_band': eval_record.rating_band if eval_record else 'Pending',
            }

            candidate_roster.append({
                'session_id': str(s.id),
                'candidate_name': (s.candidate.full_name if s.candidate and s.candidate.full_name else (s.candidate.email if s.candidate else 'Unknown')),
                'candidate_email': s.candidate.email if s.candidate else '',
                'domain': s.domain,
                'difficulty': s.difficulty,
                'target_role': f"{s.domain} ({s.difficulty})",
                'date': s.created_at.strftime('%Y-%m-%d'),
                'scores': scores,
                'proctoring_flagged': s.proctoring_flagged,
                'recruiter_status': s.recruiter_status,
                'recruiter_notes': s.recruiter_notes,
                'is_recruiter_assigned': s.is_recruiter_assigned,
                'shared_with_recruiters': s.shared_with_recruiters,
                'status': s.status,
                'telemetry': {
                    'avg_wpm': avg_wpm,
                    'total_fillers': total_fillers,
                    'avg_eye_contact': avg_eye,
                    'answered_count': len(answers),
                    'total_questions': s.total_questions,
                },
                'question_evaluations': eval_record.question_evaluations if eval_record else [],
                'strengths': eval_record.strengths if eval_record else [],
                'weaknesses': eval_record.weaknesses if eval_record else [],
            })

        avg_composite = round(total_score_accum / scored_count, 1) if scored_count else 0.0

        return response.Response({
            'candidates': candidate_roster,
            'total_count': len(candidate_roster),
            'stats': {
                'evaluated_count': scored_count,
                'average_composite': avg_composite,
                'shortlisted_count': shortlisted_count,
                'flagged_count': flagged_count,
            },
        })


class RecruiterReviewSessionView(views.APIView):
    permission_classes = [IsRecruiter]

    def patch(self, request, pk):
        sessions = _authorized_recruiter_sessions(request.user)
        session = sessions.filter(id=pk).first()
        if not session:
            return response.Response({'error': 'Authorized session not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('recruiter_status')
        notes = request.data.get('recruiter_notes')
        valid_statuses = [choice[0] for choice in RecruiterReviewStatus.choices]

        if new_status and new_status not in valid_statuses:
            return response.Response({'error': f'Invalid status. Must be one of: {valid_statuses}'}, status=status.HTTP_400_BAD_REQUEST)

        if new_status:
            session.recruiter_status = new_status
            if new_status == RecruiterReviewStatus.FLAGGED:
                session.proctoring_flagged = True
        if notes is not None:
            session.recruiter_notes = str(notes)[:2000]
        session.reviewed_by = request.user
        session.save()

        log_audit_event(
            'RECRUITER_REVIEW_UPDATED',
            f"Recruiter {request.user.email} set status='{session.recruiter_status}' on session {str(session.id)[:8]}.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )

        return response.Response({
            'session_id': str(session.id),
            'recruiter_status': session.recruiter_status,
            'recruiter_notes': session.recruiter_notes,
            'proctoring_flagged': session.proctoring_flagged,
        })


class RecruiterAssignAssessmentView(views.APIView):
    permission_classes = [IsRecruiter]

    def post(self, request):
        candidate_email = (request.data.get('candidate_email') or '').strip().lower()
        template_id = request.data.get('template_id')
        deadline_str = request.data.get('deadline')

        if not candidate_email:
            return response.Response({'error': 'candidate_email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        candidate = User.objects.filter(email__iexact=candidate_email, is_active=True).first()
        if not candidate:
            return response.Response({'error': f'No active candidate found with email {candidate_email}.'}, status=status.HTTP_404_NOT_FOUND)

        template = InterviewTemplate.objects.filter(id=template_id).first() if template_id else None
        domain = (request.data.get('domain') or (template.domain if template else 'Software Engineering')).strip()
        category = (request.data.get('category') or (template.category if template else 'Technical')).strip()
        difficulty = (request.data.get('difficulty') or (template.level if template else 'Mid-Level')).strip()
        duration = int(request.data.get('duration_minutes') or (template.duration_minutes if template else 25))
        q_count = int(request.data.get('question_count') or (template.question_count if template else 5))
        skills = request.data.get('focus_skills') or (template.target_skills if template else [])

        deadline = None
        if deadline_str:
            try:
                deadline = timezone.datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
            except ValueError:
                pass

        session = InterviewSession.objects.create(
            candidate=candidate,
            assigned_by=request.user,
            template=template,
            domain=domain,
            category=category,
            difficulty=difficulty,
            duration_minutes=duration,
            focus_skills=skills,
            total_questions=q_count,
            status=InterviewStatus.READY,
            is_recruiter_assigned=True,
            deadline=deadline,
        )

        questions = get_questions_for_interview(domain=domain, category=category, difficulty=difficulty, count=q_count, focus_skills=skills, user_email=request.user.email)
        for idx, q in enumerate(questions, start=1):
            InterviewQuestion.objects.create(
                session=session,
                order=idx,
                category=q.get('category', category),
                competency=q.get('competency', domain),
                prompt=q['prompt'],
                expected_keywords=q.get('expected_keywords', []),
                model_answer=q.get('model_answer', ''),
            )

        log_audit_event(
            'ASSESSMENT_ASSIGNED',
            f"Recruiter {request.user.email} assigned {domain} assessment to {candidate.email}.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )

        return response.Response({
            'message': f'Assessment assigned to {candidate.email}.',
            'session': InterviewSessionSerializer(session).data,
        }, status=status.HTTP_201_CREATED)


class RecruiterCompareView(views.APIView):
    permission_classes = [IsRecruiter]

    def get(self, request):
        ids_param = request.query_params.get('session_ids', '')
        session_ids = [s.strip() for s in ids_param.split(',') if s.strip()]
        if len(session_ids) < 2:
            return response.Response({'error': 'Provide at least 2 session_ids separated by comma.'}, status=status.HTTP_400_BAD_REQUEST)

        authorized = _authorized_recruiter_sessions(request.user).filter(id__in=session_ids[:4])
        compared = []
        for s in authorized:
            ev = Evaluation.objects.filter(session=s).first()
            compared.append({
                'session_id': str(s.id),
                'candidate_name': s.candidate.full_name if s.candidate else 'Candidate',
                'candidate_email': s.candidate.email if s.candidate else '',
                'domain': s.domain,
                'difficulty': s.difficulty,
                'recruiter_status': s.recruiter_status,
                'overall_score': ev.overall_score if ev else None,
                'rating_band': ev.rating_band if ev else 'Pending',
                'technical_relevance_score': ev.technical_relevance_score if ev else None,
                'communication_score': ev.communication_score if ev else None,
                'confidence_score': ev.confidence_score if ev else None,
                'professionalism_score': ev.professionalism_score if ev else None,
            })

        return response.Response({'comparisons': compared})


class RecruiterExportCsvView(views.APIView):
    permission_classes = [IsRecruiter]

    def get(self, request):
        sessions = _authorized_recruiter_sessions(request.user)
        resp = HttpResponse(content_type='text/csv')
        resp['Content-Disposition'] = 'attachment; filename="smarthire_candidates_export.csv"'
        writer = csv.writer(resp)
        writer.writerow(['Session ID', 'Candidate Name', 'Email', 'Domain', 'Difficulty', 'Status', 'Review Status', 'Overall Score', 'Rating Band', 'Technical', 'Communication', 'Confidence', 'Professionalism'])

        for s in sessions:
            ev = Evaluation.objects.filter(session=s).first()
            writer.writerow([
                str(s.id),
                s.candidate.full_name if s.candidate else '',
                s.candidate.email if s.candidate else '',
                s.domain,
                s.difficulty,
                s.status,
                s.recruiter_status,
                ev.overall_score if ev else '',
                ev.rating_band if ev else '',
                ev.technical_relevance_score if ev else '',
                ev.communication_score if ev else '',
                ev.confidence_score if ev else '',
                ev.professionalism_score if ev else '',
            ])
        return resp


class RecruiterTemplateView(views.APIView):
    permission_classes = [IsRecruiter]

    def get(self, request):
        templates = InterviewTemplate.objects.filter(is_active=True).order_by('-created_at')
        return response.Response(InterviewTemplateSerializer(templates, many=True).data)

    def post(self, request):
        data = request.data.copy()
        skills = data.get('target_skills', [])
        if isinstance(skills, str):
            data['target_skills'] = [s.strip() for s in skills.split(',') if s.strip()]
        serializer = InterviewTemplateSerializer(data=data)
        if serializer.is_valid():
            template = serializer.save(created_by=request.user)
            log_audit_event(
                'TEMPLATE_CREATED',
                f"Recruiter {request.user.email} created template '{template.title}'.",
                level='INFO',
                user_email=request.user.email,
                request=request,
            )
            return response.Response(InterviewTemplateSerializer(template).data, status=status.HTTP_201_CREATED)
        return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
