from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
import uuid


class UserRole(models.TextChoices):
    CANDIDATE = 'candidate', 'Candidate'
    RECRUITER = 'recruiter', 'Recruiter'
    ADMIN = 'admin', 'Administrator'


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.CANDIDATE)
    full_name = models.CharField(max_length=150, blank=True)
    headline = models.CharField(max_length=255, blank=True, default='')
    target_role = models.CharField(max_length=150, blank=True, default='')
    organization = models.CharField(max_length=150, blank=True, default='')
    phone = models.CharField(max_length=30, blank=True)
    bio = models.TextField(blank=True, default='')
    avatar_url = models.URLField(blank=True, default='')
    is_email_verified = models.BooleanField(default=False)
    recording_consent = models.BooleanField(default=False)
    webcam_consent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        if not self.full_name and self.first_name:
            self.full_name = f"{self.first_name} {self.last_name}".strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} ({self.role})"


class PasswordResetToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_tokens')
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        return not self.used and timezone.now() < self.expires_at


class EmailVerificationToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='email_verification_tokens')
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        return not self.used and timezone.now() < self.expires_at
