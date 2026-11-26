from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView,
    LoginView,
    LogoutView,
    ProfileView,
    ChangePasswordView,
    ForgotPasswordView,
    ResetPasswordView,
    VerifyEmailView,
    ExportUserDataView,
)

urlpatterns = [
    path('register', RegisterView.as_view(), name='auth_register'),
    path('register/', RegisterView.as_view(), name='auth_register_slash'),
    path('login', LoginView.as_view(), name='auth_login'),
    path('login/', LoginView.as_view(), name='auth_login_slash'),
    path('logout', LogoutView.as_view(), name='auth_logout'),
    path('logout/', LogoutView.as_view(), name='auth_logout_slash'),
    path('me', ProfileView.as_view(), name='auth_me'),
    path('me/', ProfileView.as_view(), name='auth_me_slash'),
    path('change-password', ChangePasswordView.as_view(), name='auth_change_password'),
    path('change-password/', ChangePasswordView.as_view(), name='auth_change_password_slash'),
    path('forgot-password', ForgotPasswordView.as_view(), name='auth_forgot_password'),
    path('forgot-password/', ForgotPasswordView.as_view(), name='auth_forgot_password_slash'),
    path('reset-password', ResetPasswordView.as_view(), name='auth_reset_password'),
    path('reset-password/', ResetPasswordView.as_view(), name='auth_reset_password_slash'),
    path('verify-email', VerifyEmailView.as_view(), name='auth_verify_email'),
    path('verify-email/', VerifyEmailView.as_view(), name='auth_verify_email_slash'),
    path('export-data', ExportUserDataView.as_view(), name='auth_export_data'),
    path('export-data/', ExportUserDataView.as_view(), name='auth_export_data_slash'),
    path('refresh', TokenRefreshView.as_view(), name='token_refresh'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh_slash'),
]
