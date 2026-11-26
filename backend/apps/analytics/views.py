from rest_framework import views, status, response, permissions
from apps.evaluations.models import Evaluation
from apps.interviews.models import InterviewSession, RoadmapMilestone
from apps.resumes.models import Resume


class InsightsAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        session_id = request.query_params.get('session_id')
        user_evals = list(
            Evaluation.objects.select_related('session')
            .prefetch_related('session__answers')
            .filter(session__candidate=request.user)
            .order_by('created_at')
        )

        if session_id:
            target_eval = Evaluation.objects.select_related('session').prefetch_related('session__answers').filter(
                session_id=session_id
            ).first()
            if target_eval and target_eval.session.candidate_id != request.user.id and request.user.role not in ('recruiter', 'admin'):
                return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        else:
            target_eval = user_evals[-1] if user_evals else None

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

        # Chronological progression from real database evaluations
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

        # Real session telemetry for the target evaluation
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

        extracted_flat = []
        if latest_resume and isinstance(latest_resume.skills_extracted, dict):
            extracted_flat = [s.lower() for sublist in latest_resume.skills_extracted.values() for s in sublist]

        missing_list = latest_resume.missing_skills if latest_resume else ['Docker', 'PostgreSQL', 'System Design', 'Redis']
        target_role = (latest_resume.target_role if latest_resume else request.user.target_role) or 'Full Stack Software Engineer'

        tech_score = int(latest_eval.technical_relevance_score) if latest_eval else 70
        comm_score = int(latest_eval.communication_score) if latest_eval else 72

        def _skill_score(skill_keywords, base=55):
            if any(k in extracted_flat for k in skill_keywords):
                return min(92, max(base + 25, tech_score))
            return max(42, base)

        role_comparison = [
            {'skill': 'Python & Core Programming', 'required': 85, 'candidate': _skill_score(['python', 'java', 'c++']), 'status': 'Verified'},
            {'skill': 'RESTful APIs & Web Frameworks', 'required': 80, 'candidate': _skill_score(['rest api', 'django', 'react', 'fastapi']), 'status': 'Verified'},
            {'skill': 'PostgreSQL & Database Indexing', 'required': 80, 'candidate': _skill_score(['postgresql', 'sql', 'mysql'], 58), 'status': 'Evaluated'},
            {'skill': 'Docker & Containerization', 'required': 75, 'candidate': _skill_score(['docker', 'kubernetes', 'ci/cd'], 52), 'status': 'Evaluated'},
            {'skill': 'System Design & Caching (Redis)', 'required': 75, 'candidate': _skill_score(['system design', 'redis', 'microservices'], 50), 'status': 'Evaluated'},
            {'skill': 'Verbal Communication & STAR Framing', 'required': 80, 'candidate': comm_score, 'status': 'Evaluated'},
        ]
        for row in role_comparison:
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
        for gap_skill in missing_list[:2]:
            weak_areas.append({
                'topic': f'Resume Missing Skill: {gap_skill}',
                'impact': 'Medium',
                'detail': f'{gap_skill} was expected for {target_role} but not found in your latest resume.',
                'recommendation': f'Complete hands-on lab and launch targeted mock interview with {gap_skill}.',
            })

        roadmap_def = [
            {
                'week': 'Week 1: Foundations & Architecture',
                'focus': f"Priority Gaps: {', '.join(missing_list[:2]) if missing_list else 'System Design & Redis'}",
                'milestones': [
                    {'key': 'w1_m1', 'task': 'Complete System Design Primer caching & load balancing module'},
                    {'key': 'w1_m2', 'task': 'Implement cache-aside vs write-through patterns in sample API'},
                    {'key': 'w1_m3', 'task': 'Run a targeted mock interview covering architecture trade-offs'},
                ],
                'resources': [
                    {'name': 'System Design Primer', 'url': 'https://github.com/donnemartin/system-design-primer'},
                    {'name': 'Redis Official Docs', 'url': 'https://redis.io/docs/'},
                ],
            },
            {
                'week': 'Week 2: Data Persistence & Query Optimization',
                'focus': 'PostgreSQL B-Tree Indexing & N+1 Prevention',
                'milestones': [
                    {'key': 'w2_m1', 'task': 'Analyze EXPLAIN ANALYZE execution plans on relational queries'},
                    {'key': 'w2_m2', 'task': 'Resolve N+1 ORM queries using select_related / prefetch_related'},
                ],
                'resources': [
                    {'name': 'PostgreSQL Performance Tips', 'url': 'https://www.postgresql.org/docs/current/performance-tips.html'},
                ],
            },
            {
                'week': 'Week 3: Containerization & Production CI/CD',
                'focus': 'Docker Multi-Stage Builds & Automated Pipelines',
                'milestones': [
                    {'key': 'w3_m1', 'task': 'Author a non-root multi-stage Dockerfile for Django/React'},
                    {'key': 'w3_m2', 'task': 'Configure automated unit and security tests in GitHub Actions'},
                ],
                'resources': [
                    {'name': 'Docker Best Practices', 'url': 'https://docs.docker.com/build/building/best-practices/'},
                ],
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

        overall_match = latest_resume.ats_score if latest_resume else round(sum(r['candidate'] for r in role_comparison) / len(role_comparison))

        return response.Response({
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
        key = (request.data.get('milestone_key') or '').strip()
        completed = bool(request.data.get('completed', False))
        if not key:
            return response.Response({'error': 'milestone_key is required.'}, status=status.HTTP_400_BAD_REQUEST)

        obj, _ = RoadmapMilestone.objects.update_or_create(
            user=request.user,
            milestone_key=key,
            defaults={'completed': completed},
        )
        return response.Response({'milestone_key': obj.milestone_key, 'completed': obj.completed})
