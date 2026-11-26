/**
 * SmartHire AI — Core Application UI Controller
 * Floating pill navbar, mobile drawer, 4-pillar scoring formula, XSS-safe helpers, toasts, profile modal, and RBAC guards.
 */

window.computeOverall = function(comm, conf, tech, prof) {
  const overall = (comm * 0.30) + (conf * 0.25) + (tech * 0.30) + (prof * 0.15);
  return Math.round(overall * 100) / 100;
};

window.getRatingBand = function(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Average';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor';
};

window.escapeHtml = function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.showToast = function(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 4200);
};

window.renderAppNavbar = function(activePage = '') {
  const navPlaceholder = document.getElementById('app-nav');
  if (!navPlaceholder) return;

  const user = window.API.getUser() || { full_name: 'Candidate', email: '', role: 'candidate' };
  const displayName = user.full_name || user.email || 'User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'SH';

  const isRecruiter = user.role === 'recruiter' || user.role === 'admin';
  const isAdmin = user.role === 'admin';

  const navItems = [
    { id: 'home', href: 'home.html', label: 'Project Hub' },
    { id: 'interview', href: 'interview.html', label: 'Mock Interview' },
    { id: 'resume', href: 'resume.html', label: 'Resume ATS' },
    { id: 'skill-gap', href: 'skill-gap.html', label: 'Skill Gap' },
    { id: 'insights', href: 'insights.html', label: 'Insights' },
  ];
  if (isRecruiter) navItems.push({ id: 'recruiter', href: 'recruiter.html', label: 'Recruiter Portal' });
  if (isAdmin) navItems.push({ id: 'admin', href: 'admin.html', label: 'Admin Terminal' });

  navPlaceholder.innerHTML = `
    <nav class="nav-pill-container" aria-label="Primary Navigation">
      <a href="home.html" class="nav-brand">
        <div class="nav-logo-icon">S</div>
        <span class="nav-brand-title">SmartHire AI</span>
        <span class="sticker-badge" style="font-size: 0.62rem;">INFOSYS SPRINGBOARD CAPSTONE</span>
      </a>

      <ul class="nav-links">
        ${navItems.map(item => `
          <li class="nav-link-item ${activePage === item.id ? 'active' : ''}">
            <a href="${item.href}">${item.label}</a>
          </li>
        `).join('')}
      </ul>

      <div class="nav-actions">
        <div id="nav-health-chip" class="status-chip" title="Backend & Database Connectivity">
          <div class="status-dot"></div>
          <span>API Connected</span>
        </div>
        <button type="button" id="profile-settings-trigger" class="user-profile-badge" title="Manage Profile, Privacy & Data Export">
          <div class="avatar-initials">${window.escapeHtml(initials)}</div>
          <span style="max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${window.escapeHtml(displayName)}</span>
        </button>
        <button id="logout-btn" data-testid="logout-btn" class="btn btn-ghost" style="padding: 0.4rem 0.75rem; font-size: 0.8rem;" title="Sign out">
          Logout
        </button>
        <button type="button" id="mobile-menu-toggle" class="mobile-menu-btn" aria-expanded="false" aria-label="Toggle Navigation Menu">
          ☰ Menu
        </button>
      </div>
    </nav>
    <div id="mobile-nav-drawer" class="mobile-nav-drawer">
      ${navItems.map(item => `
        <a href="${item.href}" class="${activePage === item.id ? 'active' : ''}">${item.label}</a>
      `).join('')}
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => window.API.logout());

  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const mobileDrawer = document.getElementById('mobile-nav-drawer');
  mobileToggle.addEventListener('click', () => {
    const isOpen = mobileDrawer.classList.toggle('open');
    mobileToggle.setAttribute('aria-expanded', String(isOpen));
  });

  document.getElementById('profile-settings-trigger').addEventListener('click', openProfileModal);

  // Live backend health check
  window.API.checkHealth().then(res => {
    const chip = document.getElementById('nav-health-chip');
    if (chip && res && res.status === 'ready') {
      chip.innerHTML = `<div class="status-dot"></div><span>DB Active</span>`;
    }
  }).catch(() => {
    const chip = document.getElementById('nav-health-chip');
    if (chip) {
      chip.classList.add('degraded');
      chip.innerHTML = `<span style="font-size:0.74rem;">API Offline</span>`;
    }
  });
};

function openProfileModal() {
  let modal = document.getElementById('global-profile-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'global-profile-modal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 560px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--lavender-100); padding-bottom:0.85rem; margin-bottom:1.25rem;">
          <div>
            <span class="sticker-badge">ACCOUNT & PRIVACY</span>
            <h3 style="margin-top:0.25rem;">Profile & Consent Settings</h3>
          </div>
          <button type="button" id="close-profile-modal" class="btn btn-ghost" aria-label="Close modal">✕</button>
        </div>
        <form id="global-profile-form">
          <div class="form-group">
            <label class="form-label" for="prof-full-name">Full Name</label>
            <input type="text" id="prof-full-name" class="form-input" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="prof-target-role">Target Job Role</label>
            <input type="text" id="prof-target-role" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label" for="prof-headline">Headline</label>
            <input type="text" id="prof-headline" class="form-input">
          </div>
          <div style="background: var(--lavender-50); padding: 0.9rem; border-radius: 12px; margin-bottom: 1rem;">
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; margin-bottom:0.45rem; cursor:pointer;">
              <input type="checkbox" id="prof-rec-consent"> Explicit audio recording & AI transcription consent
            </label>
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; cursor:pointer;">
              <input type="checkbox" id="prof-cam-consent"> Optional local webcam presentation coaching consent
            </label>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; margin-bottom:1rem;">Save Profile & Consent</button>
        </form>
        <div style="border-top:1px solid var(--lavender-100); padding-top:1rem; display:flex; gap:0.65rem; flex-wrap:wrap; justify-content:space-between;">
          <button type="button" id="export-my-data-btn" class="btn btn-secondary" style="font-size:0.82rem;">Export My Data (JSON)</button>
          <button type="button" id="deactivate-account-btn" class="btn btn-ghost" style="font-size:0.82rem; color:var(--danger-rose);">Deactivate Account</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-profile-modal').addEventListener('click', () => { modal.style.display = 'none'; });

    document.getElementById('global-profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const updated = await window.API.updateProfile({
          full_name: document.getElementById('prof-full-name').value.trim(),
          target_role: document.getElementById('prof-target-role').value.trim(),
          headline: document.getElementById('prof-headline').value.trim(),
          recording_consent: document.getElementById('prof-rec-consent').checked,
          webcam_consent: document.getElementById('prof-cam-consent').checked,
        });
        window.API.setSession(window.API.getToken(), updated);
        window.showToast('Profile and privacy settings saved!', 'success');
        modal.style.display = 'none';
        window.renderAppNavbar();
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    });

    document.getElementById('export-my-data-btn').addEventListener('click', async () => {
      try {
        const payload = await window.API.exportUserData();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'smarthire_personal_data_export.json';
        a.click();
        URL.revokeObjectURL(url);
        window.showToast('Personal data archive exported.', 'success');
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    });

    document.getElementById('deactivate-account-btn').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to deactivate your account? You will be signed out immediately.')) return;
      try {
        await window.API.deactivateAccount();
        window.API.clearSession();
        window.location.href = 'index.html';
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    });
  }

  modal.style.display = 'flex';
  window.API.getProfile().then(p => {
    document.getElementById('prof-full-name').value = p.full_name || '';
    document.getElementById('prof-target-role').value = p.target_role || '';
    document.getElementById('prof-headline').value = p.headline || '';
    document.getElementById('prof-rec-consent').checked = !!p.recording_consent;
    document.getElementById('prof-cam-consent').checked = !!p.webcam_consent;
  }).catch(() => {});
}

window.guardAuth = function(requiredRole = null) {
  const token = window.API.getToken();
  if (!token) {
    window.location.href = 'index.html';
    return false;
  }

  if (requiredRole) {
    const user = window.API.getUser();
    const allowed = user && (
      (requiredRole === 'admin' && user.role === 'admin') ||
      (requiredRole === 'recruiter' && (user.role === 'recruiter' || user.role === 'admin'))
    );
    if (!allowed) {
      const renderRestricted = () => {
        window.renderAppNavbar();
        const main = document.querySelector('main');
        if (main) {
          main.innerHTML = `
            <div class="card empty-state" style="max-width:560px; margin:3rem auto;">
              <span class="sticker-badge pink">403 ACCESS RESTRICTED</span>
              <h2 style="margin-top:0.75rem;">Insufficient Role Permissions</h2>
              <p style="color:var(--text-body); margin-top:0.5rem;">
                This area is restricted to authorized <strong>${window.escapeHtml(requiredRole)}</strong> accounts.
              </p>
              <a href="home.html" class="btn btn-primary" style="margin-top:1rem;">Return to Project Hub</a>
            </div>
          `;
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderRestricted);
      } else {
        renderRestricted();
      }
      return false;
    }
  }
  return true;
};
