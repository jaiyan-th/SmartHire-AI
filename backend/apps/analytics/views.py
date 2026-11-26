import re
import uuid
from django.db.models import Q
from rest_framework import views, status, response, permissions
from apps.evaluations.models import Evaluation
from apps.interviews.models import InterviewSession, RoadmapMilestone
from apps.resumes.models import Resume


class InsightsAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        session_id = request.query_params.get('session_id')
        target_eval = None
        eval_owner = request.user

        if session_id:
            try:
                uuid.UUID(str(session_id))
            except ValueError:
                return response.Response({'error': 'Invalid session_id format.'}, status=status.HTTP_400_BAD_REQUEST)

            session = InterviewSession.objects.select_related('candidate').filter(id=session_id).first()
            if not session:
                return response.Response({'error': 'Interview session not found.'}, status=status.HTTP_404_NOT_FOUND)

            is_owner = session.candidate_id == request.user.id
            is_authorized_recruiter = (
                request.user.role in ('recruiter', 'admin')
                and (session.is_recruiter_assigned or session.shared_with_recruiters or request.user.role == 'admin')
            )
            if not (is_owner or is_authorized_recruiter):
                return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

            eval_owner = session.candidate or request.user
            target_eval = (
                Evaluation.objects.select_related('session')
                .prefetch_related('session__answers')
                .filter(session=session)
                .first()
            )
        else:
            target_eval = (
                Evaluation.objects.select_related('session')
                .prefetch_related('session__answers')
                .filter(session__candidate=request.user)
                .order_by('-created_at')
                .first()
            )

        if not target_eval:
            return response.Response({
                'has_data': False,
                'overall_score': 0,
                'rating_band': 'No Data',
                'total_sessions': 0,
                'progression': [],
                'radar': [],
                'pillars': {},
                'question_evaluations': [],
                'history': [],
                'feedback': {'strengths': [], 'weaknesses': [], 'suggestions': [], 'resources': []},
            })

        eval_qs = (
            Evaluation.objects.select_related('session')
            .prefetch_related('session__answers')
            .filter(session__candidate=eval_owner)
        )
        if eval_owner.id != request.user.id and request.user.role == 'recruiter':
            eval_qs = eval_qs.filter(Q(session__is_recruiter_assigned=True) | Q(session__shared_with_recruiters=True))
        user_evals = list(eval_qs.order_by('created_at'))

        progression_data = [
            {
                'session_id': str(ev.session.id),
                'session': f"Session {idx + 1}",
                'overall': ev.overall_score,
                'technical': ev.technical_relevance_score,
                'communication': ev.communication_score,
                'confidence': ev.confidence_score,
                'professionalism': ev.professionalism_score,
                'date': ev.created_at.strftime('%d %b'),
            }
            for idx, ev in enumerate(user_evals[-10:])
        ]

        answers = list(target_eval.session.answers.all())
        wpm_vals = [a.wpm for a in answers if a.wpm > 0]
        avg_wpm = round(sum(wpm_vals) / len(wpm_vals)) if wpm_vals else 0
        total_fillers = sum(a.filler_words_count for a in answers)
        eye_vals = [a.eye_contact_percentage for a in answers if a.eye_contact_percentage > 0]
        avg_eye = round(sum(eye_vals) / len(eye_vals), 1) if eye_vals else None

        radar_data = [
            {'subject': 'Technical', 'candidate': target_eval.technical_relevance_score, 'benchmark': 75},
            {'subject': 'Communication', 'candidate': target_eval.communication_score, 'benchmark': 75},
            {'subject': 'Confidence', 'candidate': target_eval.confidence_score, 'benchmark': 72},
            {'subject': 'Professionalism', 'candidate': target_eval.professionalism_score, 'benchmark': 78},
            {'subject': 'Overall', 'candidate': target_eval.overall_score, 'benchmark': 75},
        ]

        history_list = [
            {
                'session_id': str(ev.session.id),
                'domain': ev.session.domain,
                'category': ev.session.category,
                'difficulty': ev.session.difficulty,
                'overall_score': ev.overall_score,
                'rating_band': ev.rating_band,
                'shared_with_recruiters': ev.session.shared_with_recruiters,
                'date': ev.created_at.strftime('%Y-%m-%d %H:%M'),
            }
            for ev in reversed(user_evals)
        ]

        return response.Response({
            'has_data': True,
            'session_id': str(target_eval.session.id),
            'domain': target_eval.session.domain,
            'difficulty': target_eval.session.difficulty,
            'shared_with_recruiters': target_eval.session.shared_with_recruiters,
            'total_sessions': len(user_evals),
            'overall_score': target_eval.overall_score,
            'rating_band': target_eval.rating_band,
            'pillars': {
                'technical': {
                    'weight': '30%',
                    'score': target_eval.technical_relevance_score,
                    'metric': f"{target_eval.technical_relevance_score}% Relevance",
                },
                'communication': {
                    'weight': '30%',
                    'score': target_eval.communication_score,
                    'metric': f"{avg_wpm} Avg WPM, {total_fillers} Fillers" if avg_wpm else f"{total_fillers} Fillers (Written/Code)",
                },
                'confidence': {
                    'weight': '25%',
                    'score': target_eval.confidence_score,
                    'metric': f"{avg_eye}% Gaze Stability" if avg_eye is not None else "Speech Fluency Based (Camera Off)",
                },
                'professionalism': {
                    'weight': '15%',
                    'score': target_eval.professionalism_score,
                    'metric': "Time & Structure Adherence",
                },
            },
            'progression': progression_data,
            'radar': radar_data,
            'question_evaluations': target_eval.question_evaluations,
            'history': history_list,
            'feedback': {
                'strengths': target_eval.strengths,
                'weaknesses': target_eval.weaknesses,
                'suggestions': target_eval.improvement_suggestions,
                'practice_recommendations': target_eval.practice_recommendations,
                'resources': target_eval.learning_resources,
            },
        })


class SkillGapView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        latest_resume = Resume.objects.filter(user=request.user).order_by('-created_at').first()
        latest_eval = Evaluation.objects.filter(session__candidate=request.user).order_by('-created_at').first()
        saved_milestones = {
            m.milestone_key: m.completed
            for m in RoadmapMilestone.objects.filter(user=request.user)
        }

        target_role = (latest_resume.target_role if latest_resume else request.user.target_role) or 'Full Stack Software Engineer'

        if not latest_resume and not latest_eval:
            return response.Response({
                'has_data': False,
                'target_role': target_role,
                'overall_match_percentage': 0,
                'missing_skills': [],
                'role_comparison': [],
                'weak_areas': [],
                'roadmap': [],
            })

        extracted_flat = []
        if latest_resume and isinstance(latest_resume.skills_extracted, dict):
            extracted_flat = [s.lower() for sublist in latest_resume.skills_extracted.values() for s in sublist]

        missing_list = list(latest_resume.missing_skills) if (latest_resume and latest_resume.missing_skills) else []
        role_lower = target_role.lower()

        has_eval = latest_eval is not None
        has_resume = latest_resume is not None
        tech_score = int(round(latest_eval.technical_relevance_score)) if latest_eval else 0
        comm_score = int(round(latest_eval.communication_score)) if latest_eval else 0

        def _skill_score(skill_keywords):
            if has_resume and any(k in extracted_flat for k in skill_keywords):
                return min(95, max(82, tech_score)) if has_eval else 85
            if has_resume:
                return max(15, round(tech_score * 0.45)) if has_eval else 0
            # Evaluation only (no resume uploaded yet)
            return tech_score

        if any(k in role_lower for k in ['ai', 'ml', 'machine learning']):
            role_comparison = [
                {'skill': 'Python & Numerical Computing', 'required': 88, 'candidate': _skill_score(['python', 'numpy', 'pandas'])},
                {'skill': 'LLM, Transformers & RAG Architecture', 'required': 85, 'candidate': _skill_score(['llm', 'rag', 'embeddings', 'pytorch'])},
                {'skill': 'Vector Indexing & Retrieval', 'required': 78, 'candidate': _skill_score(['vector db', 'pinecone', 'pgvector', 'redis'])},
                {'skill': 'Model Serving & Containerization', 'required': 75, 'candidate': _skill_score(['fastapi', 'docker', 'kubernetes'])},
                {'skill': 'Verbal Communication & Trade-offs', 'required': 80, 'candidate': comm_score},
            ]
        elif any(k in role_lower for k in ['devops', 'cloud', 'sre']):
            role_comparison = [
                {'skill': 'Docker & Multi-Stage Containers', 'required': 85, 'candidate': _skill_score(['docker', 'linux'])},
                {'skill': 'Kubernetes & Auto-Scaling', 'required': 82, 'candidate': _skill_score(['kubernetes', 'helm'])},
                {'skill': 'CI/CD & Infrastructure as Code', 'required': 80, 'candidate': _skill_score(['ci/cd', 'github actions', 'terraform'])},
                {'skill': 'Observability & Caching (Redis/Prometheus)', 'required': 78, 'candidate': _skill_score(['prometheus', 'grafana', 'redis'])},
                {'skill': 'Incident Communication & Postmortems', 'required': 80, 'candidate': comm_score},
            ]
        elif 'product' in role_lower:
            role_comparison = [
                {'skill': 'Product Strategy & Prioritization (RICE)', 'required': 85, 'candidate': _skill_score(['product strategy', 'rice', 'prd'])},
                {'skill': 'Funnel Metrics & A/B Experimentation', 'required': 82, 'candidate': _skill_score(['a/b testing', 'kpi', 'sql'])},
                {'skill': 'Technical & API Fluency', 'required': 75, 'candidate': _skill_score(['rest api', 'llm', 'system design'])},
                {'skill': 'Executive Communication & Alignment', 'required': 85, 'candidate': comm_score},
            ]
        else:
            role_comparison = [
                {'skill': 'Python & Core Programming', 'required': 85, 'candidate': _skill_score(['python', 'java', 'c++', 'typescript'])},
                {'skill': 'RESTful APIs & Web Frameworks', 'required': 80, 'candidate': _skill_score(['rest api', 'django', 'react', 'fastapi'])},
                {'skill': 'PostgreSQL & Database Indexing', 'required': 80, 'candidate': _skill_score(['postgresql', 'sql', 'mysql'])},
                {'skill': 'Docker & Containerization', 'required': 75, 'candidate': _skill_score(['docker', 'kubernetes', 'ci/cd'])},
                {'skill': 'System Design & Caching (Redis)', 'required': 75, 'candidate': _skill_score(['system design', 'redis', 'microservices'])},
                {'skill': 'Verbal Communication & STAR Framing', 'required': 80, 'candidate': comm_score},
            ]

        for idx, row in enumerate(role_comparison):
            if idx == len(role_comparison) - 1 and not has_eval:
                row['status'] = 'Pending Interview'
                continue
            diff = row['candidate'] - row['required']
            if diff >= 5:
                row['status'] = 'Exceeds'
            elif diff >= -2:
                row['status'] = 'Proficient'
            elif diff >= -15:
                row['status'] = 'Moderate Gap'
            else:
                row['status'] = 'Priority Gap'

        weak_areas = []
        if latest_eval and latest_eval.weaknesses:
            for w in latest_eval.weaknesses[:3]:
                weak_areas.append({
                    'topic': 'Interview Evaluation Finding',
                    'impact': 'High',
                    'detail': w,
                    'recommendation': 'Practice targeted follow-up mock session.',
                })
        if has_resume:
            for gap_skill in missing_list[:3]:
                weak_areas.append({
                    'topic': f'Resume Missing Skill: {gap_skill}',
                    'impact': 'Medium',
                    'detail': f'{gap_skill} was expected for {target_role} but not found in your latest resume.',
                    'recommendation': f'Complete hands-on lab and launch targeted mock interview with {gap_skill}.',
                })

        priority_focus = ', '.join(missing_list[:2]) if missing_list else f'{target_role} Core Architecture'
        secondary_focus = ', '.join(missing_list[2:4]) if len(missing_list) > 2 else 'Applied Problem Solving & Trade-offs'
        roadmap_def = [
            {
                'week': 'Week 1: Foundations & Core Gaps',
                'focus': f'Focus: {priority_focus}',
                'milestones': [
                    {'key': 'w1_m1', 'task': f'Review core architectural patterns for {target_role}'},
                    {'key': 'w1_m2', 'task': f'Build a hands-on mini-project practicing {priority_focus}'},
                    {'key': 'w1_m3', 'task': f'Run a targeted mock interview covering {priority_focus}'},
                ],
                'resources': [
                    {'name': 'System Design Primer', 'url': 'https://github.com/donnemartin/system-design-primer'},
                ],
            },
            {
                'week': 'Week 2: Applied Depth & Projects',
                'focus': f'Focus: {secondary_focus}',
                'milestones': [
                    {'key': 'w2_m1', 'task': f'Document measurable technical decisions for {secondary_focus}'},
                    {'key': 'w2_m2', 'task': 'Resolve bottlenecks and add unit tests to a sample project'},
                ],
                'resources': [
                    {'name': 'MDN Web Docs & Engineering Guides', 'url': 'https://developer.mozilla.org/en-US/docs/Learn'},
                ],
            },
            {
                'week': 'Week 3: Production Readiness & Code Practice',
                'focus': 'Code Quality, Testing & Reliability',
                'milestones': [
                    {'key': 'w3_m1', 'task': f'Solve 3 timed technical or coding drills tailored to {target_role}'},
                    {'key': 'w3_m2', 'task': 'Practice explaining time/space and reliability trade-offs aloud'},
                ],
                'resources': [],
            },
            {
                'week': 'Week 4: Communication & STAR Mastery',
                'focus': 'Verbal Cadence Control & Behavioral Framing',
                'milestones': [
                    {'key': 'w4_m1', 'task': 'Record 3 behavioral answers using Situation-Task-Action-Result'},
                    {'key': 'w4_m2', 'task': 'Achieve speaking cadence between 120–155 WPM with <2% fillers'},
                ],
                'resources': [
                    {'name': 'MDN Web Docs — Technical Communication', 'url': 'https://developer.mozilla.org/en-US/docs/Learn'},
                ],
            },
        ]

        for week in roadmap_def:
            for m in week['milestones']:
                m['done'] = saved_milestones.get(m['key'], False)

        if has_resume and has_eval:
            overall_match = round((latest_resume.ats_score * 0.5) + (latest_eval.overall_score * 0.5))
        elif has_resume:
            overall_match = int(round(latest_resume.ats_score))
        else:
            overall_match = int(round(latest_eval.overall_score))

        return response.Response({
            'has_data': True,
            'target_role': target_role,
            'overall_match_percentage': overall_match,
            'missing_skills': missing_list,
            'role_comparison': role_comparison,
            'weak_areas': weak_areas,
            'roadmap': roadmap_def,
        })


class ToggleMilestoneView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        key = str(request.data.get('milestone_key') or '').strip()
        completed = bool(request.data.get('completed', False))
        if not key or not re.match(r'^[a-zA-Z0-9_-]{1,100}$', key):
            return response.Response({'error': 'Valid milestone_key is required.'}, status=status.HTTP_400_BAD_REQUEST)

        obj, _ = RoadmapMilestone.objects.update_or_create(
            user=request.user,
            milestone_key=key,
            defaults={'completed': completed},
        )
        return response.Response({'milestone_key': obj.milestone_key, 'completed': obj.completed})
