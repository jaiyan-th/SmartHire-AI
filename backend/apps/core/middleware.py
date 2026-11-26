import uuid
import time
import logging

logger = logging.getLogger('smarthire.http')


class RequestCorrelationAndSecurityMiddleware:
    """
    Assigns a unique X-Request-ID header to every request/response,
    logs structured latency without sensitive bodies, and enforces
    hardened HTTP security headers.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        request.correlation_id = request_id
        start_time = time.monotonic()

        response = self.get_response(request)

        duration_ms = round((time.monotonic() - start_time) * 1000, 2)
        response['X-Request-ID'] = request_id
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = 'SAMEORIGIN'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response['Permissions-Policy'] = 'camera=(self), microphone=(self), geolocation=()'

        if not request.path.startswith('/static/'):
            logger.info(
                'request_id=%s method=%s path=%s status=%s duration_ms=%s',
                request_id,
                request.method,
                request.path,
                response.status_code,
                duration_ms,
            )

        return response
