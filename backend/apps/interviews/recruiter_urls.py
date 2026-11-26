from django.urls import path
from .recruiter_views import (
    RecruiterCandidatesView,
    RecruiterReviewSessionView,
    RecruiterAssignAssessmentView,
    RecruiterCompareView,
    RecruiterExportCsvView,
    RecruiterTemplateView,
    RecruiterTemplateDetailView,
)

urlpatterns = [
    path('candidates', RecruiterCandidatesView.as_view(), name='recruiter_candidates'),
    path('candidates/', RecruiterCandidatesView.as_view(), name='recruiter_candidates_slash'),
    path('candidates/<uuid:pk>/review', RecruiterReviewSessionView.as_view(), name='recruiter_review'),
    path('candidates/<uuid:pk>/review/', RecruiterReviewSessionView.as_view(), name='recruiter_review_slash'),
    path('assign', RecruiterAssignAssessmentView.as_view(), name='recruiter_assign'),
    path('assign/', RecruiterAssignAssessmentView.as_view(), name='recruiter_assign_slash'),
    path('compare', RecruiterCompareView.as_view(), name='recruiter_compare'),
    path('compare/', RecruiterCompareView.as_view(), name='recruiter_compare_slash'),
    path('export-csv', RecruiterExportCsvView.as_view(), name='recruiter_export_csv'),
    path('export-csv/', RecruiterExportCsvView.as_view(), name='recruiter_export_csv_slash'),
    path('templates', RecruiterTemplateView.as_view(), name='recruiter_templates'),
    path('templates/', RecruiterTemplateView.as_view(), name='recruiter_templates_slash'),
    path('templates/<uuid:pk>', RecruiterTemplateDetailView.as_view(), name='recruiter_template_detail'),
    path('templates/<uuid:pk>/', RecruiterTemplateDetailView.as_view(), name='recruiter_template_detail_slash'),
]
