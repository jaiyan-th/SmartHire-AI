from django.urls import path
from .views import (
    StartInterviewView,
    SessionDetailView,
    CancelInterviewView,
    ProctoringTelemetryView,
    SubmitAnswerView,
    TranscribeAudioView,
    FinishInterviewView,
    ShareSessionView,
    InterviewHistoryView,
)

urlpatterns = [
    path('start', StartInterviewView.as_view(), name='interview_start'),
    path('start/', StartInterviewView.as_view(), name='interview_start_slash'),
    path('answer', SubmitAnswerView.as_view(), name='interview_answer'),
    path('answer/', SubmitAnswerView.as_view(), name='interview_answer_slash'),
    path('transcribe', TranscribeAudioView.as_view(), name='interview_transcribe'),
    path('transcribe/', TranscribeAudioView.as_view(), name='interview_transcribe_slash'),
    path('finish', FinishInterviewView.as_view(), name='interview_finish'),
    path('finish/', FinishInterviewView.as_view(), name='interview_finish_slash'),
    path('history', InterviewHistoryView.as_view(), name='interview_history'),
    path('history/', InterviewHistoryView.as_view(), name='interview_history_slash'),
    path('<uuid:pk>', SessionDetailView.as_view(), name='interview_detail'),
    path('<uuid:pk>/', SessionDetailView.as_view(), name='interview_detail_slash'),
    path('<uuid:pk>/cancel', CancelInterviewView.as_view(), name='interview_cancel'),
    path('<uuid:pk>/cancel/', CancelInterviewView.as_view(), name='interview_cancel_slash'),
    path('<uuid:pk>/telemetry', ProctoringTelemetryView.as_view(), name='interview_telemetry'),
    path('<uuid:pk>/telemetry/', ProctoringTelemetryView.as_view(), name='interview_telemetry_slash'),
    path('<uuid:pk>/share', ShareSessionView.as_view(), name='interview_share'),
    path('<uuid:pk>/share/', ShareSessionView.as_view(), name='interview_share_slash'),
]
