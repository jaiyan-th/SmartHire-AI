from rest_framework import views, status, response, permissions
from .models import Evaluation
from .serializers import EvaluationSerializer


class LatestEvaluationView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        session_id = request.query_params.get('session_id')
        if session_id:
            evaluation = Evaluation.objects.select_related('session', 'session__candidate').filter(session_id=session_id).first()
            if not evaluation:
                return response.Response({'error': 'Evaluation not found.'}, status=status.HTTP_404_NOT_FOUND)
            is_owner = evaluation.session.candidate_id == request.user.id
            is_authorized_recruiter = (
                request.user.role in ('recruiter', 'admin')
                and (evaluation.session.is_recruiter_assigned or evaluation.session.shared_with_recruiters or request.user.role == 'admin')
            )
            if not (is_owner or is_authorized_recruiter):
                return response.Response({'error': 'Permission denied for this evaluation.'}, status=status.HTTP_403_FORBIDDEN)
        else:
            evaluation = Evaluation.objects.select_related('session').filter(
                session__candidate=request.user
            ).order_by('-created_at').first()

        if not evaluation:
            return response.Response({'has_data': False, 'message': 'No completed interview evaluations yet.'}, status=status.HTTP_200_OK)

        data = EvaluationSerializer(evaluation).data
        data['has_data'] = True
        data['session_domain'] = evaluation.session.domain
        data['session_difficulty'] = evaluation.session.difficulty
        data['session_date'] = evaluation.session.created_at.strftime('%Y-%m-%d %H:%M UTC')
        data['shared_with_recruiters'] = evaluation.session.shared_with_recruiters
        return response.Response(data)
