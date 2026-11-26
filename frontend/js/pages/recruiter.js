/**
 * SmartHire AI — Recruiter Portal Controller
 * Full DB-backed candidate roster, filters, side-by-side comparison, persistent human reviews,
 * assessment assignment, CSV export, and template builder.
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.guardAuth('recruiter')) return;
  window.renderAppNavbar('recruiter');

  const tabRoster = document.getElementById('tab-roster');
  const tabTemplates = document.getElementById('tab-templates');
  const rosterContainer = document.getElementById('roster-view-container');
  const templateContainer = document.getElementById('template-view-container');
  const tableBody = document.getElementById('candidate-table-body');
  const searchInput = document.getElementById('candidate-search-input');
  const domainFilter = document.getElementById('filter-domain');
  const tierFilter = document.getElementById('filter-tier');
  const filterFlagged = document.getElementById('filter-flagged-only');

  const modal = document.getElementById('candidate-modal');
  const assignModal = document.getElementById('assign-modal');
  const compareModal = document.getElementById('compare-modal');

  let allCandidates = [];
  let activeCandidate = null;
  let selectedForCompare = new Set();

  tabRoster.addEventListener('click', () => {
    tabRoster.classList.add('active');
    tabTemplates.classList.remove('active');
    rosterContainer.style.display = 'block';
    templateContainer.style.display = 'none';
  });

  tabTemplates.addEventListener('click', () => {
    tabTemplates.classList.add('active');
    tabRoster.classList.remove('active');
    templateContainer.style.display = 'block';
    rosterContainer.style.display = 'none';
  });

  async function loadCandidates() {
    try {
      const res = await window.API.getRecruiterCandidates();
      allCandidates = res.candidates || [];
      const stats = res.stats || {};
      document.getElementById('stat-evaluated').textContent = `${stats.evaluated_count ?? allCandidates.length} Evaluated`;
      document.getElementById('stat-average').textContent = stats.average_composite ? `${stats.average_composite} / 100` : '—';
      document.getElementById('stat-shortlisted').textContent = `${stats.shortlisted_count ?? 0} Shortlisted`;
      document.getElementById('stat-flagged').textContent = `${stats.flagged_count ?? 0} Flagged`;
      applyFilters();
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="10" style="color:var(--danger-rose); text-align:center;">${window.escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function loadTemplates() {
    const listEl = document.getElementById('saved-templates-list');
    const assignSelect = document.getElementById('assign-template');
    try {
      const templates = await window.API.getRecruiterTemplates();
      assignSelect.innerHTML = '<option value="">Default Software Engineering</option>';
      if (!templates || templates.length === 0) {
        listEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.86rem;">No saved templates yet.</p>';
        return;
      }
      listEl.innerHTML = templates.map(t => `
        <div style="border:1px solid var(--lavender-200); border-radius:14px; padding:0.9rem; margin-bottom:0.75rem; background:var(--lavender-50);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${window.escapeHtml(t.title)}</strong>
            <span class="sticker-badge" style="font-size:0.65rem;">${window.escapeHtml(t.level)}</span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
            ${window.escapeHtml(t.domain)} • ${t.duration_minutes}m • Skills: ${window.escapeHtml((t.target_skills || []).join(', '))}
          </div>
        </div>
      `).join('');

      templates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.title} (${t.domain})`;
        assignSelect.appendChild(opt);
      });
    } catch (err) {
      listEl.innerHTML = `<p style="color:var(--danger-rose);">${window.escapeHtml(err.message)}</p>`;
    }
  }

  function renderCandidateTable(candidates) {
    if (candidates.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--text-muted);">No matching authorized candidates found.</td></tr>';
      return;
    }
    tableBody.innerHTML = '';
    candidates.forEach(c => {
      const row = document.createElement('tr');
      row.className = 'candidate-row';
      const s = c.scores || {};
      const statusBadge = c.recruiter_status === 'shortlisted'
        ? '<span class="status-chip"><div class="status-dot"></div> Shortlisted</span>'
        : c.recruiter_status === 'flagged_for_review' || c.proctoring_flagged
          ? '<span class="sticker-badge pink">Flagged</span>'
          : c.recruiter_status === 'rejected'
            ? '<span class="sticker-badge" style="background:var(--danger-rose-bg); color:var(--danger-rose);">Rejected</span>'
            : '<span class="sticker-badge">Pending</span>';

      row.innerHTML = `
        <td class="compare-cell"><input type="checkbox" class="compare-checkbox" data-id="${c.session_id}" ${selectedForCompare.has(c.session_id) ? 'checked' : ''} aria-label="Select ${window.escapeHtml(c.candidate_name)}"></td>
        <td>
          <strong>${window.escapeHtml(c.candidate_name)}</strong><br>
          <span style="font-size: 0.74rem; color: var(--text-muted);">${window.escapeHtml(c.candidate_email)}</span>
        </td>
        <td>${window.escapeHtml(c.target_role)}</td>
        <td class="mono">${window.escapeHtml(c.date)}</td>
        <td class="mono">${s.technical ?? '—'}</td>
        <td class="mono">${s.communication ?? '—'}</td>
        <td class="mono">${s.confidence ?? '—'}</td>
        <td>
          <span class="mono" style="font-weight: 700; color: var(--lavender-700);">${s.overall ?? 'Pending'}</span>
          <span class="sticker-badge" style="font-size: 0.63rem; margin-left: 0.2rem;">${window.escapeHtml(s.rating_band)}</span>
        </td>
        <td>${statusBadge}</td>
        <td><button type="button" class="btn btn-secondary view-dossier-btn" style="padding: 0.25rem 0.65rem; font-size: 0.76rem;">Review</button></td>
      `;

      row.querySelector('.compare-checkbox').addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.checked) selectedForCompare.add(c.session_id);
        else selectedForCompare.delete(c.session_id);
      });

      row.addEventListener('click', () => openCandidateModal(c));
      tableBody.appendChild(row);
    });
  }

  function applyFilters() {
    const q = searchInput.value.toLowerCase();
    const dom = domainFilter.value;
    const tier = tierFilter.value;
    const flaggedOnly = filterFlagged.checked;

    const filtered = allCandidates.filter(c => {
      const matchName = (c.candidate_name || '').toLowerCase().includes(q) || (c.candidate_email || '').toLowerCase().includes(q);
      const matchDom = dom === 'all' || c.domain === dom;
      const matchTier = tier === 'all' || (c.scores && c.scores.rating_band === tier);
      const matchFlag = !flaggedOnly || c.proctoring_flagged || c.recruiter_status === 'flagged_for_review';
      return matchName && matchDom && matchTier && matchFlag;
    });
    renderCandidateTable(filtered);
  }

  searchInput.addEventListener('input', applyFilters);
  domainFilter.addEventListener('change', applyFilters);
  tierFilter.addEventListener('change', applyFilters);
  filterFlagged.addEventListener('change', applyFilters);

  function openCandidateModal(c) {
    activeCandidate = c;
    document.getElementById('modal-candidate-name').textContent = `${c.candidate_name} — ${c.target_role}`;
    document.getElementById('modal-tech').textContent = c.scores.technical ?? '—';
    document.getElementById('modal-comm').textContent = c.scores.communication ?? '—';
    document.getElementById('modal-conf').textContent = c.scores.confidence ?? '—';
    document.getElementById('modal-overall').textContent = c.scores.overall ?? 'Pending';
    document.getElementById('modal-reviewer-notes').value = c.recruiter_notes || '';
    document.getElementById('modal-pdf-link').href = `report-download.html?session_id=${encodeURIComponent(c.session_id)}`;

    const t = c.telemetry || {};
    document.getElementById('modal-telemetry-summary').textContent =
      `Answered ${t.answered_count ?? 0}/${t.total_questions ?? 0} questions • Speaking Cadence: ${t.avg_wpm || 0} WPM • ` +
      `Fillers Detected: ${t.total_fillers ?? 0} • Camera Gaze: ${t.avg_eye_contact !== null && t.avg_eye_contact !== undefined ? t.avg_eye_contact + '%' : 'Camera Off'}.`;

    const qaEl = document.getElementById('modal-qa-preview');
    const qEvals = c.question_evaluations || [];
    qaEl.innerHTML = qEvals.length
      ? qEvals.map(q => `
          <div style="margin-bottom:0.65rem; padding-bottom:0.55rem; border-bottom:1px solid var(--lavender-100);">
            <strong>Q${q.order}: ${window.escapeHtml(q.prompt)}</strong> (Score: ${q.score})<br>
            <span style="color:var(--text-body);">Response: ${window.escapeHtml(q.candidate_response)}</span>
          </div>
        `).join('')
      : '<span style="color:var(--text-muted);">No evaluated question breakdown available yet.</span>';

    modal.style.display = 'flex';
  }

  async function saveDecision(newStatus) {
    if (!activeCandidate) return;
    const notes = document.getElementById('modal-reviewer-notes').value;
    try {
      await window.API.reviewCandidateSession(activeCandidate.session_id, {
        recruiter_status: newStatus,
        recruiter_notes: notes,
      });
      window.showToast(`Decision saved: ${newStatus}`, 'success');
      modal.style.display = 'none';
      loadCandidates();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  document.getElementById('btn-shortlist').addEventListener('click', () => saveDecision('shortlisted'));
  document.getElementById('btn-flag-review').addEventListener('click', () => saveDecision('flagged_for_review'));
  document.getElementById('btn-reject').addEventListener('click', () => saveDecision('rejected'));

  document.getElementById('close-modal-btn').addEventListener('click', () => { modal.style.display = 'none'; });
  document.getElementById('close-assign-modal').addEventListener('click', () => { assignModal.style.display = 'none'; });
  document.getElementById('close-compare-modal').addEventListener('click', () => { compareModal.style.display = 'none'; });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modal.style.display = 'none';
      assignModal.style.display = 'none';
      compareModal.style.display = 'none';
    }
  });

  document.getElementById('open-assign-modal-btn').addEventListener('click', () => {
    assignModal.style.display = 'flex';
  });

  document.getElementById('assign-assessment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await window.API.assignAssessment({
        candidate_email: document.getElementById('assign-email').value.trim(),
        template_id: document.getElementById('assign-template').value || null,
        deadline: document.getElementById('assign-deadline').value || null,
      });
      window.showToast(res.message || 'Assessment assigned!', 'success');
      assignModal.style.display = 'none';
      loadCandidates();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  document.getElementById('compare-candidates-btn').addEventListener('click', async () => {
    const ids = Array.from(selectedForCompare);
    if (ids.length < 2) {
      window.showToast('Check at least 2 candidates in the Compare column first.', 'info');
      return;
    }
    try {
      const res = await window.API.compareCandidates(ids);
      const rows = res.comparisons || [];
      document.getElementById('compare-table-container').innerHTML = `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Domain</th>
                <th>Overall</th>
                <th>Technical</th>
                <th>Communication</th>
                <th>Confidence</th>
                <th>Professionalism</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td><strong>${window.escapeHtml(r.candidate_name)}</strong></td>
                  <td>${window.escapeHtml(r.domain)}</td>
                  <td class="mono" style="font-weight:800; color:var(--lavender-700);">${r.overall_score ?? '—'} (${window.escapeHtml(r.rating_band)})</td>
                  <td class="mono">${r.technical_relevance_score ?? '—'}</td>
                  <td class="mono">${r.communication_score ?? '—'}</td>
                  <td class="mono">${r.confidence_score ?? '—'}</td>
                  <td class="mono">${r.professionalism_score ?? '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      compareModal.style.display = 'flex';
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  document.getElementById('export-csv-btn').addEventListener('click', async () => {
    try {
      const blob = await window.API.exportRecruiterCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'smarthire_candidates_export.csv';
      a.click();
      URL.revokeObjectURL(url);
      window.showToast('CSV roster exported.', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  document.getElementById('create-template-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await window.API.saveRecruiterTemplate({
        title: document.getElementById('tpl-title').value.trim(),
        domain: document.getElementById('tpl-domain').value,
        level: document.getElementById('tpl-level').value,
        duration_minutes: parseInt(document.getElementById('tpl-duration').value, 10),
        question_count: parseInt(document.getElementById('tpl-qcount').value, 10),
        target_skills: document.getElementById('tpl-skills').value.split(',').map(s => s.trim()).filter(Boolean),
      });
      window.showToast('Interview template saved to database!', 'success');
      document.getElementById('create-template-form').reset();
      loadTemplates();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  await Promise.all([loadCandidates(), loadTemplates()]);
});
