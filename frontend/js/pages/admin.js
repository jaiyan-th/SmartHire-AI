/**
 * SmartHire AI — Admin Governance Terminal Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.guardAuth('admin')) return;
  window.renderAppNavbar('admin');

  const userTableBody = document.getElementById('admin-user-table-body');
  const tempSlider = document.getElementById('slider-temperature');
  const tempDisplay = document.getElementById('temp-val-display');
  const settingsForm = document.getElementById('ai-settings-form');
  const logConsole = document.getElementById('admin-log-console');
  const pauseLogsBtn = document.getElementById('pause-logs-btn');
  const levelFilter = document.getElementById('log-level-filter');

  let streamPaused = false;

  tempSlider.addEventListener('input', () => {
    tempDisplay.textContent = parseFloat(tempSlider.value).toFixed(2);
  });

  async function loadOverview() {
    try {
      const ov = await window.API.getAdminOverview();
      document.getElementById('adm-db-status').textContent = ov.db_status || 'Healthy';
      document.getElementById('adm-db-engine').textContent = `Engine: ${ov.db_engine} • Latency: ${ov.llm_latency_ms}ms`;
      document.getElementById('adm-tokens').textContent = `${ov.token_consumption_total || 0} Tokens`;
      document.getElementById('adm-cost').textContent = `Spend: ${ov.estimated_total_cost || '$0.0000'}`;
      document.getElementById('adm-users-count').textContent = `${ov.registered_users || 0} Accounts`;
      document.getElementById('adm-users-breakdown').textContent = `${ov.candidate_count || 0} Candidates • ${ov.recruiter_count || 0} Recruiters`;
      document.getElementById('adm-sessions-count').textContent = `${ov.total_sessions || 0} Sessions`;
      document.getElementById('adm-jobs-status').textContent = `Jobs: ${ov.background_jobs_completed || 0} OK / ${ov.background_jobs_failed || 0} Failed`;
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  async function loadUsers() {
    try {
      const users = await window.API.getAdminUsers();
      userTableBody.innerHTML = '';
      users.forEach(u => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>
            <strong>${window.escapeHtml(u.full_name || 'User')}</strong><br>
            <span style="font-size: 0.74rem; color: var(--text-muted);">${window.escapeHtml(u.email)}</span>
          </td>
          <td>
            <select class="form-select user-role-select" data-id="${u.id}" style="padding: 0.25rem 0.5rem; font-size: 0.78rem; width: auto;">
              <option value="candidate" ${u.role === 'candidate' ? 'selected' : ''}>Candidate</option>
              <option value="recruiter" ${u.role === 'recruiter' ? 'selected' : ''}>Recruiter</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option>
            </select>
          </td>
          <td>
            <button type="button" class="status-chip toggle-active-btn" data-id="${u.id}" data-active="${u.is_active}" style="cursor:pointer; ${u.is_active ? '' : 'background:#fee2e2; color:#991b1b;'}">
              ${u.is_active ? 'Active' : 'Suspended'}
            </button>
          </td>
          <td>
            <button type="button" class="btn btn-secondary reset-pwd-btn" data-id="${u.id}" data-email="${window.escapeHtml(u.email)}" style="padding: 0.25rem 0.6rem; font-size: 0.74rem;">
              Reset Key
            </button>
          </td>
        `;
        userTableBody.appendChild(row);
      });

      document.querySelectorAll('.user-role-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
          try {
            await window.API.updateAdminUser(e.target.getAttribute('data-id'), { role: e.target.value });
            window.showToast(`Updated role to ${e.target.value}`, 'success');
            loadOverview();
            loadLogs();
          } catch (err) {
            window.showToast(err.message, 'error');
            loadUsers();
          }
        });
      });

      document.querySelectorAll('.toggle-active-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const currentlyActive = btn.getAttribute('data-active') === 'true';
          try {
            await window.API.updateAdminUser(btn.getAttribute('data-id'), { is_active: !currentlyActive });
            window.showToast(`Account ${currentlyActive ? 'suspended' : 'reactivated'}.`, 'success');
            loadUsers();
            loadLogs();
          } catch (err) {
            window.showToast(err.message, 'error');
          }
        });
      });

      document.querySelectorAll('.reset-pwd-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const email = btn.getAttribute('data-email');
          if (!confirm(`Issue password reset token for ${email}?`)) return;
          try {
            await window.API.updateAdminUser(btn.getAttribute('data-id'), { issue_password_reset: true });
            window.showToast(`Password reset token issued for ${email}`, 'success');
            loadLogs();
          } catch (err) {
            window.showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      userTableBody.innerHTML = `<tr><td colspan="4" style="color:var(--danger-rose);">${window.escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function loadSettings() {
    try {
      const s = await window.API.getAdminSettings();
      document.getElementById('select-llm-backend').value = s.llm_backend;
      tempSlider.value = s.temperature;
      tempDisplay.textContent = parseFloat(s.temperature).toFixed(2);
      document.getElementById('input-max-tokens').value = s.max_tokens;
      document.getElementById('chk-maintenance-mode').checked = !!s.maintenance_mode;
    } catch (err) {}
  }

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await window.API.updateAdminSettings({
        llm_backend: document.getElementById('select-llm-backend').value,
        temperature: parseFloat(tempSlider.value),
        max_tokens: parseInt(document.getElementById('input-max-tokens').value, 10),
        maintenance_mode: document.getElementById('chk-maintenance-mode').checked,
      });
      window.showToast('Platform settings persisted to database!', 'success');
      loadOverview();
      loadLogs();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  async function loadLogs() {
    if (streamPaused) return;
    try {
      const logs = await window.API.getAdminLogs(levelFilter.value);
      logConsole.innerHTML = '';
      if (!logs || logs.length === 0) {
        logConsole.innerHTML = '<div class="console-line">No audit events recorded for current filter.</div>';
        return;
      }
      logs.forEach(l => {
        const div = document.createElement('div');
        div.className = 'console-line';
        div.innerHTML = `
          <span class="console-time">[${window.escapeHtml((l.timestamp || '').substring(0, 19))}]</span>
          <span class="console-level-${window.escapeHtml(l.level)}">[${window.escapeHtml(l.level)}]</span>
          <span style="color:#c4b5fd;">${window.escapeHtml(l.event_type)}:</span>
          <span>${window.escapeHtml(l.message)}</span>
        `;
        logConsole.appendChild(div);
      });
    } catch (e) {
      logConsole.innerHTML = `<div class="console-line" style="color:var(--danger-rose);">Failed to fetch logs.</div>`;
    }
  }

  pauseLogsBtn.addEventListener('click', () => {
    streamPaused = !streamPaused;
    pauseLogsBtn.textContent = streamPaused ? 'Resume Stream' : 'Pause Stream';
  });
  levelFilter.addEventListener('change', loadLogs);

  await Promise.all([loadOverview(), loadUsers(), loadSettings(), loadLogs()]);
  setInterval(loadLogs, 5000);
});
