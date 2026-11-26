from django.urls import path
from .views import LatestEvaluationView

urlpatterns = [
    path('latest', LatestEvaluationView.as_view(), name='evaluation_latest'),
    path('latest/', LatestEvaluationView.as_view(), name='evaluation_latest_slash'),
]
