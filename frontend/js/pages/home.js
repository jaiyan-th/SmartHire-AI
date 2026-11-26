/**
 * SmartHire AI — Candidate Dashboard / Project Hub Controller
 * Loads real per-user interview history, resume status, assigned assessments, and live system health.
 */

document.addEventListener('DOMContentLoaded', async () => {
  window.guardAuth();
  window.renderAppNavbar('home');

  const user = window.API.getUser();
  if (user) {
    const nameEl = document.getElementById('hub-welcome-name');
    if (nameEl) nameEl.textContent = user.full_name || user.email;

    const roleEl = document.getElementById('hub-target-role');
    if (roleEl) roleEl.textContent = user.target_role || 'Software Engineer';

    const recruiterBtn = document.getElementById('hero-recruiter-btn');
    if (recruiterBtn && (user.role === 'recruiter' || user.role === 'admin')) {
      recruiterBtn.style.display = 'inline-flex';
    }
  }

  // Load real Insights, Resume, History, and Health in parallel
  const [insightsRes, resumesRes, historyRes, healthRes] = await Promise.allSettled([
    window.API.getInsights(),
    window.API.getResumeHistory(),
    window.API.getInterviewHistory(),
    window.API.checkHealth(),
  ]);

  if (insightsRes.status === 'fulfilled') {
    const ins = insightsRes.value;
    document.getElementById('hub-total-sessions').textContent = `${ins.total_sessions || 0} Completed`;
    document.getElementById('hub-latest-score').textContent = ins.has_data
      ? `${ins.overall_score} / 100 (${ins.rating_band})`
      : 'No assessments yet';
  }

  if (resumesRes.status === 'fulfilled') {
    const resumes = resumesRes.value;
    if (Array.isArray(resumes) && resumes.length > 0) {
      document.getElementById('hub-resume-score').textContent = `${resumes[0].ats_score}% (${resumes[0].file_name})`;
    } else {
      document.getElementById('hub-resume-score').textContent = 'No resume uploaded';
    }
  }

  if (healthRes.status === 'fulfilled') {
    const h = healthRes.value;
    document.getElementById('hub-system-status').textContent = `Backend Ready • DB: ${h.database} • Speech & Evaluation Active`;
  } else {
    document.getElementById('hub-system-status').textContent = 'Backend unreachable on port 8000';
  }

  // Render Recent & Assigned Assessments
  const listEl = document.getElementById('hub-sessions-list');
  if (historyRes.status === 'fulfilled') {
    const sessions = historyRes.value;
    if (!sessions || sessions.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding: 1.75rem;">
          <p style="margin-bottom:0.75rem; font-weight:600;">You haven't taken any mock interviews yet.</p>
          <a href="interview.html" class="btn btn-primary" style="font-size:0.85rem;">Start Your First Mock Interview</a>
        </div>
      `;
    } else {
      listEl.innerHTML = `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Domain & Type</th>
                <th>Difficulty</th>
                <th>Status</th>
                <th>Score</th>
                <th>Visibility</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${sessions.slice(0, 6).map(s => {
                const isDone = s.status === 'completed';
                const actionLink = isDone
                  ? `<a href="insights.html?session_id=${s.id}" class="btn btn-secondary" style="padding:0.25rem 0.7rem; font-size:0.78rem;">View Results</a>`
                  : `<a href="interview.html?session_id=${s.id}" class="btn btn-primary" style="padding:0.25rem 0.7rem; font-size:0.78rem;">Resume Session</a>`;
                return `
                  <tr>
                    <td>
                      <strong>${window.escapeHtml(s.domain)}</strong> (${window.escapeHtml(s.category)})
                      ${s.is_recruiter_assigned ? '<span class="sticker-badge pink" style="font-size:0.62rem; margin-left:0.35rem;">ASSIGNED</span>' : ''}
                    </td>
                    <td>${window.escapeHtml(s.difficulty)}</td>
                    <td><span class="sticker-badge" style="font-size:0.68rem;">${window.escapeHtml(s.status)}</span></td>
                    <td class="mono">${s.overall_score !== null ? `${s.overall_score} (${s.rating_band})` : 'Pending'}</td>
                    <td style="font-size:0.8rem;">${s.shared_with_recruiters ? 'Shared with Recruiters' : 'Private'}</td>
                    <td>${actionLink}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } else {
    listEl.innerHTML = `<p style="color:var(--danger-rose); font-size:0.88rem;">Could not load interview history.</p>`;
  }
});
