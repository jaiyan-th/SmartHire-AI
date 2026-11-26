from rest_framework import serializers
from .models import Evaluation

class EvaluationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Evaluation
        fields = [
            'id', 'session', 'communication_score', 'confidence_score',
            'technical_relevance_score', 'professionalism_score',
            'overall_score', 'rating_band', 'strengths', 'weaknesses',
            'improvement_suggestions', 'practice_recommendations',
            'learning_resources', 'question_evaluations', 'created_at'
        ]
