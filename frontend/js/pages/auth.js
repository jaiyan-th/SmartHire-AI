/**
 * SmartHire AI — Authentication Page Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const inlineError = document.getElementById('auth-inline-error');

  function showError(msg) {
    inlineError.textContent = msg;
    inlineError.style.display = 'block';
  }

  function clearError() {
    inlineError.style.display = 'none';
    inlineError.textContent = '';
  }

  tabLogin.addEventListener('click', () => {
    clearError();
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  });

  tabRegister.addEventListener('click', () => {
    clearError();
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
  });

  const togglePwBtn = document.getElementById('toggle-pw-btn');
  togglePwBtn.addEventListener('click', () => {
    const isPw = passwordInput.type === 'password';
    passwordInput.type = isPw ? 'text' : 'password';
    togglePwBtn.textContent = isPw ? 'Hide' : 'Show';
  });

  document.querySelectorAll('.demo-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      clearError();
      emailInput.value = chip.getAttribute('data-email');
      passwordInput.value = 'Demo@1234';
      window.showToast(`Loaded ${chip.textContent} credentials`, 'info');
    });
  });

  document.getElementById('oauth-google').addEventListener('click', () => {
    window.showToast('Google OAuth2 requires client credentials configured in production .env.', 'info');
  });
  document.getElementById('oauth-github').addEventListener('click', () => {
    window.showToast('GitHub OAuth2 requires OIDC client credentials configured in production .env.', 'info');
  });

  // Forgot / Reset Password Modal
  const forgotModal = document.getElementById('forgot-modal');
  document.getElementById('forgot-password-link').addEventListener('click', () => {
    forgotModal.style.display = 'flex';
  });
  document.getElementById('close-forgot-modal').addEventListener('click', () => {
    forgotModal.style.display = 'none';
  });

  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    try {
      const res = await window.API.forgotPassword(email);
      document.getElementById('reset-step').style.display = 'block';
      document.getElementById('reset-info-msg').textContent = res.message;
      if (res.dev_reset_token) {
        document.getElementById('reset-token-input').value = res.dev_reset_token;
      }
      window.showToast('Reset request processed.', 'info');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  document.getElementById('reset-confirm-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await window.API.resetPassword(
        document.getElementById('reset-token-input').value.trim(),
        document.getElementById('reset-new-pw').value
      );
      window.showToast('Password reset successfully! Please sign in.', 'success');
      forgotModal.style.display = 'none';
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Verifying Credentials...';

    try {
      const res = await window.API.login(emailInput.value.trim(), passwordInput.value);
      const accessToken = res.tokens?.access || res.token;
      const refreshToken = res.tokens?.refresh || null;
      if (accessToken && res.user) {
        window.API.setSession(accessToken, res.user, refreshToken);
        window.showToast(`Welcome back, ${res.user.full_name || res.user.email}!`, 'success');
        const nextUrl = res.user.role === 'admin' ? 'admin.html' : (res.user.role === 'recruiter' ? 'recruiter.html' : 'home.html');
        setTimeout(() => { window.location.href = nextUrl; }, 350);
      } else {
        throw new Error('Unexpected login response.');
      }
    } catch (err) {
      showError(err.message || 'Invalid email or password.');
      window.showToast(err.message || 'Authentication failed.', 'error');
      btn.disabled = false;
      btn.textContent = 'Sign In to Portal';
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = 'Creating Account...';

    const payload = {
      full_name: document.getElementById('reg-name').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      target_role: document.getElementById('reg-target-role').value.trim(),
      password: document.getElementById('reg-password').value,
    };

    try {
      const res = await window.API.register(payload);
      const accessToken = res.tokens?.access || res.token;
      const refreshToken = res.tokens?.refresh || null;
      if (accessToken && res.user) {
        window.API.setSession(accessToken, res.user, refreshToken);
        window.showToast('Candidate account created!', 'success');
        setTimeout(() => { window.location.href = 'home.html'; }, 400);
      } else {
        throw new Error('Registration failed.');
      }
    } catch (err) {
      showError(err.message || 'Registration failed.');
      window.showToast(err.message || 'Registration failed.', 'error');
      btn.disabled = false;
      btn.textContent = 'Create Candidate Account';
    }
  });
});
