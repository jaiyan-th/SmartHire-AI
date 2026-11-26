import os
from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Notification
from apps.interviews.models import InterviewAnswer, InterviewSession

User = get_user_model()


class PDFFullAuditTests(TestCase):
    def setUp(self):
        self.cand1 = User.objects.create_user(username='pdf_c1', email='pdf_c1@demo.com', password='Password123!', role='candidate', full_name='Alpha Cand')
        self.cand2 = User.objects.create_user(username='pdf_c2', email='pdf_c2@demo.com', password='Password123!', role='candidate', full_name='Beta Cand')
        self.recruiter = User.objects.create_user(username='pdf_rec', email='pdf_rec@demo.com', password='Password123!', role='recruiter', full_name='Lead Recruiter')

        self.c1_client = APIClient()
        self.c1_client.force_authenticate(user=self.cand1)
        self.c2_client = APIClient()
        self.c2_client.force_authenticate(user=self.cand2)
        self.rec_client = APIClient()
        self.rec_client.force_authenticate(user=self.recruiter)

    def test_oauth2_google_start_and_callback_flow(self):
        with patch.dict(os.environ, {
            'GOOGLE_OAUTH_CLIENT_ID': 'test-google-cid',
            'GOOGLE_OAUTH_CLIENT_SECRET': 'test-google-secret',
        }):
            start_res = APIClient().get('/api/auth/oauth/google/start?redirect_uri=http://127.0.0.1:8000/auth/oauth/google')
            self.assertEqual(start_res.status_code, status.HTTP_200_OK)
            self.assertIn('accounts.google.com/o/oauth2/v2/auth', start_res.data['authorization_url'])
            state = start_res.data['state']

            tok_resp = MagicMock()
            tok_resp.raise_for_status.return_value = None
            tok_resp.json.return_value = {'access_token': 'mock-google-tok'}

            prof_resp = MagicMock()
            prof_resp.raise_for_status.return_value = None
            prof_resp.json.return_value = {'email': 'oauth_user@demo.com', 'verified_email': True, 'name': 'OAuth Candidate'}

            with patch('apps.accounts.views.requests.post', return_value=tok_resp), \
                 patch('apps.accounts.views.requests.get', return_value=prof_resp):
                cb_res = APIClient().post('/api/auth/oauth/google/callback', {
                    'code': 'auth-code-123',
                    'state': state,
                    'redirect_uri': 'http://127.0.0.1:8000/auth/oauth/google',
                }, format='json')
                self.assertEqual(cb_res.status_code, status.HTTP_200_OK)
                self.assertIn('access', cb_res.data['tokens'])
                self.assertEqual(cb_res.data['user']['email'], 'oauth_user@demo.com')
                self.assertTrue(cb_res.data['user']['is_email_verified'])

    def test_whisper_transcription_multipart_media_behavior_and_ranking(self):
        # 1. Whisper transcription endpoint
        mock_stt = MagicMock()
        mock_stt.status_code = 200
        mock_stt.json.return_value = {'text': 'I implemented PostgreSQL B-Tree indexes to reduce query latency by 65 percent.'}

        fake_audio = SimpleUploadedFile('speech.webm', b'WEBM_MOCK_AUDIO_BYTES_1234', content_type='audio/webm')
        with patch.dict(os.environ, {'GROQ_API_KEY': 'gsk_mock_whisper'}), \
             patch('integrations.ai.provider.requests.post', return_value=mock_stt):
            stt_res = self.c1_client.post('/api/interview/transcribe', {'audio': fake_audio}, format='multipart')
            self.assertEqual(stt_res.status_code, status.HTTP_200_OK)
            self.assertIn('PostgreSQL', stt_res.data['transcript'])

        # 2. Recruiter assigns upcoming deadline -> triggers Notification + due-soon reminder
        due_soon = (timezone.now() + timedelta(hours=12)).isoformat()
        assign1 = self.rec_client.post('/api/recruiter/assign', {
            'candidate_email': self.cand1.email,
            'domain': 'Backend Engineering',
            'difficulty': 'Mid-Level',
            'question_count': 1,
            'deadline': due_soon,
        }, format='json')
        self.assertEqual(assign1.status_code, status.HTTP_201_CREATED)
        s1_id = assign1.data['session']['id']

        notif_res = self.c1_client.get('/api/core/notifications')
        self.assertEqual(notif_res.status_code, status.HTTP_200_OK)
        categories = {n['category'] for n in notif_res.data['notifications']}
        self.assertIn('assignment', categories)
        self.assertIn('reminder', categories)
        self.assertGreaterEqual(notif_res.data['unread_count'], 2)

        # Mark notifications read
        mark_res = self.c1_client.patch('/api/core/notifications', {}, format='json')
        self.assertEqual(mark_res.data['unread_count'], 0)

        # 3. Candidate 1 submits multipart answer with recorded clip + genuine CV telemetry
        s1 = InterviewSession.objects.get(id=s1_id)
        q1_id = str(s1.questions.first().id)
        clip = SimpleUploadedFile('clip.webm', b'WEBM_CLIP_DATA_5678', content_type='video/webm')
        ans1_res = self.c1_client.post('/api/interview/answer', {
            'session_id': s1_id,
            'question_id': q1_id,
            'input_mode': 'speech',
            'language': 'python',
            'transcript_text': 'Encapsulation, polymorphism, and indexing ensure maintainable and scalable services.',
            'code_text': '',
            'duration_seconds': '35',
            'eye_contact_percentage': '88',
            'attention_score': '86',
            'engagement_score': '84',
            'dominant_emotion': 'Confident',
            'media_recording': clip,
        }, format='multipart')
        self.assertEqual(ans1_res.status_code, status.HTTP_200_OK)
        ans1 = InterviewAnswer.objects.get(session=s1, question_id=q1_id)
        self.assertEqual(ans1.dominant_emotion, 'Confident')
        self.assertGreater(ans1.grammar_score, 0)
        self.assertGreater(ans1.pronunciation_score, 0)
        self.assertTrue(bool(ans1.media_recording))

        fin1 = self.c1_client.post('/api/interview/finish', {'session_id': s1_id}, format='json')
        self.assertEqual(fin1.status_code, status.HTTP_200_OK)
        self.assertIn('evaluation', fin1.data)

        # 4. Candidate 2 completes a weaker assigned interview -> verify Recruiter Ranking + Percentile
        assign2 = self.rec_client.post('/api/recruiter/assign', {
            'candidate_email': self.cand2.email,
            'domain': 'Backend Engineering',
            'difficulty': 'Mid-Level',
            'question_count': 1,
        }, format='json')
        s2_id = assign2.data['session']['id']
        q2_id = str(InterviewSession.objects.get(id=s2_id).questions.first().id)
        self.c2_client.post('/api/interview/answer', {
            'session_id': s2_id,
            'question_id': q2_id,
            'input_mode': 'speech',
            'transcript_text': 'um like idk basically',
            'duration_seconds': 30,
            'eye_contact_percentage': 32,
            'attention_score': 35,
            'engagement_score': 30,
            'dominant_emotion': 'Looking Away',
        }, format='json')
        self.c2_client.post('/api/interview/finish', {'session_id': s2_id}, format='json')

        roster = self.rec_client.get('/api/recruiter/candidates?sort=rank')
        self.assertEqual(roster.status_code, status.HTTP_200_OK)
        self.assertEqual(len(roster.data['candidates']), 2)
        top = roster.data['candidates'][0]
        second = roster.data['candidates'][1]
        self.assertEqual(top['rank'], 1)
        self.assertEqual(top['percentile'], 100)
        self.assertEqual(second['rank'], 2)
        self.assertEqual(top['candidate_email'], self.cand1.email)
        if ans1.media_recording:
            ans1.media_recording.delete(save=False)
