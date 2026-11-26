import logging
import uuid
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger('smarthire.errors')


def custom_exception_handler(exc, context):
    """
    Production DRF exception handler:
    - Preserves DRF validation payloads while ensuring consistent error keys.
    - Attaches correlation request_id for log tracing.
    - Prevents raw 500 HTML/tracebacks from leaking on unhandled server errors.
    """
    request = context.get('request')
    request_id = getattr(request, 'correlation_id', None) or str(uuid.uuid4())

    response = exception_handler(exc, context)
    if response is not None:
        if isinstance(response.data, dict):
            if 'detail' in response.data and 'error' not in response.data:
                response.data['error'] = str(response.data['detail'])
            response.data.setdefault('request_id', request_id)
        return response

    view = context.get('view')
    view_name = view.__class__.__name__ if view else 'UnknownView'
    logger.exception(
        'Unhandled exception in %s (request_id=%s): %s',
        view_name,
        request_id,
        exc,
    )
    return Response(
        {
            'error': 'An unexpected internal error occurred. Please try again later.',
            'request_id': request_id,
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
