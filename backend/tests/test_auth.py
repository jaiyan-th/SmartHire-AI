from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


class AuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_forces_candidate_role_preventing_privilege_escalation(self):
        payload = {
            'email': 'attacker@test.com',
            'password': 'StrongPassword987!',
            'full_name': 'Escalation Attempt',
            'role': 'admin',  # Attempt privilege escalation
        }
        res = self.client.post('/api/auth/register', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('tokens', res.data)
        self.assertEqual(res.data['user']['role'], 'candidate')
        user = User.objects.get(email='attacker@test.com')
        self.assertEqual(user.role, 'candidate')
        self.assertFalse(user.is_staff)

    def test_login_and_password_reset_flow(self):
        User.objects.create_user(
            username='c_test',
            email='test_login@demo.com',
            password='TestPassword123!',
            full_name='Test Login User',
            role='candidate',
        )
        res = self.client.post('/api/auth/login', {'email': 'test_login@demo.com', 'password': 'TestPassword123!'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('token', res.data)
        self.assertIn('refresh', res.data['tokens'])

        # Forgot password (does not leak token in HTTP response when DEBUG=False)
        from apps.accounts.models import PasswordResetToken
        fp = self.client.post('/api/auth/forgot-password', {'email': 'test_login@demo.com'}, format='json')
        self.assertEqual(fp.status_code, status.HTTP_200_OK)
        self.assertNotIn('dev_reset_token', fp.data)
        reset_token = str(PasswordResetToken.objects.get(user__email='test_login@demo.com').token)

        # Reset password
        rp = self.client.post('/api/auth/reset-password', {'token': reset_token, 'new_password': 'NewStrongPassword456!'}, format='json')
        self.assertEqual(rp.status_code, status.HTTP_200_OK)

        # Verify new password works & old fails
        old_login = self.client.post('/api/auth/login', {'email': 'test_login@demo.com', 'password': 'TestPassword123!'}, format='json')
        self.assertEqual(old_login.status_code, status.HTTP_401_UNAUTHORIZED)
        new_login = self.client.post('/api/auth/login', {'email': 'test_login@demo.com', 'password': 'NewStrongPassword456!'}, format='json')
        self.assertEqual(new_login.status_code, status.HTTP_200_OK)

    def test_suspended_user_cannot_login(self):
        u = User.objects.create_user(
            username='suspended_u',
            email='suspended@demo.com',
            password='TestPassword123!',
            is_active=False,
        )
        res = self.client.post('/api/auth/login', {'email': u.email, 'password': 'TestPassword123!'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
