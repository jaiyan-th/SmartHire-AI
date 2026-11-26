from rest_framework import permissions

class IsCandidate(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'candidate')

class IsRecruiter(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role in ['recruiter', 'admin'])

class IsAdminUserRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role == 'admin' or request.user.is_staff))
