from django.urls import path
from .views import DownloadPdfReportView, VerifyDossierView

urlpatterns = [
    path('download-pdf', DownloadPdfReportView.as_view(), name='reports_download_pdf'),
    path('download-pdf/', DownloadPdfReportView.as_view(), name='reports_download_pdf_slash'),
    path('verify/<uuid:pk>', VerifyDossierView.as_view(), name='reports_verify_dossier'),
    path('verify/<uuid:pk>/', VerifyDossierView.as_view(), name='reports_verify_dossier_slash'),
]
