from django.urls import path
from .views import DownloadPdfReportView

urlpatterns = [
    path('download-pdf', DownloadPdfReportView.as_view(), name='reports_download_pdf'),
    path('download-pdf/', DownloadPdfReportView.as_view(), name='reports_download_pdf_slash'),
]
