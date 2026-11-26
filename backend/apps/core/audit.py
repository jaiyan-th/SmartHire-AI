from apps.core.models import AuditLog


def get_client_ip(request):
    if not request:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def log_audit_event(event_type, message, level='INFO', user_email='anonymous', request=None, metadata=None):
    try:
        AuditLog.objects.create(
            level=level,
            event_type=event_type,
            user_email=user_email or 'anonymous',
            ip_address=get_client_ip(request),
            message=message,
            metadata=metadata or {},
        )
    except Exception:
        pass
