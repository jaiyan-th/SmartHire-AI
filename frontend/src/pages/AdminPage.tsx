import React, { useEffect, useState } from 'react';
import { Pause, Play, Plus, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button, Modal, Skeleton } from '@/components/ui/Primitives';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import type { AdminOverview, AuditLogEntry, User } from '@/lib/types';

export default function AdminPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [logLevel, setLogLevel] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [streamPaused, setStreamPaused] = useState(false);

  // Settings
  const [llmBackend, setLlmBackend] = useState('Groq Llama-3.1-8B-Instant');
  const [temperature, setTemperature] = useState(0.4);
  const [maxTokens, setMaxTokens] = useState(1500);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Provision user modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'candidate' | 'recruiter' | 'admin'>('recruiter');

  const fetchOverviewAndUsers = async () => {
    try {
      const [ov, us, st] = await Promise.all([
        api.getAdminOverview(),
        api.getAdminUsers(userSearch ? { q: userSearch } : {}),
        api.getAdminSettings(),
      ]);
      setOverview(ov);
      setUsers(us);
      setLlmBackend(st.llm_backend);
      setTemperature(st.temperature);
      setMaxTokens(st.max_tokens);
      setMaintenanceMode(st.maintenance_mode);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load admin telemetry.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    if (streamPaused) return;
    try {
      const data = await api.getAdminLogs(logLevel, logQuery);
      setLogs(data);
    } catch {
      // ignore polling hiccup
    }
  };

  useEffect(() => {
    fetchOverviewAndUsers();
  }, []);

  useEffect(() => {
    fetchLogs();
    const timer = window.setInterval(fetchLogs, 5000);
    return () => window.clearInterval(timer);
  }, [logLevel, logQuery, streamPaused]);

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await api.updateAdminUser(userId, { role });
      toast(`Updated role to ${role}`, 'success');
      fetchOverviewAndUsers();
      fetchLogs();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Role update failed.', 'error');
      fetchOverviewAndUsers();
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await api.updateAdminUser(u.id, { is_active: !u.is_active });
      toast(`Account ${u.is_active ? 'suspended' : 'reactivated'}.`, 'success');
      fetchOverviewAndUsers();
      fetchLogs();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Status update failed.', 'error');
    }
  };

  const handleResetKey = async (u: User) => {
    if (!window.confirm(`Issue password reset token for ${u.email}?`)) return;
    try {
      await api.updateAdminUser(u.id, { issue_password_reset: true });
      toast(`Reset token issued for ${u.email}`, 'success');
      fetchLogs();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to issue reset.', 'error');
    }
  };

  const handleProvisionUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAdminUser({
        email: newEmail.trim(),
        full_name: newName.trim(),
        password: newPassword,
        role: newRole,
      });
      toast(`Provisioned ${newRole} account for ${newEmail}`, 'success');
      setCreateOpen(false);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      fetchOverviewAndUsers();
      fetchLogs();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'User creation failed.', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateAdminSettings({
        llm_backend: llmBackend,
        temperature,
        max_tokens: maxTokens,
        maintenance_mode: maintenanceMode,
      });
      toast('Platform configuration persisted.', 'success');
      fetchOverviewAndUsers();
      fetchLogs();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Configuration save failed.', 'error');
    }
  };

  return (
    <AppShell
      title="Admin Terminal"
      subtitle="Platform observability, RBAC provisioning, AI gateway parameters, and audit trail."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={fetchOverviewAndUsers}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="accent" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Provision User
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        {/* Telemetry Strip */}
        {loading || !overview ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="rounded-2xl p-6 card-elevated">
              <div className="font-mono text-xs text-ink-muted">DATABASE &amp; UPTIME</div>
              <div className="font-display text-2xl font-medium mt-2">{overview.db_status}</div>
              <div className="font-mono text-xs text-ink-secondary mt-1">
                {overview.db_engine} · {overview.db_ping_ms ?? 0}ms · up {overview.system_uptime}
              </div>
            </div>
            <div className="rounded-2xl p-6 card-elevated">
              <div className="font-mono text-xs text-ink-muted">AI USAGE &amp; COST</div>
              <div className="font-display text-2xl font-medium mt-2">{overview.token_consumption_total} tokens</div>
              <div className="font-mono text-xs text-ink-secondary mt-1">
                {overview.estimated_total_cost} · {overview.llm_latency_ms}ms avg
              </div>
            </div>
            <div className="rounded-2xl p-6 card-elevated">
              <div className="font-mono text-xs text-ink-muted">ACCOUNTS</div>
              <div className="font-display text-2xl font-medium mt-2" id="adm-users-count">
                {overview.registered_users} Accounts
              </div>
              <div className="font-mono text-xs text-ink-secondary mt-1">
                {overview.candidate_count} cand · {overview.recruiter_count} rec
              </div>
            </div>
            <div className="rounded-2xl p-6 card-elevated">
              <div className="font-mono text-xs text-ink-muted">SESSIONS &amp; JOBS</div>
              <div className="font-display text-2xl font-medium mt-2">{overview.total_sessions} Sessions</div>
              <div className="font-mono text-xs text-ink-secondary mt-1">
                Jobs: {overview.background_jobs_completed} ok / {overview.background_jobs_failed} err
              </div>
            </div>
          </section>
        )}

        {/* User RBAC Table + AI Settings */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 rounded-2xl card-elevated overflow-hidden">
            <div className="px-6 py-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-lg font-medium">User Role &amp; Account Control</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchOverviewAndUsers()}
                  placeholder="Filter email or name…"
                  className="h-10 rounded-xl border border-border bg-canvas px-3 text-sm"
                />
                <Button variant="secondary" size="sm" onClick={fetchOverviewAndUsers}>
                  Filter
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-canvas font-mono text-xs text-ink-muted">
                  <tr>
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-4 py-3.5">Role</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Reset</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-4">
                        <div className="font-medium text-ink">{u.full_name || 'User'}</div>
                        <div className="text-xs text-ink-muted">{u.email}</div>
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="h-9 rounded-lg border border-border bg-canvas px-2.5 text-xs"
                        >
                          <option value="candidate">Candidate</option>
                          <option value="recruiter">Recruiter</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          className={`px-2.5 py-1 rounded-md font-mono text-xs border ${
                            u.is_active
                              ? 'border-border bg-canvas text-ink'
                              : 'border-red-300 bg-red-50 text-red-700'
                          }`}
                        >
                          {u.is_active ? 'Active' : 'Suspended'}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleResetKey(u)}>
                          Reset Key
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="lg:col-span-5 rounded-2xl card-elevated p-7 space-y-5">
            <h3 className="font-display text-lg font-medium">AI &amp; Platform Configuration</h3>
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">Active LLM Provider</label>
              <select
                value={llmBackend}
                onChange={(e) => setLlmBackend(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
              >
                <option value="Groq Llama-3.1-8B-Instant">Groq Llama-3.1-8B-Instant</option>
                <option value="OpenAI GPT-4o-mini">OpenAI GPT-4o-mini</option>
                <option value="Local Ollama Llama-3">Local Ollama Llama-3</option>
              </select>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium text-ink-secondary">Temperature</span>
                <span className="font-mono">{temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-[#111111] dark:accent-[#C9F45B]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">Max Output Tokens</label>
              <input
                type="number"
                min={200}
                max={8000}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1500)}
                className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="h-4 w-4"
              />
              <span>Maintenance Mode (pause non-admin interview starts)</span>
            </label>
            <Button type="submit" variant="accent" size="lg" className="w-full">
              Persist Configuration
            </Button>
          </form>
        </section>

        {/* Audit Log Console */}
        <section className="rounded-2xl card-elevated overflow-hidden">
          <div className="px-6 py-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-medium">Security &amp; System Audit Console</h3>
              <p className="text-sm text-ink-muted">Live database-backed AuditLog events</p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={logQuery}
                onChange={(e) => setLogQuery(e.target.value)}
                placeholder="Search logs…"
                className="h-10 rounded-xl border border-border bg-canvas px-3.5 text-sm"
              />
              <select
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value)}
                className="h-10 rounded-xl border border-border bg-canvas px-3 text-sm"
              >
                <option value="">All Levels</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
              </select>
              <Button variant="secondary" size="sm" onClick={() => setStreamPaused((p) => !p)}>
                {streamPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {streamPaused ? 'Resume' : 'Pause'}
              </Button>
            </div>
          </div>

          <div
            id="admin-log-console"
            className="bg-[#090909] text-[#E5E5E5] font-mono text-xs p-5 h-96 overflow-y-auto space-y-2 rounded-b-2xl"
          >
            {logs.length === 0 ? (
              <div className="text-[#737373]">No audit events match current filter.</div>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="console-line leading-relaxed">
                  <span className="text-[#737373]">[{l.timestamp.slice(0, 19)}]</span>{' '}
                  <span
                    className={
                      l.level === 'ERROR'
                        ? 'text-red-400'
                        : l.level === 'WARN'
                          ? 'text-amber-400'
                          : 'text-[#C9F45B]'
                    }
                  >
                    [{l.level}]
                  </span>{' '}
                  <span className="text-[#F5F5F5]">{l.event_type}:</span>{' '}
                  <span className="text-[#A1A1A1]">{l.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Provision User Modal */}
      <Modal open={createOpen} onOpenChange={setCreateOpen} title="Provision User Account">
        <form onSubmit={handleProvisionUser} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1.5">Full name</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1.5">Email</label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1.5">Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'candidate' | 'recruiter' | 'admin')}
              className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
            >
              <option value="candidate">Candidate</option>
              <option value="recruiter">Recruiter</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1.5">Initial password</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
            />
          </div>
          <Button type="submit" variant="accent" size="lg" className="w-full">
            Create Account
          </Button>
        </form>
      </Modal>
    </AppShell>
  );
}
