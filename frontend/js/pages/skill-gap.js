/**
 * SmartHire AI — Skill Gap & Persistent Roadmap Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  window.guardAuth();
  window.renderAppNavbar('skill-gap');

  const barsContainer = document.getElementById('skill-bars-container');
  const weakAreasContainer = document.getElementById('weak-areas-container');
  const roadmapContainer = document.getElementById('roadmap-weeks-container');
  const progressDisplay = document.getElementById('overall-roadmap-progress');

  try {
    const data = await window.API.getSkillGap();
    document.getElementById('gap-target-role').textContent = data.target_role || 'Full Stack Software Engineer';
    document.getElementById('gap-match-pct').textContent = `${data.overall_match_percentage || 0}%`;

    barsContainer.innerHTML = '';
    (data.role_comparison || []).forEach(item => {
      const row = document.createElement('div');
      row.className = 'skill-bar-row';
      row.innerHTML = `
        <div class="skill-bar-label">
          <span>${window.escapeHtml(item.skill)}</span>
          <span class="mono" style="font-size: 0.78rem; color: var(--text-muted);">
            <strong>${item.candidate}%</strong> / Req: ${item.required}% (${window.escapeHtml(item.status)})
          </span>
        </div>
        <div class="skill-track">
          <div class="skill-fill" style="width: ${item.candidate}%;"></div>
        </div>
      `;
      barsContainer.appendChild(row);
    });

    weakAreasContainer.innerHTML = '';
    const weakAreas = data.weak_areas || [];
    if (weakAreas.length === 0) {
      weakAreasContainer.innerHTML = '<p style="color:var(--success-mint); font-weight:600;">No critical weak areas detected! Keep practicing advanced scenarios.</p>';
    } else {
      weakAreas.forEach(w => {
        const isHigh = w.impact === 'High';
        const box = document.createElement('div');
        box.style.cssText = isHigh
          ? 'background: var(--pink-50); border: 1px solid var(--pink-200); border-radius: 14px; padding: 1rem;'
          : 'background: var(--lavender-50); border: 1px solid var(--lavender-200); border-radius: 14px; padding: 1rem;';
        box.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:${isHigh ? 'var(--pink-600)' : 'var(--lavender-700)'}; font-size:0.92rem;">${window.escapeHtml(w.topic)}</strong>
            <span class="sticker-badge ${isHigh ? 'pink' : ''}" style="font-size:0.65rem;">${window.escapeHtml(w.impact)} IMPACT</span>
          </div>
          <p style="font-size:0.82rem; color:var(--text-body); margin:0.4rem 0;">${window.escapeHtml(w.detail)}</p>
          <span style="font-size:0.78rem; font-weight:600; color:var(--lavender-700);">Action: ${window.escapeHtml(w.recommendation)}</span>
        `;
        weakAreasContainer.appendChild(box);
      });
    }

    roadmapContainer.innerHTML = '';
    (data.roadmap || []).forEach(weekData => {
      const card = document.createElement('div');
      card.className = 'roadmap-week-card';
      const milestonesHtml = (weekData.milestones || []).map(m => `
        <label class="milestone-item">
          <input type="checkbox" class="milestone-checkbox" data-key="${window.escapeHtml(m.key)}" ${m.done ? 'checked' : ''}>
          <span style="${m.done ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${window.escapeHtml(m.task)}</span>
        </label>
      `).join('');

      const resourcesHtml = (weekData.resources || []).length
        ? `<div style="margin-top:0.9rem; padding-top:0.7rem; border-top:1px dashed var(--lavender-200); font-size:0.82rem;">
             <strong style="color:var(--lavender-700);">Verified References: </strong>
             ${weekData.resources.map(r => `<a href="${r.url}" target="_blank" rel="noopener noreferrer" style="color:var(--lavender-600); margin-right:0.75rem; text-decoration:underline;">${window.escapeHtml(r.name)} ↗</a>`).join('')}
           </div>`
        : '';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.7rem; flex-wrap:wrap; gap:0.5rem;">
          <h3 style="font-size:1.1rem; color:var(--text-heading);">${window.escapeHtml(weekData.week)}</h3>
          <span class="sticker-badge" style="font-size:0.7rem;">${window.escapeHtml(weekData.focus)}</span>
        </div>
        <div>${milestonesHtml}</div>
        ${resourcesHtml}
      `;
      roadmapContainer.appendChild(card);
    });

    function recalculateProgress() {
      const all = document.querySelectorAll('.milestone-checkbox');
      const checked = document.querySelectorAll('.milestone-checkbox:checked');
      progressDisplay.textContent = all.length ? `${Math.round((checked.length / all.length) * 100)}%` : '0%';
    }

    document.querySelectorAll('.milestone-checkbox').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const key = e.target.getAttribute('data-key');
        const completed = e.target.checked;
        const labelSpan = e.target.nextElementSibling;
        labelSpan.style.textDecoration = completed ? 'line-through' : 'none';
        labelSpan.style.opacity = completed ? '0.7' : '1';
        recalculateProgress();

        try {
          await window.API.toggleMilestone(key, completed);
          window.showToast(completed ? 'Milestone saved as completed!' : 'Milestone unchecked.', 'success');
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });
    });

    recalculateProgress();
  } catch (err) {
    barsContainer.innerHTML = `<p style="color:var(--danger-rose);">${window.escapeHtml(err.message)}</p>`;
  }
});
