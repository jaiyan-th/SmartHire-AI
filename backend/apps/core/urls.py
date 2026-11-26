from django.urls import path
from .views import LiveHealthView, ReadyHealthView, MentorChatView

urlpatterns = [
    path('health/live', LiveHealthView.as_view(), name='health_live'),
    path('health/ready', ReadyHealthView.as_view(), name='health_ready'),
    path('assistant/chat', MentorChatView.as_view(), name='mentor_chat'),
    path('assistant/chat/', MentorChatView.as_view(), name='mentor_chat_slash'),
]
