from django.urls import path
from .admin_views import AdminOverviewView, AdminUsersView, AdminLogsView, AdminSettingsView

urlpatterns = [
    path('overview', AdminOverviewView.as_view(), name='admin_overview'),
    path('overview/', AdminOverviewView.as_view(), name='admin_overview_slash'),
    path('users', AdminUsersView.as_view(), name='admin_users'),
    path('users/', AdminUsersView.as_view(), name='admin_users_slash'),
    path('users/<uuid:pk>', AdminUsersView.as_view(), name='admin_user_detail'),
    path('users/<uuid:pk>/', AdminUsersView.as_view(), name='admin_user_detail_slash'),
    path('logs', AdminLogsView.as_view(), name='admin_logs'),
    path('logs/', AdminLogsView.as_view(), name='admin_logs_slash'),
    path('settings', AdminSettingsView.as_view(), name='admin_settings'),
    path('settings/', AdminSettingsView.as_view(), name='admin_settings_slash'),
]
