/**
 * SmartHire AI — Certified Printable Dossier Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  window.guardAuth();
  window.renderAppNavbar('report');

  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  const user = window.API.getUser();

  try {
    const ev = await window.API.getLatestEvaluation(sessionId);
    if (!ev || ev.has_data === false) {
      document.getElementById('dossier-empty-state').style.display = 'block';
      return;
    }

    document.getElementById('dossier-paper').style.display = 'block';
    const verId = `SH-${String(ev.session || sessionId || 'CERT').slice(0, 8).toUpperCase()}`;
    document.getElementById('dossier-verification-id').textContent = `VERIFIED ID: ${verId}`;
    document.getElementById('dossier-name').textContent = (user && user.full_name) ? user.full_name : 'Verified Candidate';
    document.getElementById('dossier-date').textContent = ev.session_date || new Date(ev.created_at).toLocaleDateString();
    document.getElementById('dossier-domain').textContent = `${ev.session_domain || 'Software Engineering'} (${ev.session_difficulty || 'Mid-Level'})`;
    document.getElementById('dossier-overall').textContent = `${ev.overall_score} / 100`;
    document.getElementById('dossier-band').textContent = `TIER: ${ev.rating_band}`;

    document.getElementById('dossier-tech').textContent = `${ev.technical_relevance_score} / 100`;
    document.getElementById('dossier-comm').textContent = `${ev.communication_score} / 100`;
    document.getElementById('dossier-conf').textContent = `${ev.confidence_score} / 100`;
    document.getElementById('dossier-prof').textContent = `${ev.professionalism_score} / 100`;

    const strengths = (ev.strengths || []).map(s => `<li>${window.escapeHtml(s)}</li>`).join('');
    const suggestions = (ev.weaknesses || []).concat(ev.improvement_suggestions || []).map(s => `<li>${window.escapeHtml(s)}</li>`).join('');
    document.getElementById('dossier-feedback-box').innerHTML = `
      <strong>Demonstrated Strengths:</strong><ul style="padding-left:1.2rem; margin:0.35rem 0 0.75rem 0;">${strengths}</ul>
      <strong>Actionable Recommendations:</strong><ul style="padding-left:1.2rem; margin:0.35rem 0 0 0;">${suggestions}</ul>
    `;

    const qaEl = document.getElementById('dossier-qa-log');
    const qList = ev.question_evaluations || [];
    qaEl.innerHTML = qList.length
      ? qList.map(q => `
          <div style="border:1px solid var(--lavender-200); border-radius:10px; padding:0.75rem 1rem; margin-bottom:0.65rem;">
            <strong>Q${q.order}: ${window.escapeHtml(q.prompt)}</strong> (Score: ${q.score})<br>
            <div style="margin-top:0.25rem; color:var(--text-body);"><strong>Answer:</strong> ${window.escapeHtml(q.candidate_response)}</div>
            <div style="margin-top:0.25rem; color:var(--lavender-700);"><strong>Critique:</strong> ${window.escapeHtml(q.critique)}</div>
          </div>
        `).join('')
      : '<p style="color:var(--text-muted);">No question logs stored.</p>';
  } catch (err) {
    document.getElementById('dossier-empty-state').style.display = 'block';
    window.showToast(err.message, 'error');
  }

  document.getElementById('print-dossier-btn').addEventListener('click', () => window.print());

  document.getElementById('download-backend-pdf-btn').addEventListener('click', async () => {
    window.showToast('Generating official ReportLab PDF...', 'info');
    try {
      const blob = await window.API.downloadPdfReport(sessionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SmartHire_Assessment_Dossier.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      window.showToast('Official PDF downloaded!', 'success');
    } catch (err) {
      window.showToast(err.message || 'Could not generate PDF.', 'error');
    }
  });
});
