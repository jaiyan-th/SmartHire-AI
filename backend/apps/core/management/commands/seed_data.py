from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from apps.accounts.models import User, UserRole
from apps.interviews.models import (
    InterviewSession,
    InterviewQuestion,
    InterviewAnswer,
    InterviewTemplate,
    InterviewStatus,
    RecruiterReviewStatus,
    RoadmapMilestone,
)
from apps.evaluations.models import Evaluation
from apps.resumes.models import Resume, ResumeProcessingStatus
from apps.core.models import AuditLog, PlatformConfig


class Command(BaseCommand):
    help = 'Initializes default platform configuration. Pass --demo to populate optional sample data.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--demo',
            action='store_true',
            help='Populate optional demo accounts and sample records (disabled by default in production).',
        )

    def handle(self, *args, **options):
        PlatformConfig.get_solo()
        if not options.get('demo'):
            self.stdout.write(self.style.SUCCESS("PlatformConfig initialized with clean zero-mock production database."))
            return

        self.stdout.write("Seeding SmartHire AI demo dataset (--demo)...")

        PlatformConfig.get_solo()

        # 1. Demo Accounts (dev/demo only)
        accounts = [
            {'email': 'candidate@demo.com', 'username': 'candidate_demo', 'full_name': 'Jaiyanth S', 'role': UserRole.CANDIDATE, 'headline': 'Full Stack & AI Engineer'},
            {'email': 'aarav.patel@demo.com', 'username': 'aarav_demo', 'full_name': 'Aarav Patel', 'role': UserRole.CANDIDATE, 'headline': 'Senior Backend & ML Engineer'},
            {'email': 'elena.rostova@demo.com', 'username': 'elena_demo', 'full_name': 'Elena Rostova', 'role': UserRole.CANDIDATE, 'headline': 'DevOps & Cloud Engineer'},
            {'email': 'recruiter@demo.com', 'username': 'recruiter_demo', 'full_name': 'Sarah Jenkins', 'role': UserRole.RECRUITER, 'headline': 'Senior Technical Recruiter'},
            {'email': 'admin@demo.com', 'username': 'admin_demo', 'full_name': 'Alex Rivera', 'role': UserRole.ADMIN, 'headline': 'Principal DevOps & SecOps Architect'},
        ]

        users_by_email = {}
        for acc in accounts:
            user, _ = User.objects.get_or_create(
                email=acc['email'],
                defaults={
                    'username': acc['username'],
                    'full_name': acc['full_name'],
                    'role': acc['role'],
                    'headline': acc['headline'],
                    'is_email_verified': True,
                    'recording_consent': True,
                    'webcam_consent': True,
                },
            )
            user.role = acc['role']
            user.full_name = acc['full_name']
            user.is_email_verified = True
            user.set_password('Demo@1234')
            if acc['role'] == UserRole.ADMIN:
                user.is_staff = True
                user.is_superuser = True
            user.save()
            users_by_email[acc['email']] = user
            self.stdout.write(f"User: {user.email} [{user.role}] - Ready")

        recruiter_user = users_by_email['recruiter@demo.com']
        candidate_user = users_by_email['candidate@demo.com']
        aarav_user = users_by_email['aarav.patel@demo.com']
        elena_user = users_by_email['elena.rostova@demo.com']

        # 2. Sample Interview Template
        template, _ = InterviewTemplate.objects.get_or_create(
            title="Senior Full Stack & AI Readiness Assessment",
            defaults={
                'created_by': recruiter_user,
                'description': 'Standardized technical & architecture evaluation covering OOP, networking, APIs, and distributed caching.',
                'domain': 'Software Engineering',
                'level': 'Mid-Level',
                'category': 'Technical',
                'duration_minutes': 25,
                'time_limit_per_question': 120,
                'question_count': 5,
                'target_skills': ['Python', 'Django', 'React', 'REST API', 'PostgreSQL', 'Docker'],
            },
        )

        # 3. Seed Candidate Resume
        Resume.objects.get_or_create(
            user=candidate_user,
            file_name='Jaiyanth_Software_Engineer_Resume.pdf',
            defaults={
                'file_size_bytes': 48200,
                'processing_status': ResumeProcessingStatus.COMPLETED,
                'target_role': 'Full Stack Software Engineer',
                'ats_score': 82,
                'executive_summary': 'Extracted 9 verified skills (Python, JavaScript, SQL, Django, React, PostgreSQL...) matching 9/12 target criteria for Full Stack Software Engineer.',
                'skills_extracted': {
                    'languages': ['Python', 'JavaScript', 'SQL'],
                    'frameworks': ['Django', 'React'],
                    'databases': ['PostgreSQL', 'SQLite'],
                    'tools': ['Git'],
                    'concepts': ['REST API', 'OOP', 'Data Structures'],
                },
                'missing_skills': ['Docker', 'Redis', 'System Design'],
                'experience': [{'detail': 'Full-Stack Capstone Developer — Built REST APIs with Django and PostgreSQL'}],
                'education': [{'detail': 'B.Tech in Computer Science & Engineering'}],
            },
        )

        # 4. Seed Multi-Session History for Primary Candidate
        now = timezone.now()
        if not InterviewSession.objects.filter(candidate=candidate_user).exists():
            history_specs = [
                {
                    'days_ago': 10,
                    'domain': 'Software Engineering',
                    'difficulty': 'Junior',
                    'comm': 76.0, 'conf': 78.0, 'tech': 74.0, 'prof': 80.0,
                    'overall': 76.5, 'band': 'Good',
                    'assigned': False, 'shared': False, 'flagged': False,
                    'review': RecruiterReviewStatus.PENDING,
                    'wpm': 128, 'fillers': 3, 'eye': 88.0,
                },
                {
                    'days_ago': 2,
                    'domain': 'Software Engineering',
                    'difficulty': 'Mid-Level',
                    'comm': 85.0, 'conf': 88.0, 'tech': 84.0, 'prof': 86.0,
                    'overall': 85.6, 'band': 'Good',
                    'assigned': True, 'shared': True, 'flagged': False,
                    'review': RecruiterReviewStatus.SHORTLISTED,
                    'wpm': 138, 'fillers': 1, 'eye': 95.5,
                },
            ]

            for spec in history_specs:
                sess = InterviewSession.objects.create(
                    candidate=candidate_user,
                    assigned_by=recruiter_user if spec['assigned'] else None,
                    template=template,
                    domain=spec['domain'],
                    category='Technical',
                    difficulty=spec['difficulty'],
                    duration_minutes=20,
                    focus_skills=['Python', 'OOP', 'REST API'],
                    status=InterviewStatus.COMPLETED,
                    current_question_index=1,
                    total_questions=2,
                    proctoring_flagged=spec['flagged'],
                    is_recruiter_assigned=spec['assigned'],
                    shared_with_recruiters=spec['shared'],
                    recruiter_status=spec['review'],
                    started_at=now - timedelta(days=spec['days_ago']),
                    completed_at=now - timedelta(days=spec['days_ago']) + timedelta(minutes=16),
                )
                sess.created_at = now - timedelta(days=spec['days_ago'])
                sess.save(update_fields=['created_at'])

                q1 = InterviewQuestion.objects.create(
                    session=sess, order=1, category='Technical', competency='OOP Principles',
                    prompt='Explain the four core principles of OOP and give a practical example of polymorphism.',
                    expected_keywords=['encapsulation', 'abstraction', 'inheritance', 'polymorphism'],
                    model_answer='Encapsulation, Abstraction, Inheritance, and Polymorphism with runtime overriding.',
                )
                q2 = InterviewQuestion.objects.create(
                    session=sess, order=2, category='Technical', competency='Networking & Protocols',
                    prompt='Explain the 7 layers of the OSI model and contrast TCP versus UDP.',
                    expected_keywords=['osi', 'tcp', 'udp', 'handshake', 'reliable'],
                    model_answer='7 OSI layers; TCP is connection-oriented and reliable, UDP is connectionless low-latency.',
                )
                ans_text = 'Object-oriented programming relies on encapsulation, abstraction, inheritance, and polymorphism via runtime method overriding.'
                InterviewAnswer.objects.create(
                    session=sess, question=q1, input_mode='speech',
                    transcript_text=ans_text, wpm=spec['wpm'],
                    filler_words_count=spec['fillers'], eye_contact_percentage=spec['eye'],
                    duration_seconds=45,
                )
                InterviewAnswer.objects.create(
                    session=sess, question=q2, input_mode='speech',
                    transcript_text='The OSI model has 7 layers from Physical to Application. TCP uses a 3-way handshake for reliability while UDP prioritizes speed.',
                    wpm=spec['wpm'], filler_words_count=1, eye_contact_percentage=spec['eye'],
                    duration_seconds=42,
                )

                Evaluation.objects.create(
                    session=sess,
                    communication_score=spec['comm'],
                    confidence_score=spec['conf'],
                    technical_relevance_score=spec['tech'],
                    professionalism_score=spec['prof'],
                    overall_score=spec['overall'],
                    rating_band=spec['band'],
                    strengths=[
                        f"Consistent optimal speaking cadence ({spec['wpm']} WPM).",
                        f"Strong eye-contact stability ({spec['eye']}%) and structured explanations.",
                    ],
                    weaknesses=[
                        "Could include deeper real-world production latency metrics and caching trade-offs.",
                    ],
                    improvement_suggestions=[
                        "Replace brief filler words with deliberate 2-second pauses.",
                        "Use STAR structure for behavioral follow-ups.",
                    ],
                    practice_recommendations=[
                        "Practice Docker & Redis system design scenarios.",
                    ],
                    learning_resources=[
                        {"title": "System Design Primer", "url": "https://github.com/donnemartin/system-design-primer", "domain": "Architecture"},
                    ],
                    question_evaluations=[
                        {
                            'order': 1, 'competency': 'OOP Principles', 'prompt': q1.prompt,
                            'candidate_response': ans_text, 'model_answer': q1.model_answer,
                            'critique': 'Matched 4/4 core OOP concepts with clear overriding example.',
                            'strengths': f"Delivered at {spec['wpm']} WPM with {spec['eye']}% gaze stability.",
                            'improvements': 'Mention interface segregation in large codebases.',
                            'wpm': spec['wpm'], 'filler_words_count': spec['fillers'], 'score': spec['tech'],
                        },
                        {
                            'order': 2, 'competency': 'Networking & Protocols', 'prompt': q2.prompt,
                            'candidate_response': 'The OSI model has 7 layers from Physical to Application. TCP uses a 3-way handshake for reliability while UDP prioritizes speed.',
                            'model_answer': q2.model_answer,
                            'critique': 'Accurate contrast between TCP reliability and UDP streaming overhead.',
                            'strengths': 'Concise transport layer explanation.',
                            'improvements': 'List all 7 OSI layers explicitly.',
                            'wpm': spec['wpm'], 'filler_words_count': 1, 'score': spec['tech'] + 1.5,
                        },
                    ],
                )

        # 5. Seed Additional Authorized Recruiter-Assigned Sessions for Recruiter Portal
        extra_candidates = [
            {
                'user': aarav_user, 'domain': 'AI/ML', 'difficulty': 'Senior',
                'comm': 90.0, 'conf': 89.0, 'tech': 94.0, 'prof': 92.0,
                'overall': 91.25, 'band': 'Excellent', 'flagged': False,
                'review': RecruiterReviewStatus.SHORTLISTED, 'wpm': 142, 'fillers': 0, 'eye': 94.0,
            },
            {
                'user': elena_user, 'domain': 'DevOps & Cloud', 'difficulty': 'Mid-Level',
                'comm': 70.0, 'conf': 68.0, 'tech': 74.0, 'prof': 75.0,
                'overall': 71.45, 'band': 'Average', 'flagged': True,
                'review': RecruiterReviewStatus.FLAGGED, 'wpm': 168, 'fillers': 6, 'eye': 61.5,
            },
        ]

        for item in extra_candidates:
            if not InterviewSession.objects.filter(candidate=item['user']).exists():
                sess = InterviewSession.objects.create(
                    candidate=item['user'], assigned_by=recruiter_user, template=template,
                    domain=item['domain'], category='Technical', difficulty=item['difficulty'],
                    duration_minutes=25, focus_skills=['Architecture', 'Scalability'],
                    status=InterviewStatus.COMPLETED, current_question_index=1, total_questions=1,
                    proctoring_flagged=item['flagged'], is_recruiter_assigned=True,
                    shared_with_recruiters=True, recruiter_status=item['review'],
                    started_at=now - timedelta(days=1), completed_at=now - timedelta(days=1) + timedelta(minutes=20),
                )
                q = InterviewQuestion.objects.create(
                    session=sess, order=1, category='Technical', competency=item['domain'],
                    prompt=f"Describe a production scaling challenge you solved in {item['domain']}.",
                    expected_keywords=['scaling', 'latency', 'monitoring'],
                    model_answer='Systematic bottleneck profiling, caching/indexing, and automated observability.',
                )
                InterviewAnswer.objects.create(
                    session=sess, question=q, input_mode='speech',
                    transcript_text='We isolated high p95 query latency via PostgreSQL EXPLAIN ANALYZE, added composite indexes and Redis caching, cutting latency by 65%.',
                    wpm=item['wpm'], filler_words_count=item['fillers'],
                    eye_contact_percentage=item['eye'], duration_seconds=50,
                )
                Evaluation.objects.create(
                    session=sess,
                    communication_score=item['comm'], confidence_score=item['conf'],
                    technical_relevance_score=item['tech'], professionalism_score=item['prof'],
                    overall_score=item['overall'], rating_band=item['band'],
                    strengths=["Clear architectural reasoning backed by measurable latency improvements."],
                    weaknesses=["Monitor speaking cadence under complex trade-off questioning."],
                    question_evaluations=[{
                        'order': 1, 'competency': item['domain'], 'prompt': q.prompt,
                        'candidate_response': 'We isolated high p95 query latency via PostgreSQL EXPLAIN ANALYZE and Redis caching.',
                        'model_answer': q.model_answer, 'critique': 'Strong practical production example.',
                        'strengths': 'Quantified impact.', 'improvements': 'Detail failover strategy.',
                        'wpm': item['wpm'], 'filler_words_count': item['fillers'], 'score': item['tech'],
                    }],
                )

        # 6. Seed initial Roadmap Milestone progress
        RoadmapMilestone.objects.get_or_create(user=candidate_user, milestone_key='w1_m1', defaults={'completed': True})

        # 7. Audit Log Seed
        AuditLog.objects.get_or_create(
            event_type="SYSTEM_INITIALIZED",
            defaults={
                'level': 'INFO',
                'user_email': 'system@smarthire.local',
                'message': 'SmartHire AI production platform initialized with demo accounts and assessments.',
            },
        )

        self.stdout.write(self.style.SUCCESS("SmartHire AI database seeding completed successfully!"))
