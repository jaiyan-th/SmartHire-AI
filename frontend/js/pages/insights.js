/**
 * SmartHire AI — Performance Analytics Page Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  window.guardAuth();
  window.renderAppNavbar('insights');

  const urlParams = new URLSearchParams(window.location.search);
  let activeSessionId = urlParams.get('session_id');
  const sessionSelector = document.getElementById('session-selector');
  const shareBtn = document.getElementById('toggle-share-btn');
  let currentSharedState = false;

  async function loadInsights(sessionId = null) {
    try {
      const data = await window.API.getInsights(sessionId);

      if (!data.has_data) {
        document.getElementById('insights-empty-state').style.display = 'block';
        document.getElementById('insights-content').style.display = 'none';
        return;
      }

      document.getElementById('insights-empty-state').style.display = 'none';
      document.getElementById('insights-content').style.display = 'block';

      activeSessionId = data.session_id;
      currentSharedState = !!data.shared_with_recruiters;
      updateShareButton();

      document.getElementById('insights-domain-badge').textContent = `${data.domain} • ${data.difficulty}`;
      document.getElementById('overall-score-display').textContent = data.overall_score;
      document.getElementById('overall-band-text').textContent = data.rating_band;
      document.getElementById('download-dossier-link').href = `report-download.html?session_id=${encodeURIComponent(data.session_id)}`;
      document.getElementById('progression-count-badge').textContent = `${data.total_sessions} SESSIONS`;

      // Populate session switcher
      if (sessionSelector.options.length === 0 && Array.isArray(data.history)) {
        data.history.forEach(h => {
          const opt = document.createElement('option');
          opt.value = h.session_id;
          opt.textContent = `${h.date} — ${h.domain} (${h.overall_score})`;
          if (h.session_id === data.session_id) opt.selected = true;
          sessionSelector.appendChild(opt);
        });
      }

      const p = data.pillars || {};
      if (p.technical) {
        document.getElementById('score-tech').textContent = p.technical.score;
        document.getElementById('metric-tech').textContent = `✓ ${p.technical.metric}`;
      }
      if (p.communication) {
        document.getElementById('score-comm').textContent = p.communication.score;
        document.getElementById('metric-comm').textContent = `✓ ${p.communication.metric}`;
      }
      if (p.confidence) {
        document.getElementById('score-conf').textContent = p.confidence.score;
        document.getElementById('metric-conf').textContent = `✓ ${p.confidence.metric}`;
      }
      if (p.professionalism) {
        document.getElementById('score-prof').textContent = p.professionalism.score;
        document.getElementById('metric-prof').textContent = `✓ ${p.professionalism.metric}`;
      }

      // Feedback Lists
      const fb = data.feedback || {};
      document.getElementById('feedback-strengths-list').innerHTML = (fb.strengths || []).map(s => `<li>${window.escapeHtml(s)}</li>`).join('');
      document.getElementById('feedback-weaknesses-list').innerHTML = (fb.weaknesses || []).map(w => `<li>${window.escapeHtml(w)}</li>`).join('');
      const resHtml = [
        ...(fb.suggestions || []).map(s => `<li>${window.escapeHtml(s)}</li>`),
        ...(fb.resources || []).map(r => `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer" style="color:var(--lavender-700); text-decoration:underline;">${window.escapeHtml(r.title)} ↗</a></li>`),
      ].join('');
      document.getElementById('feedback-resources-list').innerHTML = resHtml;

      // Dynamic Question Evaluations Accordion
      const accContainer = document.getElementById('questions-accordion');
      const qEvals = data.question_evaluations || [];
      if (qEvals.length === 0) {
        accContainer.innerHTML = '<p style="color:var(--text-muted);">No per-question evaluations recorded for this session.</p>';
      } else {
        accContainer.innerHTML = qEvals.map((qe, idx) => `
          <div class="accordion-item">
            <div class="accordion-header" role="button" tabindex="0">
              <span>Q${qe.order}: ${window.escapeHtml(qe.prompt)}</span>
              <span class="sticker-badge" style="flex-shrink:0;">Score: ${qe.score}</span>
            </div>
            <div class="accordion-body ${idx === 0 ? 'open' : ''}">
              <p><strong>Your Response:</strong> ${window.escapeHtml(qe.candidate_response)}</p>
              <p><strong>Reference Model Answer:</strong> ${window.escapeHtml(qe.model_answer)}</p>
              <p><strong>Critique:</strong> ${window.escapeHtml(qe.critique)}</p>
              <p style="color:var(--lavender-700); margin:0;"><strong>Improvement Tip:</strong> ${window.escapeHtml(qe.improvements)}</p>
            </div>
          </div>
        `).join('');

        accContainer.querySelectorAll('.accordion-header').forEach(hdr => {
          hdr.addEventListener('click', () => hdr.nextElementSibling.classList.toggle('open'));
        });
      }

      renderProgressionChart(data.progression || []);
      renderRadarChart(data.radar || []);
    } catch (err) {
      window.showToast(err.message || 'Could not load insights.', 'error');
    }
  }

  function updateShareButton() {
    if (currentSharedState) {
      shareBtn.textContent = '🌐 Shared with Recruiters';
      shareBtn.style.borderColor = 'var(--success-mint)';
    } else {
      shareBtn.textContent = '🔒 Private Practice Only';
      shareBtn.style.borderColor = 'var(--lavender-200)';
    }
  }

  shareBtn.addEventListener('click', async () => {
    if (!activeSessionId) return;
    try {
      const res = await window.API.shareSession(activeSessionId, !currentSharedState);
      currentSharedState = !!res.shared_with_recruiters;
      updateShareButton();
      window.showToast(
        currentSharedState ? 'Report shared with authorized recruiters.' : 'Report set back to Private Practice.',
        'success'
      );
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  sessionSelector.addEventListener('change', () => {
    loadInsights(sessionSelector.value);
  });

  function renderProgressionChart(progression) {
    const canvas = document.getElementById('progression-chart');
    if (!canvas || progression.length === 0) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#ede9fe';
    ctx.lineWidth = 1;
    for (let y = 35; y < height - 30; y += 45) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }

    const points = progression.map((d, i) => {
      const x = progression.length === 1
        ? width / 2
        : 55 + (i * ((width - 110) / (progression.length - 1)));
      const clamped = Math.max(20, Math.min(100, d.overall));
      const y = height - 40 - ((clamped - 20) / 80) * (height - 80);
      return { x, y, score: d.overall, label: d.date || d.session };
    });

    if (points.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#8b7cf6';
      ctx.lineWidth = 3;
      points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    }

    points.forEach(pt => {
      ctx.beginPath();
      ctx.fillStyle = '#ec6bb0';
      ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1f1a3d';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.fillText(String(pt.score), pt.x - 14, pt.y - 10);
      ctx.fillStyle = '#6f6b8e';
      ctx.font = '11px Plus Jakarta Sans, sans-serif';
      ctx.fillText(pt.label, pt.x - 16, height - 12);
    });
  }

  function renderRadarChart(radarData) {
    const canvas = document.getElementById('radar-chart');
    if (!canvas || radarData.length === 0) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 82;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const numAxes = radarData.length;
    const angleStep = (Math.PI * 2) / numAxes;

    ctx.strokeStyle = '#ede9fe';
    for (let r = 20; r <= radius; r += 20) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    radarData.forEach((d, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const lx = cx + (radius + 22) * Math.cos(angle);
      const ly = cy + (radius + 14) * Math.sin(angle);
      ctx.fillStyle = '#4b4670';
      ctx.font = '10px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.subject, lx, ly);
    });

    ctx.beginPath();
    ctx.strokeStyle = '#8b7cf6';
    ctx.fillStyle = 'rgba(139, 124, 246, 0.25)';
    ctx.lineWidth = 2;
    radarData.forEach((d, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const dist = (d.candidate / 100) * radius;
      const x = cx + dist * Math.cos(angle);
      const y = cy + dist * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#ec6bb0';
    ctx.setLineDash([4, 4]);
    radarData.forEach((d, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const dist = (d.benchmark / 100) * radius;
      const x = cx + dist * Math.cos(angle);
      const y = cy + dist * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  loadInsights(activeSessionId);
});
