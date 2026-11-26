from django.db import models
import uuid


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    level = models.CharField(max_length=20, default='INFO', db_index=True)  # INFO, WARN, ERROR, AUTH
    event_type = models.CharField(max_length=100, db_index=True)
    user_email = models.CharField(max_length=255, blank=True, default='anonymous')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    message = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.level}] {self.event_type} - {self.timestamp}"


class PlatformConfig(models.Model):
    id = models.IntegerField(primary_key=True, default=1)
    llm_backend = models.CharField(max_length=100, default='Groq Llama-3.1-8B-Instant')
    temperature = models.FloatField(default=0.4)
    max_tokens = models.IntegerField(default=1500)
    max_question_count = models.IntegerField(default=10)
    daily_token_budget = models.IntegerField(default=500000)
    maintenance_mode = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


class AIUsageRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_email = models.CharField(max_length=255, blank=True, default='system')
    operation = models.CharField(max_length=60)  # question_gen, evaluation, resume_parse
    provider = models.CharField(max_length=50, default='deterministic_fallback')
    model_name = models.CharField(max_length=100, default='rule-rubric-v1')
    prompt_tokens = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    estimated_cost_usd = models.FloatField(default=0.0)
    latency_ms = models.IntegerField(default=0)
    success = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class BackgroundJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task_name = models.CharField(max_length=120)
    target_id = models.CharField(max_length=120, blank=True, default='')
    status = models.CharField(max_length=30, default='completed')  # queued, processing, completed, failed
    attempts = models.IntegerField(default=1)
    error_message = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
