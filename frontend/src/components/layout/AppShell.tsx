import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Bell,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Command,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Moon,
  Plus,
  Search,
  Settings,
  Shield,
  Sun,
  Target,
  X,
} from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { Button, Modal } from '@/components/ui/Primitives';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import type { InterviewSession } from '@/lib/types';
import { MOTION_EASE, SPRING_SNAPPY } from '@/motion/system';

interface AppShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ title, subtitle, actions, children }: AppShellProps) {
  const { user, logout, updateLocalUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [healthStatus, setHealthStatus] = useState<'ready' | 'offline'>('ready');
  const [assignedSessions, setAssignedSessions] = useState<InterviewSession[]>([]);

  const [profName, setProfName] = useState(user?.full_name || '');
  const [profRole, setProfRole] = useState(user?.target_role || '');
  const [profHeadline, setProfHeadline] = useState(user?.headline || '');
  const [profRecConsent, setProfRecConsent] = useState(Boolean(user?.recording_consent));
  const [profCamConsent, setProfCamConsent] = useState(Boolean(user?.webcam_consent));

  useEffect(() => {
    if (user) {
      setProfName(user.full_name || '');
      setProfRole(user.target_role || '');
      setProfHeadline(user.headline || '');
      setProfRecConsent(Boolean(user.recording_consent));
      setProfCamConsent(Boolean(user.webcam_consent));
    }
  }, [user]);

  useEffect(() => {
    api
      .checkHealth()
      .then((res) => setHealthStatus(res.status === 'ready' ? 'ready' : 'offline'))
      .catch(() => setHealthStatus('offline'));

    api
      .getInterviewHistory()
      .then((list) => {
        setAssignedSessions(list.filter((s) => s.is_recruiter_assigned || s.status === 'ready').slice(0, 5));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isRecruiter = user?.role === 'recruiter' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/interview/setup', label: 'Mock Interview', icon: Mic },
    { path: '/resume', label: 'Resume ATS', icon: FileText },
    { path: '/growth', label: 'Growth Journey', icon: Target },
    { path: '/insights', label: 'Insights', icon: BarChart3 },
    ...(isRecruiter ? [{ path: '/recruiter', label: 'Recruiter Portal', icon: Briefcase }] : []),
    ...(isAdmin ? [{ path: '/admin', label: 'Admin Terminal', icon: Shield }] : []),
  ];

  const commandResults = navItems.filter((item) =>
    item.label.toLowerCase().includes(commandQuery.trim().toLowerCase())
  );

  const initials = (user?.full_name || user?.email || 'SH')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await api.updateProfile({
        full_name: profName.trim(),
        target_role: profRole.trim(),
        headline: profHeadline.trim(),
        recording_consent: profRecConsent,
        webcam_consent: profCamConsent,
      });
      updateLocalUser(updated);
      toast('Profile and privacy consents saved.', 'success');
      setProfileOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save profile.', 'error');
    }
  };

  const handleExportData = async () => {
    try {
      const data = await api.exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'smarthire_personal_data_export.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Personal data archive exported.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed.', 'error');
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Deactivate your account? You will be signed out immediately.')) return;
    try {
      await api.deactivateAccount();
      await logout();
      navigate('/auth', { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Deactivation failed.', 'error');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex">
      {/* Desktop Sidebar */}
      <motion.aside
        layout
        transition={SPRING_SNAPPY}
        className={`hidden md:flex flex-col border-r border-border bg-surface shrink-0 sticky top-0 h-screen ${
          collapsed ? 'w-[80px]' : 'w-[268px]'
        }`}
      >
        <div className="h-[72px] px-5 flex items-center justify-between border-b border-border">
          {!collapsed ? (
            <Link to="/dashboard">
              <BrandMark size="md" />
            </Link>
          ) : (
            <Link to="/dashboard" aria-label="SmartHire Home" className="mx-auto">
              <span className="h-9 w-9 rounded-xl bg-ink text-canvas inline-flex items-center justify-center font-display text-sm font-semibold">
                S.
              </span>
            </Link>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-4 pb-2">
          <Link to="/interview/setup">
            <Button
              variant="accent"
              size="md"
              className={`w-full ${collapsed ? 'px-0 justify-center' : 'justify-center'}`}
            >
              <Plus className="h-4 w-4 shrink-0" />
              {!collapsed && <span>New Interview</span>}
            </Button>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto" aria-label="Workspace Navigation">
          {!collapsed && (
            <div className="px-3 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              Workspace
            </div>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition-colors ${
                  active ? 'text-ink' : 'text-ink-secondary hover:text-ink hover:bg-surface-2/70'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-xl bg-surface-2 border border-border"
                  />
                )}
                {active && (
                  <span
                    aria-hidden="true"
                    className="relative z-10 w-[3px] h-4 -ml-1 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/15 shrink-0"
                  />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0 relative z-10" />
                {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-border space-y-2">
          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="w-full h-10 rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="w-full flex items-center gap-3 rounded-xl p-2.5 hover:bg-surface-2 transition-colors text-left"
          >
            <span className="h-10 w-10 rounded-xl bg-ink text-canvas font-mono text-xs font-semibold inline-flex items-center justify-center shrink-0">
              {initials}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink truncate">
                  {user?.full_name || user?.email}
                </span>
                <span className="block text-xs font-mono text-ink-muted capitalize">{user?.role}</span>
              </span>
            )}
          </button>
        </div>
      </motion.aside>

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-[72px] border-b border-border bg-canvas/90 backdrop-blur-md px-5 sm:px-8 lg:px-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-medium truncate">{title}</h1>
              {subtitle && <p className="text-sm text-ink-secondary truncate hidden sm:block">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {actions}

            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Open command palette"
              className="hidden sm:inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-border bg-surface text-xs text-ink-secondary hover:text-ink transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-2 text-ink-muted">⌘K</kbd>
            </button>

            <div
              className="hidden xl:inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-border bg-surface text-xs font-mono text-ink-secondary"
              title="Backend API & Database status"
            >
              <Activity className="h-3.5 w-3.5" />
              <span
                className={`h-2 w-2 rounded-full ${
                  healthStatus === 'ready' ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              <span>{healthStatus === 'ready' ? 'Live' : 'Offline'}</span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink-secondary hover:text-ink transition-colors"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Notifications"
              className="relative h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink-secondary hover:text-ink transition-colors"
            >
              <Bell className="h-4 w-4" />
              {assignedSessions.length > 0 && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/25" />
              )}
            </button>

            <button
              type="button"
              data-testid="logout-btn"
              onClick={handleLogout}
              aria-label="Sign out"
              className="h-10 px-3.5 inline-flex items-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-ink-secondary hover:text-ink transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-[1600px] px-5 sm:px-8 lg:px-10 py-8">{children}</main>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-50 bg-black/50 md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: MOTION_EASE }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-surface border-r border-border p-5 flex flex-col justify-between md:hidden"
            >
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <BrandMark size="sm" />
                  <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close drawer">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="mt-4 space-y-1.5">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = location.pathname.startsWith(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileNavOpen(false)}
                        className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                          active ? 'bg-surface-2 text-ink border border-border' : 'text-ink-secondary'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
              <Button variant="secondary" onClick={() => { setMobileNavOpen(false); setProfileOpen(true); }}>
                <Settings className="h-4 w-4" /> Profile &amp; Privacy
              </Button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Command Palette */}
      <Modal
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Command Palette"
        description="Jump directly to any workspace or feature."
      >
        <div className="space-y-3">
          <div className="relative">
            <Command className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              autoFocus
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
              placeholder="Search workspaces…"
              className="w-full h-11 rounded-xl border border-border bg-canvas pl-10 pr-3.5 text-sm focus:border-ink focus:outline-none"
            />
          </div>
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {commandResults.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    setCommandOpen(false);
                    setCommandQuery('');
                    navigate(item.path);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-ink hover:bg-surface-2 transition-colors text-left"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-ink-muted" />
                    <span className="font-medium">{item.label}</span>
                  </span>
                  <span className="font-mono text-xs text-ink-muted">{item.path}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Notification Drawer */}
      <Modal
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        title="Assessment Activity"
        description="Pending and recruiter-assigned sessions."
      >
        {assignedSessions.length === 0 ? (
          <p className="text-sm text-ink-secondary py-4">No pending assessments right now.</p>
        ) : (
          <div className="space-y-3">
            {assignedSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-border bg-canvas p-4"
              >
                <div>
                  <div className="text-sm font-medium text-ink">
                    {s.domain} ({s.difficulty})
                  </div>
                  <div className="text-xs text-ink-muted font-mono mt-0.5">
                    {s.is_recruiter_assigned ? 'Recruiter Assigned' : 'Practice'} · {s.status}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="accent"
                  onClick={() => {
                    setNotificationsOpen(false);
                    navigate(`/interview/room/${s.id}`);
                  }}
                >
                  Open
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Profile & Privacy Modal */}
      <Modal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        title="Profile & Privacy Controls"
        description="Manage personal metadata, consent preferences, and data portability."
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">Full name</label>
            <input
              type="text"
              required
              value={profName}
              onChange={(e) => setProfName(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-canvas px-3.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">Target role</label>
            <input
              type="text"
              value={profRole}
              onChange={(e) => setProfRole(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-canvas px-3.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">Headline</label>
            <input
              type="text"
              value={profHeadline}
              onChange={(e) => setProfHeadline(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-canvas px-3.5 text-sm"
            />
          </div>
          <div className="rounded-xl border border-border bg-canvas p-4 space-y-2.5 text-sm">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={profRecConsent}
                onChange={(e) => setProfRecConsent(e.target.checked)}
              />
              <span>Explicit audio capture &amp; evaluation consent</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={profCamConsent}
                onChange={(e) => setProfCamConsent(e.target.checked)}
              />
              <span>Optional local webcam presentation coaching</span>
            </label>
          </div>
          <Button type="submit" variant="accent" className="w-full">
            Save Preferences
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={handleExportData}>
            Export My Data (JSON)
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleDeactivate} className="text-red-600">
            Deactivate Account
          </Button>
        </div>
      </Modal>
    </div>
  );
}
