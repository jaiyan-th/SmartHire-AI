from django.db import models
from django.conf import settings
import uuid


class ResumeProcessingStatus(models.TextChoices):
    UPLOADED = 'uploaded', 'Uploaded'
    QUEUED = 'queued', 'Queued'
    PROCESSING = 'processing', 'Processing'
    COMPLETED = 'completed', 'Completed'
    FAILED = 'failed', 'Failed'


class Resume(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='resumes', null=True, blank=True)
    file_name = models.CharField(max_length=255)
    file_size_bytes = models.IntegerField(default=0)
    processing_status = models.CharField(
        max_length=20,
        choices=ResumeProcessingStatus.choices,
        default=ResumeProcessingStatus.COMPLETED,
    )
    error_message = models.TextField(blank=True, default='')
    raw_text = models.TextField(blank=True, default='')
    target_role = models.CharField(max_length=150, blank=True, default='Full Stack Software Engineer')
    ats_score = models.IntegerField(default=0)
    executive_summary = models.TextField(blank=True, default='')
    skills_extracted = models.JSONField(default=dict, blank=True)
    missing_skills = models.JSONField(default=list, blank=True)
    experience = models.JSONField(default=list, blank=True)
    education = models.JSONField(default=list, blank=True)
    certifications = models.JSONField(default=list, blank=True)
    projects = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Resume: {self.file_name} (Score: {self.ats_score})"
