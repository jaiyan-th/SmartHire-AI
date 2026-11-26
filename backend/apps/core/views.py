import os
import time
from django.db import connection
from rest_framework import views, status, response, permissions
from .models import PlatformConfig

APP_START_MONOTONIC = time.monotonic()


def _detect_ai_mode():
    if os.getenv('OPENAI_API_KEY', '').strip():
        return 'openai_configured'
    if os.getenv('GROQ_API_KEY', '').strip():
        return 'groq_configured'
    if os.getenv('OLLAMA_BASE_URL', '').strip():
        return 'ollama_configured'
    return 'deterministic_fallback'


class LiveHealthView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return response.Response({
            'status': 'live',
            'service': 'smarthire-ai-api',
            'version': '1.0.0',
            'uptime_seconds': int(time.monotonic() - APP_START_MONOTONIC),
        }, status=status.HTTP_200_OK)


class ReadyHealthView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        start = time.monotonic()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            db_latency_ms = round((time.monotonic() - start) * 1000, 2)
            db_status = "connected"
        except Exception as e:
            return response.Response({
                'status': 'degraded',
                'database': f'error: {str(e)}',
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        config = PlatformConfig.get_solo()
        return response.Response({
            'status': 'ready',
            'database': db_status,
            'db_latency_ms': db_latency_ms,
            'llm_engine': _detect_ai_mode(),
            'speech_engine': 'operational',
            'maintenance_mode': config.maintenance_mode,
        }, status=status.HTTP_200_OK)
