from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


class ResumeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='res_u', email='res@demo.com', password='Password123!', role='candidate')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_analyze_resume_raw_text_and_history_delete(self):
        payload = {
            'raw_text': 'Experienced Python developer skilled in Django, React, PostgreSQL, Docker, Git, and REST API.\nEducation\nB.Tech Computer Science\nExperience\nBuilt scalable APIs.',
            'target_role': 'Full Stack Developer',
        }
        res = self.client.post('/api/resume/analyze', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertGreater(res.data['match_score'], 50)
        self.assertIn('Python', res.data['skills']['languages'])
        self.assertEqual(len(res.data['education']), 1)
        self.assertEqual(len(res.data['experience']), 1)

        resume_id = res.data['data']['id']
        del_res = self.client.delete(f'/api/resume/{resume_id}')
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)

    def test_reject_corrupted_pdf_magic_bytes(self):
        fake_pdf = SimpleUploadedFile('malware.pdf', b'NOT_A_REAL_PDF_EXE', content_type='application/pdf')
        res = self.client.post('/api/resume/analyze', {'resume': fake_pdf, 'target_role': 'Backend'}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('PDF', res.data['error'])
