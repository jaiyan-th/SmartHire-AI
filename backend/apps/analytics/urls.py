from django.urls import path
from .views import InsightsAnalyticsView, SkillGapView, ToggleMilestoneView

urlpatterns = [
    path('insights', InsightsAnalyticsView.as_view(), name='analytics_insights'),
    path('insights/', InsightsAnalyticsView.as_view(), name='analytics_insights_slash'),
    path('skill-gap', SkillGapView.as_view(), name='analytics_skill_gap'),
    path('skill-gap/', SkillGapView.as_view(), name='analytics_skill_gap_slash'),
    path('skill-gap/milestone', ToggleMilestoneView.as_view(), name='analytics_skill_gap_milestone'),
    path('skill-gap/milestone/', ToggleMilestoneView.as_view(), name='analytics_skill_gap_milestone_slash'),
]
