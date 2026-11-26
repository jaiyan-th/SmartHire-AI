from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import EmailVerificationToken, PasswordResetToken
from apps.interviews.models import InterviewSession, InterviewStatus, InterviewTemplate
from apps.interviews.question_bank import get_questions_for_interview

User = get_user_model()


class ProductionHardeningTests(TestCase):
    def setUp(self):
        self.cand = User.objects.create_user(
            username='prod_cand',
            email='prodcand@demo.com',
            password='StrongPassword123!',
            role='candidate',
            full_name='Prod Candidate',
            target_role='AI/ML Engineer',
        )
        self.recruiter = User.objects.create_user(
            username='prod_rec',
            email='prodrec@demo.com',
            password='StrongPassword123!',
            role='recruiter',
            full_name='Prod Recruiter',
        )
        self.admin = User.objects.create_user(
            username='prod_adm',
            email='prodadm@demo.com',
            password='StrongPassword123!',
            role='admin',
            full_name='Prod Admin',
            is_staff=True,
        )
        self.client_cand = APIClient()
        self.client_rec = APIClient()
        self.client_adm = APIClient()
        self.client_cand.force_authenticate(user=self.cand)
        self.client_rec.force_authenticate(user=self.recruiter)
        self.client_adm.force_authenticate(user=self.admin)

    def test_auth_providers_and_email_verification_flow(self):
        anon = APIClient()
        prov = anon.get('/api/auth/providers')
        self.assertEqual(prov.status_code, status.HTTP_200_OK)
        self.assertTrue(prov.data['jwt'])

        resend = self.client_cand.post('/api/auth/resend-verification')
        self.assertEqual(resend.status_code, status.HTTP_200_OK)
        token_obj = EmailVerificationToken.objects.filter(user=self.cand, used=False).first()
        self.assertIsNotNone(token_obj)

        verify = anon.post('/api/auth/verify-email', {'token': str(token_obj.token)}, format='json')
        self.assertEqual(verify.status_code, status.HTTP_200_OK)
        self.cand.refresh_from_db()
        self.assertTrue(self.cand.is_email_verified)

    def test_reset_password_enforces_django_password_validators(self):
        token_obj = PasswordResetToken.objects.create(
            user=self.cand,
            expires_at=self.cand.created_at.replace(year=2099),
        )
        res = APIClient().post(
            '/api/auth/reset-password',
            {'token': str(token_obj.token), 'new_password': 'password123'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_inputs_return_400_not_500(self):
        bad_start = self.client_cand.post('/api/interview/start', {
            'question_count': 'not-an-int',
            'recording_consent': True,
        }, format='json')
        self.assertEqual(bad_start.status_code, status.HTTP_400_BAD_REQUEST)

        bad_uuid = self.client_cand.get('/api/analytics/insights?session_id=not-a-uuid')
        self.assertEqual(bad_uuid.status_code, status.HTTP_400_BAD_REQUEST)

        bad_eval = self.client_cand.get('/api/evaluations/latest?session_id=not-a-uuid')
        self.assertEqual(bad_eval.status_code, status.HTTP_400_BAD_REQUEST)

        bad_pdf = self.client_cand.get('/api/reports/download-pdf?session_id=not-a-uuid')
        self.assertEqual(bad_pdf.status_code, status.HTTP_400_BAD_REQUEST)

        bad_settings = self.client_adm.post('/api/admin-terminal/settings', {'temperature': 'abc'}, format='json')
        self.assertEqual(bad_settings.status_code, status.HTTP_400_BAD_REQUEST)

    def test_question_bank_covers_all_domains_without_duplicates(self):
        for domain in ['Software Engineering', 'AI/ML', 'Data Science', 'DevOps & Cloud', 'Product Management']:
            qs = get_questions_for_interview(domain=domain, category='Technical', difficulty='Mid-Level', count=4)
            self.assertEqual(len(qs), 4)
            prompts = [q['prompt'] for q in qs]
            self.assertEqual(len(prompts), len(set(prompts)))

    def test_proctoring_telemetry_cancel_code_eval_and_dossier_verification(self):
        start = self.client_cand.post('/api/interview/start', {
            'domain': 'Software Engineering',
            'category': 'Technical',
            'question_count': 2,
            'camera_enabled': False,
            'recording_consent': True,
        }, format='json')
        self.assertEqual(start.status_code, status.HTTP_201_CREATED)
        sid = start.data['session_id']
        q1_id = start.data['session']['questions'][0]['id']

        # Proctoring telemetry flagging after 3 tab switches
        tel = self.client_cand.post(f'/api/interview/{sid}/telemetry', {
            'event_type': 'TAB_SWITCH',
            'tab_switches': 3,
        }, format='json')
        self.assertEqual(tel.status_code, status.HTTP_200_OK)
        self.assertTrue(tel.data['proctoring_flagged'])

        # Submit code answer
        ans = self.client_cand.post('/api/interview/answer', {
            'session_id': sid,
            'question_id': q1_id,
            'input_mode': 'code',
            'language': 'python',
            'code_text': 'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i',
            'duration_seconds': 55,
        }, format='json')
        self.assertEqual(ans.status_code, status.HTTP_200_OK)

        # Finish idempotency
        fin1 = self.client_cand.post('/api/interview/finish', {'session_id': sid}, format='json')
        fin2 = self.client_cand.post('/api/interview/finish', {'session_id': sid}, format='json')
        self.assertEqual(fin1.status_code, status.HTTP_200_OK)
        self.assertEqual(fin2.status_code, status.HTTP_200_OK)
        self.assertEqual(fin1.data['evaluation']['overall_score'], fin2.data['evaluation']['overall_score'])

        # PDF & HMAC Digest Verification
        pdf_res = self.client_cand.get(f'/api/reports/download-pdf?session_id={sid}')
        self.assertEqual(pdf_res.status_code, status.HTTP_200_OK)
        digest = pdf_res['X-Dossier-Digest']
        verify_ok = self.client_cand.get(f'/api/reports/verify/{sid}?digest={digest}')
        self.assertEqual(verify_ok.status_code, status.HTTP_200_OK)
        self.assertTrue(verify_ok.data['verified'])
        verify_bad = self.client_cand.get(f'/api/reports/verify/{sid}?digest=TAMPERED0000')
        self.assertFalse(verify_bad.data['verified'])

        # Start another session and cancel + delete it
        s2 = self.client_cand.post('/api/interview/start', {'question_count': 1, 'recording_consent': True}, format='json')
        s2_id = s2.data['session_id']
        self.assertEqual(self.client_cand.post(f'/api/interview/{s2_id}/cancel').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client_cand.delete(f'/api/interview/{s2_id}').status_code, status.HTTP_200_OK)

    def test_skill_gap_role_adaptation_and_milestone_validation(self):
        # 1. Zero resumes and zero evaluations -> strictly empty honest state
        sg_empty = self.client_cand.get('/api/analytics/skill-gap')
        self.assertEqual(sg_empty.status_code, status.HTTP_200_OK)
        self.assertFalse(sg_empty.data['has_data'])
        self.assertEqual(sg_empty.data['overall_match_percentage'], 0)
        self.assertEqual(sg_empty.data['role_comparison'], [])
        self.assertEqual(sg_empty.data['weak_areas'], [])
        self.assertEqual(sg_empty.data['roadmap'], [])

        # 2. Upload a real resume -> Growth roadmap activates with real role adaptation
        res = self.client_cand.post('/api/resume/analyze', {
            'raw_text': 'Skills: Python, PyTorch, RAG, SQL. Target AI Engineer.',
            'target_role': 'AI/ML Engineer',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        sg = self.client_cand.get('/api/analytics/skill-gap')
        self.assertEqual(sg.status_code, status.HTTP_200_OK)
        self.assertTrue(sg.data['has_data'])
        self.assertEqual(sg.data['target_role'], 'AI/ML Engineer')
        self.assertTrue(any('LLM' in r['skill'] for r in sg.data['role_comparison']))

        bad_ms = self.client_cand.patch('/api/analytics/skill-gap/milestone', {'milestone_key': '<script>', 'completed': True}, format='json')
        self.assertEqual(bad_ms.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Custom manually targeted interview domain works seamlessly
        custom_start = self.client_cand.post('/api/interview/start', {
            'domain': 'Cloud Security Architect',
            'category': 'Technical',
            'question_count': 2,
            'recording_consent': True,
        }, format='json')
        self.assertEqual(custom_start.status_code, status.HTTP_201_CREATED)
        self.assertEqual(custom_start.data['session']['domain'], 'Cloud Security Architect')

    def test_recruiter_template_crud_and_csv_sanitization(self):
        tpl_res = self.client_rec.post('/api/recruiter/templates', {
            'title': 'Platform Engineering Loop',
            'domain': 'DevOps & Cloud',
            'level': 'Senior',
            'target_skills': 'Kubernetes, Docker, Terraform',
        }, format='json')
        self.assertEqual(tpl_res.status_code, status.HTTP_201_CREATED)
        tpl_id = tpl_res.data['id']

        patch_res = self.client_rec.patch(f'/api/recruiter/templates/{tpl_id}', {'level': 'Mid-Level'}, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['level'], 'Mid-Level')

        # CSV formula injection neutralization
        evil_cand = User.objects.create_user(
            username='evil_csv', email='evil@demo.com', password='Password123!',
            role='candidate', full_name='=CMD("calc")',
        )
        InterviewSession.objects.create(
            candidate=evil_cand, assigned_by=self.recruiter, domain='Software Engineering',
            is_recruiter_assigned=True, status=InterviewStatus.COMPLETED,
        )
        csv_res = self.client_rec.get('/api/recruiter/export-csv')
        self.assertEqual(csv_res.status_code, status.HTTP_200_OK)
        self.assertIn("'=CMD", csv_res.content.decode('utf-8'))

        del_res = self.client_rec.delete(f'/api/recruiter/templates/{tpl_id}')
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertFalse(InterviewTemplate.objects.get(id=tpl_id).is_active)

    def test_admin_user_provisioning_and_self_demotion_guard(self):
        create_res = self.client_adm.post('/api/admin-terminal/users', {
            'email': 'newrec@demo.com',
            'password': 'StrongPassword987!',
            'full_name': 'New Recruiter',
            'role': 'recruiter',
        }, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_res.data['role'], 'recruiter')

        demote_self = self.client_adm.patch(f'/api/admin-terminal/users/{self.admin.id}', {'role': 'candidate'}, format='json')
        self.assertEqual(demote_self.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bootstrap_admin_works_once_on_empty_admin_set(self):
        anon = APIClient()
        # Admin already exists from setUp -> bootstrap forbidden
        blocked = anon.post('/api/auth/bootstrap-admin', {
            'email': 'second_admin@example.com',
            'password': 'StrongPassword987!',
            'full_name': 'Blocked Admin',
        }, format='json')
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

        # Clear existing admins -> first bootstrap succeeds and locks endpoint afterwards
        User.objects.filter(role='admin').delete()
        providers_before = anon.get('/api/auth/providers')
        self.assertEqual(providers_before.status_code, status.HTTP_200_OK)
        self.assertTrue(providers_before.data['needs_initial_setup'])

        created = anon.post('/api/auth/bootstrap-admin', {
            'email': 'first_admin@example.com',
            'password': 'StrongPassword987!',
            'full_name': 'Initial Admin',
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data['user']['role'], 'admin')

        providers_after = anon.get('/api/auth/providers')
        self.assertFalse(providers_after.data['needs_initial_setup'])

        retry = anon.post('/api/auth/bootstrap-admin', {
            'email': 'third_admin@example.com',
            'password': 'StrongPassword987!',
            'full_name': 'Third Admin',
        }, format='json')
        self.assertEqual(retry.status_code, status.HTTP_403_FORBIDDEN)

    def test_personalized_mentor_chatbot_context_persistence_and_clear(self):
        unauth = APIClient().get('/api/core/assistant/chat')
        self.assertEqual(unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        bad_msg = self.client_cand.post('/api/core/assistant/chat', {'message': '   '}, format='json')
        self.assertEqual(bad_msg.status_code, status.HTTP_400_BAD_REQUEST)

        # Before uploading resume, assistant acknowledges no resume exists
        chat1 = self.client_cand.post('/api/core/assistant/chat', {
            'message': 'How is my resume ATS score?',
            'input_source': 'voice',
        }, format='json')
        self.assertEqual(chat1.status_code, status.HTTP_200_OK)
        self.assertIn("haven't uploaded a resume", chat1.data['assistant_message']['content'].lower())
        self.assertEqual(chat1.data['user_message']['input_source'], 'voice')

        # Upload resume and verify persisted history + updated profile context
        self.client_cand.post('/api/resume/analyze', {
            'raw_text': 'Skills: Python, PyTorch, RAG, SQL.',
            'target_role': 'AI/ML Engineer',
        }, format='json')
        chat2 = self.client_cand.post('/api/core/assistant/chat', {
            'message': 'Check my resume score now',
            'input_source': 'text',
        }, format='json')
        self.assertEqual(chat2.status_code, status.HTTP_200_OK)
        self.assertTrue(chat2.data['context_summary']['has_resume'])
        self.assertIn('ATS alignment', chat2.data['assistant_message']['content'])

        hist = self.client_cand.get('/api/core/assistant/chat')
        self.assertEqual(hist.status_code, status.HTTP_200_OK)
        self.assertEqual(len(hist.data['messages']), 4)

        cleared = self.client_cand.delete('/api/core/assistant/chat')
        self.assertEqual(cleared.status_code, status.HTTP_200_OK)
        hist_after = self.client_cand.get('/api/core/assistant/chat')
        self.assertEqual(len(hist_after.data['messages']), 0)

    def test_groq_only_integration_pipeline_and_synonym_parsing(self):
        import json
        import os
        from unittest.mock import patch, MagicMock
        from apps.resumes.utils import analyze_resume_text
        from integrations.ai.provider import AIProviderService

        # Inline section + skill synonym detection offline
        offline_res = analyze_resume_text(
            'Skills: Postgres, K8s, ReactJS, Fast API. Education: B.Tech CS. Experience: Backend Engineer Intern at Acme.',
            target_role='Full Stack Software Engineer',
        )
        flat_offline = {s for sub in offline_res['skills_extracted'].values() for s in sub}
        self.assertIn('PostgreSQL', flat_offline)
        self.assertIn('Kubernetes', flat_offline)
        self.assertIn('React', flat_offline)
        self.assertIn('FastAPI', flat_offline)
        self.assertTrue(len(offline_res['experience']) >= 1)
        self.assertTrue(len(offline_res['education']) >= 1)

        # Mock Groq HTTP responses when ONLY GROQ_API_KEY is configured
        def fake_post(url, headers=None, json=None, timeout=None):
            resp = MagicMock()
            resp.status_code = 200
            self.assertIn('api.groq.com', url)
            self.assertEqual(headers['Authorization'], 'Bearer gsk_test_only_groq')
            model = json['model']
            self.assertEqual(model, 'llama-3.3-70b-versatile')
            content = "```json\n" + (
                '{"ats_score": 88, "executive_summary": "Strong backend and cloud fundamentals.", '
                '"skills_extracted": {"languages": ["Python"], "frameworks": ["FastAPI", "React"], '
                '"databases": ["PostgreSQL"], "tools": ["Kubernetes"], "concepts": ["System Design"]}, '
                '"missing_skills": ["Terraform"], "experience": ["Backend Engineer Intern at Acme"], '
                '"education": ["B.Tech CS"], "projects": [], "certifications": []}'
            ) + "\n```" if json.get('response_format') else "Focus on Terraform Infrastructure as Code labs next."
            resp.json.return_value = {
                'choices': [{'message': {'content': content}}],
                'usage': {'prompt_tokens': 120, 'completion_tokens': 80},
            }
            return resp

        with patch.dict(os.environ, {'GROQ_API_KEY': 'gsk_test_only_groq', 'OPENAI_API_KEY': '', 'GEMINI_API_KEY': ''}, clear=False):
            with patch('integrations.ai.provider.requests.post', side_effect=fake_post):
                llm_parsed = analyze_resume_text(
                    'Skills: Postgres, K8s, Python. Education: B.Tech CS. Experience: Backend Engineer Intern at Acme.',
                    target_role='Cloud Platform Engineer',
                    user_email='prod_cand@demo.com',
                )
                self.assertGreaterEqual(llm_parsed['ats_score'], 70)
                self.assertIn('Terraform', llm_parsed['missing_skills'])
                self.assertIn('Strong backend', llm_parsed['executive_summary'])

                mentor_reply = AIProviderService(user_email='prod_cand@demo.com').mentor_chat(
                    user_context={'first_name': 'Prod', 'target_role': 'Cloud Platform Engineer'},
                    question='What should I learn next?',
                    recent_history=[],
                )
                self.assertIn('Terraform', mentor_reply['reply'])
                self.assertTrue(mentor_reply['provider'].startswith('groq:'))
