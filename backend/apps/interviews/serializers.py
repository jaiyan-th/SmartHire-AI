from rest_framework import serializers
from .models import InterviewSession, InterviewQuestion, InterviewAnswer, InterviewTemplate


class InterviewQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = ['id', 'order', 'category', 'competency', 'prompt', 'expected_keywords']


class InterviewAnswerSerializer(serializers.ModelSerializer):
    media_recording_url = serializers.SerializerMethodField()

    class Meta:
        model = InterviewAnswer
        fields = [
            'id', 'question', 'input_mode', 'language', 'transcript_text', 'code_text',
            'wpm', 'filler_words_count', 'filler_words_detected',
            'eye_contact_percentage', 'attention_score', 'engagement_score',
            'dominant_emotion', 'grammar_score', 'pronunciation_score',
            'media_recording_url', 'duration_seconds', 'created_at', 'updated_at'
        ]

    def get_media_recording_url(self, obj):
        if obj.media_recording:
            try:
                return obj.media_recording.url
            except Exception:
                return None
        return None


class InterviewSessionSerializer(serializers.ModelSerializer):
    questions = InterviewQuestionSerializer(many=True, read_only=True)
    answers = InterviewAnswerSerializer(many=True, read_only=True)
    candidate_email = serializers.CharField(source='candidate.email', read_only=True, default='')
    candidate_name = serializers.CharField(source='candidate.full_name', read_only=True, default='')

    class Meta:
        model = InterviewSession
        fields = [
            'id', 'candidate', 'candidate_email', 'candidate_name', 'domain',
            'category', 'difficulty', 'duration_minutes', 'focus_skills',
            'status', 'current_question_index', 'total_questions',
            'proctoring_flagged', 'camera_enabled', 'recording_consent',
            'is_recruiter_assigned', 'shared_with_recruiters', 'deadline',
            'recruiter_status', 'recruiter_notes',
            'started_at', 'completed_at', 'created_at',
            'questions', 'answers'
        ]
        read_only_fields = ['id', 'candidate', 'created_at']


class InterviewTemplateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default='Recruiter')

    class Meta:
        model = InterviewTemplate
        fields = [
            'id', 'created_by', 'created_by_name', 'title', 'description', 'domain',
            'level', 'category', 'duration_minutes', 'time_limit_per_question',
            'question_count', 'target_skills', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at']
