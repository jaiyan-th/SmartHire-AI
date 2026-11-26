from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

FRONTEND_DIR = settings.BASE_DIR.parent / 'frontend'

urlpatterns = [
    path('', lambda request: serve(request, 'index.html', document_root=FRONTEND_DIR), name='frontend_root'),
    path('admin/', admin.site.urls),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/resume/', include('apps.resumes.urls')),
    path('api/interview/', include('apps.interviews.urls')),
    path('api/evaluations/', include('apps.evaluations.urls')),
    path('api/analytics/', include('apps.analytics.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/core/', include('apps.core.urls')),
    path('api/recruiter/', include('apps.interviews.recruiter_urls')),
    path('api/admin-terminal/', include('apps.core.admin_urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve frontend HTML, CSS, and JS files directly on port 8000 as well
urlpatterns += [
    re_path(r'^(?P<path>(?:[\w\-]+\.html|css/.*|js/.*))$', serve, {'document_root': FRONTEND_DIR}),
]
