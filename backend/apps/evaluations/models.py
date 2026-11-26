from django.db import models
from django.conf import settings
import uuid
from apps.interviews.models import InterviewSession

class Evaluation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.OneToOneField(InterviewSession, on_delete=models.CASCADE, related_name='evaluation')
    communication_score = models.FloatField(default=85.0)
    confidence_score = models.FloatField(default=88.0)
    technical_relevance_score = models.FloatField(default=84.0)
    professionalism_score = models.FloatField(default=80.0)
    overall_score = models.FloatField(default=84.85)
    rating_band = models.CharField(max_length=50, default='Good')

    # AI feedback breakdown
    strengths = models.JSONField(default=list, blank=True)
    weaknesses = models.JSONField(default=list, blank=True)
    improvement_suggestions = models.JSONField(default=list, blank=True)
    practice_recommendations = models.JSONField(default=list, blank=True)
    learning_resources = models.JSONField(default=list, blank=True)
    question_evaluations = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Evaluation for Session {str(self.session.id)[:8]} (Score: {self.overall_score})"
