from celery import shared_task
from apps.core.models import BackgroundJob
from .models import Resume, ResumeProcessingStatus
from .utils import analyze_resume_text


@shared_task(bind=True, max_retries=2)
def process_resume_task(self, resume_id: str, job_description: str = ''):
    job = BackgroundJob.objects.create(
        task_name='process_resume_task',
        target_id=str(resume_id),
        status='processing',
    )
    try:
        resume = Resume.objects.get(id=resume_id)
        resume.processing_status = ResumeProcessingStatus.PROCESSING
        resume.save(update_fields=['processing_status'])

        analysis = analyze_resume_text(
            resume.raw_text,
            target_role=resume.target_role,
            job_description=job_description,
            user_email=resume.user.email,
        )

        resume.ats_score = analysis['ats_score']
        resume.executive_summary = analysis['executive_summary']
        resume.skills_extracted = analysis['skills_extracted']
        resume.missing_skills = analysis['missing_skills']
        resume.experience = analysis['experience']
        resume.education = analysis['education']
        resume.certifications = analysis['certifications']
        resume.projects = analysis['projects']
        resume.processing_status = ResumeProcessingStatus.COMPLETED
        resume.save()

        job.status = 'completed'
        job.save(update_fields=['status', 'updated_at'])
        return {'resume_id': str(resume.id), 'ats_score': resume.ats_score}
    except Exception as exc:
        Resume.objects.filter(id=resume_id).update(
            processing_status=ResumeProcessingStatus.FAILED,
            error_message=str(exc),
        )
        job.status = 'failed'
        job.error_message = str(exc)
        job.save(update_fields=['status', 'error_message', 'updated_at'])
        raise
