import os
from django.conf import settings
from rest_framework import views, status, response, permissions
from apps.core.audit import log_audit_event
from .models import Resume, ResumeProcessingStatus
from .serializers import ResumeSerializer
from .utils import MAX_RESUME_BYTES, validate_and_extract_text
from .tasks import process_resume_task


class AnalyzeResumeView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        uploaded_file = request.FILES.get('resume')
        target_role = str(request.data.get('target_role') or '').strip()[:150] or 'General Role'
        job_description = str(request.data.get('job_description') or '').strip()[:15000]
        raw_text_input = str(request.data.get('raw_text') or '').strip()

        if uploaded_file:
            if getattr(uploaded_file, 'size', 0) > MAX_RESUME_BYTES:
                return response.Response(
                    {'error': 'File size exceeds the 10 MB limit.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            safe_name = os.path.basename(uploaded_file.name)[:200]
            file_bytes = uploaded_file.read()
            file_size = len(file_bytes)
            try:
                raw_text = validate_and_extract_text(file_bytes, safe_name)
            except ValueError as err:
                return response.Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
        elif raw_text_input:
            safe_name = 'pasted_resume.txt'
            file_size = len(raw_text_input.encode('utf-8'))
            raw_text = raw_text_input
        else:
            return response.Response(
                {'error': 'Please upload a valid .pdf, .docx, or .txt resume file (or provide resume text).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resume_obj = Resume.objects.create(
            user=request.user,
            file_name=safe_name,
            file_size_bytes=file_size,
            processing_status=ResumeProcessingStatus.QUEUED,
            raw_text=raw_text[:20000],
            target_role=target_role,
        )

        if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', True):
            process_resume_task.apply(args=[str(resume_obj.id), job_description])
        else:
            process_resume_task.delay(str(resume_obj.id), job_description)
        resume_obj.refresh_from_db()

        log_audit_event(
            'RESUME_ANALYZED',
            f"Resume '{safe_name}' parsed for {request.user.email} (ATS: {resume_obj.ats_score}%).",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )

        serialized = ResumeSerializer(resume_obj).data
        return response.Response({
            'message': 'Resume analyzed successfully',
            'data': serialized,
            'match_score': resume_obj.ats_score,
            'skills': resume_obj.skills_extracted,
            'missing_skills': resume_obj.missing_skills,
            'summary': resume_obj.executive_summary,
            'experience': resume_obj.experience,
            'education': resume_obj.education,
            'projects': resume_obj.projects,
            'certifications': resume_obj.certifications,
        }, status=status.HTTP_201_CREATED)


class ResumeListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        resumes = Resume.objects.filter(user=request.user).order_by('-created_at')
        return response.Response(ResumeSerializer(resumes, many=True).data)


class ResumeDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_owned_resume(self, pk, user):
        try:
            resume = Resume.objects.get(id=pk)
        except (Resume.DoesNotExist, ValueError):
            return None, response.Response({'error': 'Resume not found.'}, status=status.HTTP_404_NOT_FOUND)
        if resume.user_id != user.id and user.role != 'admin':
            return None, response.Response({'error': 'You do not have permission to access this resume.'}, status=status.HTTP_403_FORBIDDEN)
        return resume, None

    def get(self, request, pk):
        resume, err_resp = self._get_owned_resume(pk, request.user)
        if err_resp:
            return err_resp
        return response.Response(ResumeSerializer(resume).data)

    def delete(self, request, pk):
        resume, err_resp = self._get_owned_resume(pk, request.user)
        if err_resp:
            return err_resp
        file_name = resume.file_name
        resume.delete()
        log_audit_event(
            'RESUME_DELETED',
            f"User {request.user.email} deleted resume '{file_name}'.",
            level='INFO',
            user_email=request.user.email,
            request=request,
        )
        return response.Response({'message': 'Resume deleted successfully.'}, status=status.HTTP_200_OK)
