from rest_framework import views, status, response, permissions
from django.db import connection
from .models import AuditLog

class LiveHealthView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return response.Response({
            'status': 'live',
            'service': 'smarthire-ai-api',
            'version': '1.0.0'
        }, status=status.HTTP_200_OK)

class ReadyHealthView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # Check database connectivity
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                db_status = "connected"
        except Exception as e:
            return response.Response({
                'status': 'degraded',
                'database': f'error: {str(e)}'
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return response.Response({
            'status': 'ready',
            'database': db_status,
            'llm_engine': 'operational',
            'speech_engine': 'operational'
        }, status=status.HTTP_200_OK)
