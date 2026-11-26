from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.interviews.models import InterviewSession

User = get_user_model()


class InterviewLifecycleTests(TestCase):
    def setUp(self):
        self.cand = User.objects.create_user(username='int_c', email='intc@demo.com', password='Password123!', role='candidate', full_name='Int Cand')
        self.rec = User.objects.create_user(username='int_r', email='intr@demo.com', password='Password123!', role='recruiter', full_name='Int Rec')
        self.client = APIClient()
        self.client.force_authenticate(user=self.cand)

    def test_full_interview_lifecycle_recovery_and_pdf_report(self):
        # 1. Start interview (with camera disabled to verify camera-optional fairness)
        start_res = self.client.post('/api/interview/start', {
            'domain': 'Software Engineering',
            'category': 'Technical',
            'difficulty': 'Mid-Level',
            'question_count': 2,
            'camera_enabled': False,
            'recording_consent': True,
        }, format='json')
        self.assertEqual(start_res.status_code, status.HTTP_201_CREATED)
        session_id = start_res.data['session_id']
        session = InterviewSession.objects.get(id=session_id)
        self.assertEqual(session.questions.count(), 2)
        questions = list(session.questions.order_by('order'))
        q1_id = str(questions[0].id)
        q2_id = str(questions[1].id)

        # 2. Submit answer twice for Q1 (verify idempotency: no duplicate answers) + submit Q2
        ans_payload = {
            'session_id': session_id,
            'question_id': q1_id,
            'input_mode': 'speech',
            'transcript_text': 'Object-oriented programming uses encapsulation, abstraction, inheritance, and polymorphism via overriding interfaces.',
            'duration_seconds': 40,
            'eye_contact_percentage': 0.0,
        }
        self.assertEqual(self.client.post('/api/interview/answer', ans_payload, format='json').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post('/api/interview/answer', ans_payload, format='json').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post('/api/interview/answer', {
            'session_id': session_id,
            'question_id': q2_id,
            'input_mode': 'speech',
            'transcript_text': 'The 7 OSI layers range from Physical to Application. TCP uses a 3-way handshake for reliability while UDP is connectionless.',
            'duration_seconds': 35,
            'eye_contact_percentage': 0.0,
        }, format='json').status_code, status.HTTP_200_OK)
        self.assertEqual(session.answers.count(), 2)

        # 3. Session recovery check
        rec_res = self.client.get(f'/api/interview/{session_id}')
        self.assertEqual(rec_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(rec_res.data['answers']), 2)

        # 4. Finish & verify deterministic scoring without camera penalty
        finish_res = self.client.post('/api/interview/finish', {'session_id': session_id}, format='json')
        self.assertEqual(finish_res.status_code, status.HTTP_200_OK)
        ev = finish_res.data['evaluation']
        self.assertGreaterEqual(ev['confidence_score'], 75)
        self.assertEqual(len(ev['question_evaluations']), 2)

        # 5. Insights & PDF report download check
        ins_res = self.client.get(f'/api/analytics/insights?session_id={session_id}')
        self.assertEqual(ins_res.status_code, status.HTTP_200_OK)
        self.assertTrue(ins_res.data['has_data'])

        pdf_res = self.client.get(f'/api/reports/download-pdf?session_id={session_id}')
        self.assertEqual(pdf_res.status_code, status.HTTP_200_OK)
        self.assertEqual(pdf_res['Content-Type'], 'application/pdf')
        self.assertTrue(pdf_res.content.startswith(b'%PDF'))

    def test_recruiter_assign_and_review_workflow(self):
        rec_client = APIClient()
        rec_client.force_authenticate(user=self.rec)

        assign_res = rec_client.post('/api/recruiter/assign', {
            'candidate_email': self.cand.email,
            'domain': 'AI/ML',
            'difficulty': 'Senior',
            'question_count': 2,
        }, format='json')
        self.assertEqual(assign_res.status_code, status.HTTP_201_CREATED)
        sess_id = assign_res.data['session']['id']

        review_res = rec_client.patch(f'/api/recruiter/candidates/{sess_id}/review', {
            'recruiter_status': 'shortlisted',
            'recruiter_notes': 'Strong architecture depth.',
        }, format='json')
        self.assertEqual(review_res.status_code, status.HTTP_200_OK)
        self.assertEqual(review_res.data['recruiter_status'], 'shortlisted')
