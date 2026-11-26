from django.db import models
from django.conf import settings
import uuid


class InterviewStatus(models.TextChoices):
    DRAFT = 'draft', 'Draft'
    READY = 'ready', 'Ready'
    IN_PROGRESS = 'in_progress', 'In Progress'
    SUBMITTED = 'submitted', 'Submitted'
    PROCESSING = 'processing', 'Processing'
    COMPLETED = 'completed', 'Completed'
    CANCELLED = 'cancelled', 'Cancelled'
    EXPIRED = 'expired', 'Expired'


class RecruiterReviewStatus(models.TextChoices):
    PENDING = 'pending', 'Pending Review'
    SHORTLISTED = 'shortlisted', 'Shortlisted'
    FLAGGED = 'flagged_for_review', 'Flagged for Review'
    REJECTED = 'rejected', 'Rejected'


class InterviewTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='templates')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    domain = models.CharField(max_length=100, default='Software Engineering')
    level = models.CharField(max_length=50, default='Mid-Level')
    category = models.CharField(max_length=50, default='Technical')
    duration_minutes = models.IntegerField(default=25)
    time_limit_per_question = models.IntegerField(default=120)
    question_count = models.IntegerField(default=5)
    target_skills = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Template: {self.title} ({self.domain})"


class InterviewSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='interview_sessions', null=True, blank=True)
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='assigned_interviews', null=True, blank=True)
    template = models.ForeignKey(InterviewTemplate, on_delete=models.SET_NULL, null=True, blank=True)
    domain = models.CharField(max_length=100, default='Software Engineering')
    category = models.CharField(max_length=50, default='Technical')
    difficulty = models.CharField(max_length=50, default='Mid-Level')
    duration_minutes = models.IntegerField(default=20)
    focus_skills = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=30, choices=InterviewStatus.choices, default=InterviewStatus.READY)
    current_question_index = models.IntegerField(default=0)
    total_questions = models.IntegerField(default=5)
    proctoring_flagged = models.BooleanField(default=False)
    camera_enabled = models.BooleanField(default=True)
    recording_consent = models.BooleanField(default=True)

    # Privacy & Recruiter Visibility Isolation
    is_recruiter_assigned = models.BooleanField(default=False)
    shared_with_recruiters = models.BooleanField(default=False)
    deadline = models.DateTimeField(null=True, blank=True)
    recruiter_status = models.CharField(
        max_length=30,
        choices=RecruiterReviewStatus.choices,
        default=RecruiterReviewStatus.PENDING,
    )
    recruiter_notes = models.TextField(blank=True, default='')
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='reviewed_sessions', null=True, blank=True)

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Session {str(self.id)[:8]} - {self.domain} ({self.status})"


class InterviewQuestion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(InterviewSession, on_delete=models.CASCADE, related_name='questions')
    order = models.IntegerField(default=1)
    category = models.CharField(max_length=50, default='Technical')
    competency = models.CharField(max_length=100, default='General Engineering')
    prompt = models.TextField()
    expected_keywords = models.JSONField(default=list, blank=True)
    model_answer = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"Q{self.order}: {self.prompt[:50]}..."


class InterviewAnswer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(InterviewSession, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey(InterviewQuestion, on_delete=models.CASCADE, related_name='answers')
    input_mode = models.CharField(max_length=20, default='speech')  # 'speech' or 'code'
    language = models.CharField(max_length=30, default='python')
    transcript_text = models.TextField(blank=True, default='')
    code_text = models.TextField(blank=True, default='')
    wpm = models.IntegerField(default=0)
    filler_words_count = models.IntegerField(default=0)
    filler_words_detected = models.JSONField(default=list, blank=True)
    eye_contact_percentage = models.FloatField(default=0.0)
    attention_score = models.FloatField(default=0.0)
    engagement_score = models.FloatField(default=0.0)
    dominant_emotion = models.CharField(max_length=40, blank=True, default='Neutral')
    grammar_score = models.FloatField(default=0.0)
    pronunciation_score = models.FloatField(default=0.0)
    media_recording = models.FileField(upload_to='interview_recordings/%Y/%m/', null=True, blank=True)
    duration_seconds = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('session', 'question')

    def __str__(self):
        return f"Answer for Q{self.question.order} in Session {str(self.session.id)[:8]}"


class RoadmapMilestone(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='roadmap_milestones')
    milestone_key = models.CharField(max_length=100)
    completed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'milestone_key')
