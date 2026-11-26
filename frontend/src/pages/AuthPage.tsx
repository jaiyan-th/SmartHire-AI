import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Moon, ShieldCheck, Sun } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { Button, Modal } from '@/components/ui/Primitives';
import StudioAIOrb from '@/components/visuals/StudioAIOrb';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import { MOTION_EASE, SPRING_SNAPPY } from '@/motion/system';

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register' | 'setup'>(initialMode);

  const { login, register, bootstrapAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean; github: boolean }>({
    google: false,
    github: false,
  });

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPw, setResetNewPw] = useState('');
  const [resetStep, setResetStep] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  useEffect(() => {
    api
      .getAuthProviders()
      .then((res) => {
        setNeedsInitialSetup(Boolean(res.needs_initial_setup));
        setProviders({
          google: Boolean(res.google_oauth2?.enabled),
          github: Boolean(res.github_sso?.enabled),
        });
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError('');
    setSubmitting(true);
    try {
      const signedIn = await login(email.trim(), password);
      toast(`Welcome back, ${signedIn.full_name || signedIn.email}`, 'success');
      const next =
        signedIn.role === 'admin' ? '/admin' : signedIn.role === 'recruiter' ? '/recruiter' : '/dashboard';
      navigate(next, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setInlineError(msg);
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError('');
    setSubmitting(true);
    try {
      const created = await register({
        full_name: fullName.trim(),
        email: regEmail.trim(),
        target_role: targetRole.trim() || 'Software Engineer',
        password: regPassword,
      });
      toast(`Account created for ${created.full_name}`, 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setInlineError(msg);
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError('');
    setSubmitting(true);
    try {
      const admin = await bootstrapAdmin({
        full_name: adminName.trim(),
        email: adminEmail.trim(),
        password: adminPassword,
      });
      toast(`Administrator workspace initialized for ${admin.email}`, 'success');
      navigate('/admin', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Admin setup failed.';
      setInlineError(msg);
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.forgotPassword(forgotEmail.trim());
      setResetMsg(res.message);
      if (res.dev_reset_token) setResetToken(res.dev_reset_token);
      setResetStep(true);
      toast('Reset request processed.', 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to process reset.', 'error');
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.resetPassword(resetToken.trim(), resetNewPw);
      toast('Password updated. Sign in with your new credentials.', 'success');
      setForgotOpen(false);
      setResetStep(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Password reset failed.', 'error');
    }
  };

  const tabs: Array<{ id: 'login' | 'register' | 'setup'; label: string }> = [
    { id: 'login', label: 'Sign In' },
    { id: 'register', label: 'Create Account' },
    ...(needsInitialSetup ? [{ id: 'setup' as const, label: 'Admin Setup' }] : []),
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink grid grid-cols-1 lg:grid-cols-12">
      {/* Left Obsidian Architectural Panel */}
      <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 xl:p-16 bg-[#090909] text-[#F5F5F4] border-r border-[#242424] relative overflow-hidden studio-spotlight">
        <div className="flex items-center justify-between relative z-10">
          <Link to="/">
            <BrandMark size="md" className="text-[#F5F5F4] [&_span]:text-[#F5F5F4]" />
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-[#A3A3A0] hover:text-[#F5F5F4] transition-colors">
            <ArrowLeft className="h-4 w-4" /> Overview
          </Link>
        </div>

        <div className="space-y-8 max-w-md relative z-10">
          <div className="flex items-center gap-4">
            <StudioAIOrb state="idle" size={96} />
            <div>
              <span className="font-mono text-[11px] uppercase tracking-widest text-[#C9F45B]">
                INTELLIGENT STUDIO ACCESS
              </span>
              <p className="text-xs text-[#A3A3A0] mt-1">
                Private by default · Camera optional
              </p>
            </div>
          </div>

          <h1 className="font-display text-4xl xl:text-5xl font-medium leading-[1.08] tracking-tight">
            Focused preparation, backed by verifiable evidence.
          </h1>
          <p className="text-base text-[#A3A3A0] leading-relaxed">
            Your mock interviews and resume analyses stay strictly private unless you explicitly choose to share a report with recruiters.
          </p>
        </div>

        <div className="space-y-2.5 border-t border-[#242424] pt-6 text-sm text-[#A3A3A0] relative z-10">
          <div className="flex items-center gap-2.5 text-[#F5F5F4] font-medium">
            <ShieldCheck className="h-4 w-4 text-[#C9F45B]" />
            <span>JWT rotation with server-side token blacklisting</span>
          </div>
          <p className="text-xs leading-relaxed text-[#737370]">
            Self-registration provisions a Candidate workspace. Recruiter and Administrator roles are governed internally.
          </p>
        </div>
      </div>

      {/* Right Auth Form Workspace */}
      <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-12 lg:p-16 relative">
        <div className="flex items-center justify-between">
          <div className="lg:hidden flex items-center gap-3">
            <Link to="/">
              <BrandMark />
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/" className="lg:hidden text-sm text-ink-secondary hover:text-ink">
              Home
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink-secondary hover:text-ink transition-colors"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: MOTION_EASE }}
          className="w-full max-w-lg mx-auto my-auto py-8 space-y-7"
        >
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-tight">
              {mode === 'login'
                ? 'Welcome back'
                : mode === 'register'
                  ? 'Create your account'
                  : 'Initialize platform admin'}
            </h2>
            <p className="text-base text-ink-secondary mt-2">
              {mode === 'login'
                ? 'Sign in to continue your practice sessions and insights.'
                : mode === 'register'
                  ? 'Set up your personal workspace for resume diagnostics and mock interviews.'
                  : 'Create the first administrator account for this fresh SmartHire instance.'}
            </p>
          </div>

          {/* Segmented Tabs */}
          <div
            className={`grid p-1.5 rounded-xl bg-surface-2 border border-border ${
              tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
            }`}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMode(tab.id);
                  setInlineError('');
                }}
                className={`relative py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  mode === tab.id ? 'text-ink' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {mode === tab.id && (
                  <motion.span
                    layoutId="auth-tab-bg"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-lg bg-surface shadow-sm border border-border"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>

          {inlineError && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300"
            >
              {inlineError}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-ink-secondary mb-2">
                  Email address
                </label>
                <input
                  id="auth-email"
                  data-testid="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="auth-password" className="block text-sm font-medium text-ink-secondary">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-xs font-medium text-ink-secondary hover:text-ink underline underline-offset-2"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="auth-password"
                    data-testid="password"
                    type={showPw ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 rounded-xl border border-border bg-surface pl-4 pr-11 text-sm text-ink focus:border-ink focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" data-testid="login-btn" variant="accent" size="lg" loading={submitting} className="w-full">
                Sign in to workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label htmlFor="reg-name" className="block text-sm font-medium text-ink-secondary mb-1.5">
                  Full name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="reg-email" className="block text-sm font-medium text-ink-secondary mb-1.5">
                  Email address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="reg-role" className="block text-sm font-medium text-ink-secondary mb-1.5">
                  Target job role
                </label>
                <input
                  id="reg-role"
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Full Stack Software Engineer"
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="reg-password" className="block text-sm font-medium text-ink-secondary mb-1.5">
                  Password (min 8 chars, mixed characters)
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={8}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>
              <Button type="submit" data-testid="register-btn" variant="accent" size="lg" loading={submitting} className="w-full">
                Create candidate account <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}

          {mode === 'setup' && needsInitialSetup && (
            <form onSubmit={handleBootstrapAdmin} className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-4 text-xs text-ink-secondary leading-relaxed">
                This fresh database has no Administrator account yet. Creating the initial admin locks this setup endpoint permanently.
              </div>
              <div>
                <label htmlFor="adm-name" className="block text-sm font-medium text-ink-secondary mb-1.5">
                  Administrator full name
                </label>
                <input
                  id="adm-name"
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Platform Administrator"
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm"
                />
              </div>
              <div>
                <label htmlFor="adm-email" className="block text-sm font-medium text-ink-secondary mb-1.5">
                  Administrator email
                </label>
                <input
                  id="adm-email"
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm"
                />
              </div>
              <div>
                <label htmlFor="adm-pw" className="block text-sm font-medium text-ink-secondary mb-1.5">
                  Password (min 8 chars)
                </label>
                <input
                  id="adm-pw"
                  type="password"
                  required
                  minLength={8}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Strong administrator password"
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm"
                />
              </div>
              <Button type="submit" data-testid="bootstrap-admin-btn" variant="accent" size="lg" loading={submitting} className="w-full">
                Initialize Administrator Account <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}

          {(providers.google || providers.github) && (
            <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-ink-muted">
              <span>Enterprise SSO</span>
              <div className="flex gap-2">
                {providers.google && (
                  <span className="rounded-lg border border-border px-3 py-1.5 text-ink">Google OAuth2 Ready</span>
                )}
                {providers.github && (
                  <span className="rounded-lg border border-border px-3 py-1.5 text-ink">GitHub SSO Ready</span>
                )}
              </div>
            </div>
          )}
        </motion.div>

        <div className="text-xs font-mono text-ink-muted text-center lg:text-left">
          smarthire. · Deterministic Evaluation Architecture
        </div>
      </div>

      {/* Password Recovery Modal */}
      <Modal
        open={forgotOpen}
        onOpenChange={(v) => {
          setForgotOpen(v);
          if (!v) setResetStep(false);
        }}
        title="Reset Account Password"
        description="Enter your registered email to request a reset token."
      >
        {!resetStep ? (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">Account email</label>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
              />
            </div>
            <Button type="submit" variant="accent" className="w-full">
              Request Reset Token
            </Button>
          </form>
        ) : (
          <form onSubmit={handleResetConfirm} className="space-y-4">
            {resetMsg && <p className="text-xs text-ink-secondary">{resetMsg}</p>}
            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">Reset token</label>
              <input
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-canvas px-4 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={resetNewPw}
                onChange={(e) => setResetNewPw(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
              />
            </div>
            <Button type="submit" variant="accent" className="w-full">
              Confirm New Password
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
