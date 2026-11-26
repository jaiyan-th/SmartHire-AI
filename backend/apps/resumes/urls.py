from django.urls import path
from .views import AnalyzeResumeView, ResumeListView, ResumeDetailView

urlpatterns = [
    path('analyze', AnalyzeResumeView.as_view(), name='resume_analyze'),
    path('analyze/', AnalyzeResumeView.as_view(), name='resume_analyze_slash'),
    path('history', ResumeListView.as_view(), name='resume_history'),
    path('history/', ResumeListView.as_view(), name='resume_history_slash'),
    path('<uuid:pk>', ResumeDetailView.as_view(), name='resume_detail'),
    path('<uuid:pk>/', ResumeDetailView.as_view(), name='resume_detail_slash'),
]
