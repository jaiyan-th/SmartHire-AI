from django.urls import path
from .views import LiveHealthView, ReadyHealthView, MentorChatView, NotificationListView

urlpatterns = [
    path('health/live', LiveHealthView.as_view(), name='health_live'),
    path('health/ready', ReadyHealthView.as_view(), name='health_ready'),
    path('assistant/chat', MentorChatView.as_view(), name='mentor_chat'),
    path('assistant/chat/', MentorChatView.as_view(), name='mentor_chat_slash'),
    path('notifications', NotificationListView.as_view(), name='notifications_list'),
    path('notifications/', NotificationListView.as_view(), name='notifications_list_slash'),
]
