from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
import uuid
from .models import User, UserRole


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'full_name', 'role', 'headline',
            'target_role', 'organization', 'phone', 'bio', 'avatar_url',
            'is_email_verified', 'recording_consent', 'webcam_consent',
            'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'email', 'username', 'role', 'is_email_verified', 'is_active', 'created_at']


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'full_name', 'headline', 'target_role', 'organization',
            'phone', 'bio', 'recording_consent', 'webcam_consent'
        ]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['email', 'password', 'full_name', 'organization', 'headline', 'target_role']

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return normalized

    def create(self, validated_data):
        email = validated_data['email']
        base_name = email.split('@')[0][:20]
        username = f"{base_name}_{uuid.uuid4().hex[:8]}"
        # Security: Public registration ALWAYS creates a Candidate role.
        # Recruiter/Admin elevation requires an Administrator.
        user = User.objects.create_user(
            username=username,
            email=email,
            password=validated_data['password'],
            full_name=validated_data.get('full_name', '').strip() or base_name.title(),
            role=UserRole.CANDIDATE,
            organization=validated_data.get('organization', '').strip(),
            headline=validated_data.get('headline', 'Software Engineering Candidate').strip(),
            target_role=validated_data.get('target_role', 'Full Stack Software Engineer').strip(),
        )
        return user


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value
