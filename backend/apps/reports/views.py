import io
from xml.sax.saxutils import escape
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import views, status, response, permissions
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from apps.evaluations.models import Evaluation


class DownloadPdfReportView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        session_id = request.query_params.get('session_id')
        if session_id:
            eval_record = Evaluation.objects.select_related('session', 'session__candidate').filter(session_id=session_id).first()
            if not eval_record:
                return response.Response({'error': 'Evaluation report not found.'}, status=status.HTTP_404_NOT_FOUND)
            is_owner = eval_record.session.candidate_id == request.user.id
            is_authorized_recruiter = (
                request.user.role in ('recruiter', 'admin')
                and (eval_record.session.is_recruiter_assigned or eval_record.session.shared_with_recruiters or request.user.role == 'admin')
            )
            if not (is_owner or is_authorized_recruiter):
                return response.Response({'error': 'Permission denied for this report.'}, status=status.HTTP_403_FORBIDDEN)
        else:
            eval_record = Evaluation.objects.select_related('session', 'session__candidate').filter(
                session__candidate=request.user
            ).order_by('-created_at').first()
            if not eval_record:
                return response.Response({'error': 'No completed evaluation found to generate PDF.'}, status=status.HTTP_404_NOT_FOUND)

        session = eval_record.session
        candidate = session.candidate
        candidate_name = candidate.full_name or candidate.email if candidate else 'Candidate'
        candidate_email = candidate.email if candidate else ''
        verification_id = f"SH-{str(session.id)[:8].upper()}"
        eval_date = eval_record.created_at.strftime('%B %d, %Y (%H:%M UTC)')
        proctor_status = 'FLAGGED FOR REVIEW' if session.proctoring_flagged else 'CLEARED'

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
        story = []
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle('DocTitle', parent=styles['Heading1'], fontSize=20, leading=24, textColor=colors.HexColor('#1f1a3d'))
        subtitle_style = ParagraphStyle('DocSubtitle', parent=styles['Normal'], fontSize=10, leading=14, textColor=colors.HexColor('#5f4bd1'))
        body_style = ParagraphStyle('DocBody', parent=styles['Normal'], fontSize=9.5, leading=13.5, textColor=colors.HexColor('#2d2b38'))

        story.append(Paragraph("SMARTHIRE AI — CANDIDATE ASSESSMENT DOSSIER", title_style))
        story.append(Paragraph(f"Verification ID: {escape(verification_id)} | Generated: {timezone.now().strftime('%Y-%m-%d %H:%M UTC')}", subtitle_style))
        story.append(Spacer(1, 14))

        meta_data = [
            ["Candidate:", escape(f"{candidate_name} ({candidate_email})"), "Discipline:", escape(f"{session.domain} ({session.difficulty})")],
            ["Evaluation Date:", escape(eval_date), "Composite Score:", f"{eval_record.overall_score} / 100 ({eval_record.rating_band})"],
            ["Category:", escape(session.category), "Proctoring Status:", proctor_status],
        ]
        meta_table = Table(meta_data, colWidths=[95, 185, 100, 150])
        meta_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f5f3ff')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1f1a3d')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e0e7ff')),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#c4b5fd')),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 14))

        story.append(Paragraph("<b>4-Pillar Deterministic Assessment Breakdown</b>", styles['Heading2']))
        score_data = [
            ["Evaluation Pillar", "Weight", "Score", "Rating"],
            ["Technical Relevance", "30%", f"{eval_record.technical_relevance_score}/100", "Evaluated"],
            ["Verbal Communication", "30%", f"{eval_record.communication_score}/100", "Evaluated"],
            ["Confidence & Engagement", "25%", f"{eval_record.confidence_score}/100", "Evaluated"],
            ["Professionalism & Structure", "15%", f"{eval_record.professionalism_score}/100", "Evaluated"],
            ["Overall Composite Score", "100%", f"{eval_record.overall_score}/100", eval_record.rating_band],
        ]
        score_table = Table(score_data, colWidths=[210, 80, 110, 130])
        score_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7561ec')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#c4b5fd')),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#ede9fe')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]))
        story.append(score_table)
        story.append(Spacer(1, 12))

        story.append(Paragraph("<b>Demonstrated Strengths</b>", styles['Heading3']))
        for item in (eval_record.strengths or []):
            story.append(Paragraph(f"• {escape(str(item))}", body_style))
        story.append(Spacer(1, 8))

        story.append(Paragraph("<b>Areas for Improvement & Recommendations</b>", styles['Heading3']))
        for item in (eval_record.weaknesses or []) + (eval_record.improvement_suggestions or []):
            story.append(Paragraph(f"• {escape(str(item))}", body_style))
        story.append(Spacer(1, 12))

        if eval_record.question_evaluations:
            story.append(Paragraph("<b>Question-by-Question Evaluation Log</b>", styles['Heading3']))
            for qe in eval_record.question_evaluations:
                q_title = f"Q{qe.get('order', '')}: {qe.get('prompt', '')} (Score: {qe.get('score', '')})"
                story.append(Paragraph(f"<b>{escape(q_title)}</b>", body_style))
                story.append(Paragraph(f"Response: {escape(str(qe.get('candidate_response', ''))[:500])}", body_style))
                story.append(Paragraph(f"Critique: {escape(str(qe.get('critique', '')))}", body_style))
                story.append(Spacer(1, 6))

        story.append(Spacer(1, 12))
        story.append(Paragraph(
            "<i>Disclaimer: AI-assisted assessment results support preparation and structured review and are not standalone guarantees of employment suitability.</i>",
            subtitle_style,
        ))

        doc.build(story)
        buffer.seek(0)
        response_pdf = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response_pdf['Content-Disposition'] = f'attachment; filename="SmartHire_Dossier_{verification_id}.pdf"'
        return response_pdf
