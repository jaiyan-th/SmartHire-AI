import csv
import uuid
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import views, status, response
from apps.accounts.models import User, UserRole
from apps.accounts.permissions import IsRecruiter
from apps.core.audit import log_audit_event
from apps.core.views import create_user_notification
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


def _safe_csv_cell(val):
    """Prevents CSV formula injection in spreadsheet tools."""
    s = '' if val is None else str(val)
    if s and s[0] in ('=', '+', '-', '@', '\t', '\r'):
        return "'" + s
    return s


def _authorized_recruiter_sessions(user):
    """
    Privacy enforcement: Recruiters never automatically see a candidate's private practice mocks.
    They only see sessions assigned by a recruiter OR explicitly shared by the candidate.
    """
    qs = (
        InterviewSession.objects.select_related('candidate', 'template', 'evaluation')
        .prefetch_related('questions', 'answers')
    )
    if user.role == UserRole.ADMIN:
        return qs.order_by('-created_at')
    return qs.filter(Q(is_recruiter_assigned=True) | Q(shared_with_recruiters=True)).order_by('-created_at')


def _get_session_eval(session):
    try:
        return session.evaluation
    except Evaluation.DoesNotExist:
        return None


class RecruiterCandidatesView(views.APIView):
    permission_classes = [IsRecruiter]

    def get(self, request):
        sessions = _authorized_recruiter_sessions(request.user)
        search_q = (request.query_params.get('q') or '').strip().lower()
        domain_filter = (request.query_params.get('domain') or '').strip()
        tier_filter = (request.query_params.get('tier') or '').strip()
        flagged_only = (request.query_params.get('flagged') or '').strip().lower() in ('1', 'true', 'yes')

        candidate_roster = []
        total_score_accum = 0.0
        scored_count = 0
        shortlisted_count = 0
        flagged_count = 0

        for s in sessions:
            eval_record = _get_session_eval(s)
            if eval_record:
                total_score_accum += eval_record.overall_score
                scored_count += 1
            if s.recruiter_status == RecruiterReviewStatus.SHORTLISTED:
                shortlisted_count += 1
            if s.proctoring_flagged or s.recruiter_status == RecruiterReviewStatus.FLAGGED:
                flagged_count += 1

            cand_name = (s.candidate.full_name if s.candidate and s.candidate.full_name else (s.candidate.email if s.candidate else 'Unknown'))
            cand_email = s.candidate.email if s.candidate else ''
            rating_band = eval_record.rating_band if eval_record else 'Pending'

            if search_q and search_q not in cand_name.lower() and search_q not in cand_email.lower():
                continue
            if domain_filter and domain_filter != 'all' and s.domain != domain_filter:
                continue
            if tier_filter and tier_filter != 'all' and rating_band != tier_filter:
                continue
            if flagged_only and not (s.proctoring_flagged or s.recruiter_status == RecruiterReviewStatus.FLAGGED):
                continue

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
                'rating_band': rating_band,
            }

            candidate_roster.append({
                'session_id': str(s.id),
                'candidate_name': cand_name,
                'candidate_email': cand_email,
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

        scored_values = sorted(
            [c['scores']['overall'] for c in candidate_roster if c['scores']['overall'] is not None],
            reverse=True,
        )
        total_scored = len(scored_values)
        for c in candidate_roster:
            ov = c['scores']['overall']
            if ov is not None and total_scored > 0:
                rank = scored_values.index(ov) + 1
                percentile = round(((total_scored - rank + 1) / total_scored) * 100) if total_scored > 1 else 100
                c['rank'] = rank
                c['percentile'] = percentile
            else:
                c['rank'] = None
                c['percentile'] = None

        sort_mode = (request.query_params.get('sort') or '').strip().lower()
        if sort_mode == 'rank':
            candidate_roster.sort(
                key=lambda item: (item['scores']['overall'] is not None, item['scores']['overall'] or -1),
                reverse=True,
            )

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
        candidate_email = str(request.data.get('candidate_email') or '').strip().lower()
        template_id = request.data.get('template_id')
        deadline_str = request.data.get('deadline')

        if not candidate_email:
            return response.Response({'error': 'candidate_email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        candidate = User.objects.filter(email__iexact=candidate_email, is_active=True).first()
        if not candidate:
            return response.Response({'error': f'No active candidate found with email {candidate_email}.'}, status=status.HTTP_404_NOT_FOUND)

        template = None
        if template_id:
            try:
                template = InterviewTemplate.objects.filter(id=template_id, is_active=True).first()
            except ValueError:
                return response.Response({'error': 'Invalid template_id format.'}, status=status.HTTP_400_BAD_REQUEST)
            if not template:
                return response.Response({'error': 'Assessment template not found.'}, status=status.HTTP_404_NOT_FOUND)

        domain = str(request.data.get('domain') or (template.domain if template else 'Software Engineering')).strip()[:100]
        category = str(request.data.get('category') or (template.category if template else 'Technical')).strip()[:50]
        difficulty = str(request.data.get('difficulty') or (template.level if template else 'Mid-Level')).strip()[:50]

        try:
            duration = max(5, min(int(request.data.get('duration_minutes') or (template.duration_minutes if template else 25)), 120))
            q_count = max(1, min(int(request.data.get('question_count') or (template.question_count if template else 5)), 20))
        except (TypeError, ValueError):
            return response.Response({'error': 'duration_minutes and question_count must be valid integers.'}, status=status.HTTP_400_BAD_REQUEST)

        skills = request.data.get('focus_skills') or (template.target_skills if template else [])
        if isinstance(skills, str):
            skills = [s.strip() for s in skills.split(',') if s.strip()]
        elif isinstance(skills, list):
            skills = [str(s).strip() for s in skills if str(s).strip()][:20]
        else:
            skills = []

        deadline = None
        if deadline_str:
            parsed = parse_datetime(str(deadline_str).strip())
            if not parsed:
                return response.Response({'error': 'Invalid deadline ISO datetime format.'}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
            deadline = parsed

        with transaction.atomic():
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

            questions = get_questions_for_interview(
                domain=domain,
                category=category,
                difficulty=difficulty,
                count=q_count,
                focus_skills=skills,
                user_email=request.user.email,
            )
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
            if len(questions) != q_count:
                session.total_questions = len(questions)
                session.save(update_fields=['total_questions'])

        log_audit_event(
            'ASSESSMENT_ASSIGNED',
            f"Recruiter {request.user.email} assigned {domain} assessment to {candidate.email}.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )
        due_note = f" Due by {deadline.strftime('%b %d, %Y %H:%M UTC')}." if deadline else ""
        create_user_notification(
            user=candidate,
            title=f'New Assessment Assigned · {domain}',
            message=f'{request.user.full_name or request.user.email} assigned you a {difficulty} {domain} assessment.{due_note}',
            category='assignment',
            link=f'/interview/room/{session.id}',
            send_email=True,
        )

        return response.Response({
            'message': f'Assessment assigned to {candidate.email}.',
            'session': InterviewSessionSerializer(session).data,
        }, status=status.HTTP_201_CREATED)


class RecruiterCompareView(views.APIView):
    permission_classes = [IsRecruiter]

    def get(self, request):
        ids_param = request.query_params.get('session_ids', '')
        raw_ids = [s.strip() for s in ids_param.split(',') if s.strip()]
        if len(raw_ids) < 2:
            return response.Response({'error': 'Provide at least 2 session_ids separated by comma.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_ids = []
        for sid in raw_ids[:4]:
            try:
                valid_ids.append(str(uuid.UUID(sid)))
            except ValueError:
                return response.Response({'error': f'Invalid UUID in session_ids: {sid}'}, status=status.HTTP_400_BAD_REQUEST)

        authorized = _authorized_recruiter_sessions(request.user).filter(id__in=valid_ids)
        compared = []
        for s in authorized:
            ev = _get_session_eval(s)
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
            ev = _get_session_eval(s)
            writer.writerow([
                _safe_csv_cell(str(s.id)),
                _safe_csv_cell(s.candidate.full_name if s.candidate else ''),
                _safe_csv_cell(s.candidate.email if s.candidate else ''),
                _safe_csv_cell(s.domain),
                _safe_csv_cell(s.difficulty),
                _safe_csv_cell(s.status),
                _safe_csv_cell(s.recruiter_status),
                _safe_csv_cell(ev.overall_score if ev else ''),
                _safe_csv_cell(ev.rating_band if ev else ''),
                _safe_csv_cell(ev.technical_relevance_score if ev else ''),
                _safe_csv_cell(ev.communication_score if ev else ''),
                _safe_csv_cell(ev.confidence_score if ev else ''),
                _safe_csv_cell(ev.professionalism_score if ev else ''),
            ])
        return resp


class RecruiterTemplateView(views.APIView):
    permission_classes = [IsRecruiter]

    def get(self, request):
        templates = InterviewTemplate.objects.select_related('created_by').filter(is_active=True).order_by('-created_at')
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


class RecruiterTemplateDetailView(views.APIView):
    permission_classes = [IsRecruiter]

    def _get_template(self, pk):
        try:
            return InterviewTemplate.objects.get(id=pk, is_active=True)
        except (InterviewTemplate.DoesNotExist, ValueError):
            return None

    def get(self, request, pk):
        tpl = self._get_template(pk)
        if not tpl:
            return response.Response({'error': 'Template not found.'}, status=status.HTTP_404_NOT_FOUND)
        return response.Response(InterviewTemplateSerializer(tpl).data)

    def patch(self, request, pk):
        tpl = self._get_template(pk)
        if not tpl:
            return response.Response({'error': 'Template not found.'}, status=status.HTTP_404_NOT_FOUND)
        if tpl.created_by_id != request.user.id and request.user.role != UserRole.ADMIN:
            return response.Response({'error': 'Only the template author or an admin can modify this template.'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data.copy()
        if isinstance(data.get('target_skills'), str):
            data['target_skills'] = [s.strip() for s in data['target_skills'].split(',') if s.strip()]
        serializer = InterviewTemplateSerializer(tpl, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return response.Response(serializer.data)
        return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        tpl = self._get_template(pk)
        if not tpl:
            return response.Response({'error': 'Template not found.'}, status=status.HTTP_404_NOT_FOUND)
        if tpl.created_by_id != request.user.id and request.user.role != UserRole.ADMIN:
            return response.Response({'error': 'Only the template author or an admin can delete this template.'}, status=status.HTTP_403_FORBIDDEN)
        tpl.is_active = False
        tpl.save(update_fields=['is_active'])
        log_audit_event(
            'TEMPLATE_ARCHIVED',
            f"Recruiter {request.user.email} archived template '{tpl.title}'.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )
        return response.Response({'message': 'Template archived successfully.'})
