from rest_framework import serializers
from .models import Resume


class ResumeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resume
        fields = [
            'id', 'user', 'file_name', 'file_size_bytes', 'processing_status',
            'error_message', 'target_role', 'ats_score', 'executive_summary',
            'skills_extracted', 'missing_skills', 'experience', 'education',
            'certifications', 'projects', 'created_at'
        ]
        read_only_fields = ['id', 'user', 'created_at']
