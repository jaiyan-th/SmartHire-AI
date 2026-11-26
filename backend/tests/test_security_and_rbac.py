from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from apps.interviews.models import InterviewSession, InterviewStatus
from apps.resumes.models import Resume

User = get_user_model()


class SecurityAndRBACTests(TestCase):
    def setUp(self):
        self.cand_a = User.objects.create_user(username='cand_a', email='canda@demo.com', password='Password123!', role='candidate', full_name='Cand A')
        self.cand_b = User.objects.create_user(username='cand_b', email='candb@demo.com', password='Password123!', role='candidate', full_name='Cand B')
        self.recruiter = User.objects.create_user(username='rec_1', email='rec@demo.com', password='Password123!', role='recruiter', full_name='Recruiter 1')
        self.admin = User.objects.create_user(username='adm_1', email='adm@demo.com', password='Password123!', role='admin', full_name='Admin 1', is_staff=True)

        self.client_anon = APIClient()
        self.client_a = APIClient()
        self.client_b = APIClient()
        self.client_rec = APIClient()
        self.client_adm = APIClient()

        self.client_a.force_authenticate(user=self.cand_a)
        self.client_b.force_authenticate(user=self.cand_b)
        self.client_rec.force_authenticate(user=self.recruiter)
        self.client_adm.force_authenticate(user=self.admin)

    def test_unauthenticated_access_blocked(self):
        for endpoint in ['/api/auth/me', '/api/analytics/insights', '/api/recruiter/candidates', '/api/admin-terminal/overview']:
            res = self.client_anon.get(endpoint)
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED, f"{endpoint} should require auth")

    def test_rbac_enforcement(self):
        # Candidate blocked from Recruiter and Admin endpoints
        self.assertEqual(self.client_a.get('/api/recruiter/candidates').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client_a.get('/api/admin-terminal/overview').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client_a.get('/api/admin-terminal/users').status_code, status.HTTP_403_FORBIDDEN)

        # Recruiter allowed on recruiter endpoints, blocked from Admin endpoints
        self.assertEqual(self.client_rec.get('/api/recruiter/candidates').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client_rec.get('/api/admin-terminal/overview').status_code, status.HTTP_403_FORBIDDEN)

        # Admin allowed on Admin endpoints
        self.assertEqual(self.client_adm.get('/api/admin-terminal/overview').status_code, status.HTTP_200_OK)

    def test_idor_protection_on_resumes_and_interviews(self):
        resume_a = Resume.objects.create(user=self.cand_a, file_name='secret_a.pdf', ats_score=80)
        self.assertEqual(self.client_b.get(f'/api/resume/{resume_a.id}').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client_b.delete(f'/api/resume/{resume_a.id}').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client_a.get(f'/api/resume/{resume_a.id}').status_code, status.HTTP_200_OK)

        private_sess = InterviewSession.objects.create(
            candidate=self.cand_a, domain='Software Engineering', status=InterviewStatus.IN_PROGRESS,
            is_recruiter_assigned=False, shared_with_recruiters=False,
        )
        # Candidate B cannot view or submit to Candidate A's session
        self.assertEqual(self.client_b.get(f'/api/interview/{private_sess.id}').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client_b.post('/api/interview/finish', {'session_id': str(private_sess.id)}, format='json').status_code, status.HTTP_403_FORBIDDEN)

        # Recruiter CANNOT automatically see private practice session!
        rec_list = self.client_rec.get('/api/recruiter/candidates').data['candidates']
        self.assertFalse(any(c['session_id'] == str(private_sess.id) for c in rec_list))

        # Candidate explicitly shares -> now Recruiter CAN see it
        self.client_a.patch(f'/api/interview/{private_sess.id}/share', {'shared_with_recruiters': True}, format='json')
        rec_list_after = self.client_rec.get('/api/recruiter/candidates').data['candidates']
        self.assertTrue(any(c['session_id'] == str(private_sess.id) for c in rec_list_after))
