import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Code2,
  FileText,
  Lock,
  MessageSquare,
  Mic,
  Share2,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button, CountUp, Skeleton } from '@/components/ui/Primitives';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import { getGreeting } from '@/lib/cn';
import type { InsightsResponse, InterviewSession, ResumeRecord } from '@/lib/types';
import { MOTION_EASE } from '@/motion/system';

const QUICK_TRACKS = [
  { label: 'Technical', sub: 'Coding & system design', category: 'Technical', icon: Code2 },
  { label: 'Behavioral', sub: 'STAR leadership scenarios', category: 'Behavioral', icon: MessageSquare },
  { label: 'HR & Fit', sub: 'Culture & communication', category: 'HR', icon: Users },
  { label: 'Aptitude', sub: 'Logic & reasoning', category: 'Aptitude', icon: Brain },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [history, setHistory] = useState<InterviewSession[]>([]);

  const loadWorkspace = async () => {
    setLoading(true);
    const [insRes, resList, histList] = await Promise.allSettled([
      api.getInsights(),
      api.getResumeHistory(),
      api.getInterviewHistory(),
    ]);
    if (insRes.status === 'fulfilled') setInsights(insRes.value);
    if (resList.status === 'fulfilled') setResumes(resList.value);
    if (histList.status === 'fulfilled') setHistory(histList.value);
    setLoading(false);
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const latestResume = resumes[0] || null;
  const completedCount = insights?.total_sessions || 0;
  const readinessScore = insights?.has_data
    ? insights.overall_score
    : latestResume
      ? latestResume.ats_score
      : 0;

  const recommendedAction = !latestResume
    ? { label: 'Upload your resume for ATS gap analysis', to: '/resume' }
    : !insights?.has_data
      ? { label: 'Complete your baseline mock interview', to: '/interview/setup' }
      : latestResume.missing_skills.length > 0
        ? {
            label: `Practice targeted gaps: ${latestResume.missing_skills.slice(0, 3).join(', ')}`,
            to: `/interview/setup?skills=${encodeURIComponent(latestResume.missing_skills.slice(0, 4).join(', '))}`,
          }
        : { label: 'Continue your 4-week growth roadmap', to: '/growth' };

  const handleToggleShare = async (session: InterviewSession) => {
    try {
      const nextVal = !session.shared_with_recruiters;
      await api.shareSession(session.id, nextVal);
      setHistory((prev) =>
        prev.map((item) => (item.id === session.id ? { ...item, shared_with_recruiters: nextVal } : item))
      );
      toast(nextVal ? 'Report shared with authorized recruiters.' : 'Report returned to private practice.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to update sharing.', 'error');
    }
  };

  const handleDeletePractice = async (session: InterviewSession) => {
    if (!window.confirm('Delete this practice session permanently?')) return;
    try {
      await api.deleteInterview(session.id);
      setHistory((prev) => prev.filter((item) => item.id !== session.id));
      toast('Practice session deleted.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete session.', 'error');
    }
  };

  return (
    <AppShell
      title="Candidate Workspace"
      subtitle={`Targeting ${user?.target_role || 'Software Engineering'}`}
    >
      <div className="space-y-8">
        {/* Welcome Hero Cockpit */}
        <section className="rounded-2xl p-7 sm:p-9 card-elevated space-y-7">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas px-3.5 py-1 font-mono text-xs text-ink-secondary">
                <span className="h-2 w-2 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/20" />
                {completedCount > 0
                  ? `${completedCount} COMPLETED ASSESSMENT${completedCount === 1 ? '' : 'S'}`
                  : 'READY FOR FIRST ASSESSMENT'}
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-tight">
                {getGreeting()}, {user?.full_name?.split(' ')[0] || 'Candidate'}.
              </h2>
              <p className="text-base text-ink-secondary leading-relaxed">
                Recommended next step:{' '}
                <Link to={recommendedAction.to} className="text-ink font-medium underline underline-offset-4">
                  {recommendedAction.label}
                </Link>
              </p>
            </div>

            <div className="flex flex-wrap gap-3 shrink-0">
              <Link to="/resume">
                <Button variant="secondary" size="lg">
                  <FileText className="h-4 w-4" /> Analyze Resume
                </Button>
              </Link>
              <Link to="/interview/setup">
                <Button variant="accent" size="lg">
                  <Mic className="h-4 w-4" /> Start Mock Interview <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Interactive Track Launch Strip */}
          <div className="pt-6 border-t border-border">
            <div className="font-mono text-[11px] uppercase tracking-wider text-ink-muted mb-3">
              Quick Launch by Format
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {QUICK_TRACKS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.category}
                    type="button"
                    onClick={() => navigate(`/interview/setup?category=${encodeURIComponent(t.category)}`)}
                    className="group rounded-xl border border-border bg-canvas px-4 py-3.5 text-left hover:border-ink transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="h-9 w-9 rounded-lg bg-surface border border-border inline-flex items-center justify-center shrink-0 group-hover:bg-[#C9F45B] group-hover:text-[#111111] transition-colors">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">{t.label}</div>
                        <div className="text-xs text-ink-muted leading-snug">{t.sub}</div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-ink group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Guided Onboarding Steps when user has no data yet */}
        {!loading && !insights?.has_data && !latestResume && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                step: '01',
                title: 'Upload Your Resume',
                desc: 'Extract verified skills and discover gaps against your target role.',
                to: '/resume',
                cta: 'Open Resume ATS',
                icon: FileText,
                done: Boolean(latestResume),
              },
              {
                step: '02',
                title: 'Practice in the Studio',
                desc: 'Answer tailored prompts via microphone or code with live WPM feedback.',
                to: '/interview/setup',
                cta: 'Configure Session',
                icon: Mic,
                done: Boolean(insights?.has_data),
              },
              {
                step: '03',
                title: 'Review Growth Plan',
                desc: 'Inspect your 4-pillar score breakdown and 4-week milestone roadmap.',
                to: '/growth',
                cta: 'View Roadmap',
                icon: Target,
                done: false,
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.step}
                  className="rounded-2xl p-6 flex flex-col justify-between space-y-5 card-elevated"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-ink-muted">STEP {card.step}</span>
                      {card.done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Icon className="h-4 w-4 text-ink-secondary" />
                      )}
                    </div>
                    <h3 className="font-display text-xl font-medium">{card.title}</h3>
                    <p className="text-sm text-ink-secondary leading-relaxed">{card.desc}</p>
                  </div>
                  <Link to={card.to}>
                    <Button variant="secondary" size="md" className="w-full justify-between">
                      <span>{card.cta}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              );
            })}
          </section>
        )}

        {/* Asymmetrical 12-Column Overview */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Primary Performance & Trend (7 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: MOTION_EASE }}
            className="lg:col-span-7 rounded-2xl p-7 flex flex-col justify-between card-elevated"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-border">
              <div>
                <span className="font-mono text-xs text-ink-muted">READINESS INDEX</span>
                {loading ? (
                  <Skeleton className="h-12 w-40 mt-2" />
                ) : (
                  <div className="flex items-baseline gap-3 mt-1.5">
                    <span className="font-display text-5xl sm:text-6xl font-medium tracking-tight">
                      <CountUp value={readinessScore} decimals={insights?.has_data ? 1 : 0} />
                    </span>
                    <span className="text-base font-mono text-ink-muted">/ 100</span>
                    {insights?.has_data && (
                      <span className="text-xs font-medium px-3 py-1 rounded-full bg-[#C9F45B] text-[#111111]">
                        {insights.rating_band}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {insights?.has_data && (
                <Link
                  to={`/insights?session_id=${insights.session_id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:underline"
                >
                  Inspect latest report <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            <div className="pt-6 h-72">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : insights?.progression && insights.progression.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={insights.progression} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C9F45B" stopOpacity={0.38} />
                        <stop offset="95%" stopColor="#C9F45B" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '12px',
                        fontSize: '13px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="overall"
                      stroke="var(--text-primary)"
                      strokeWidth={2.25}
                      fill="url(#scoreFill)"
                      dot={{ r: 4, fill: '#C9F45B', stroke: '#111111', strokeWidth: 1.5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full rounded-xl border border-dashed border-border bg-canvas/50 flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <p className="text-base font-medium text-ink">No progression data yet</p>
                  <p className="text-sm text-ink-secondary max-w-sm">
                    Complete your first mock interview to plot your 4-pillar score progression over time.
                  </p>
                  <Link to="/interview/setup">
                    <Button variant="accent" size="sm">
                      Start First Interview
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>

          {/* Right Resume & Skill Snapshot (5 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08, ease: MOTION_EASE }}
            className="lg:col-span-5 rounded-2xl p-7 flex flex-col justify-between space-y-6 card-elevated"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-muted">RESUME ALIGNMENT</span>
                <Link to="/resume" className="text-sm font-medium text-ink-secondary hover:text-ink">
                  Manage →
                </Link>
              </div>
              {loading ? (
                <Skeleton className="h-20 w-full mt-4" />
              ) : latestResume ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-base font-medium text-ink truncate">
                      {latestResume.file_name}
                    </span>
                    <span className="font-mono text-2xl font-semibold text-ink shrink-0">
                      {latestResume.ats_score}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full bg-[#C9F45B]"
                      style={{ width: `${Math.min(100, latestResume.ats_score)}%` }}
                    />
                  </div>
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    {latestResume.executive_summary}
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-base font-medium text-ink">No resume analyzed yet</p>
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    Upload a PDF, DOCX, or paste resume text to benchmark your target role and unlock tailored interview questions.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-5 border-t border-border space-y-4">
              <div className="font-mono text-xs text-ink-muted">IDENTIFIED SKILL GAPS</div>
              {latestResume?.missing_skills?.length ? (
                <div className="flex flex-wrap gap-2">
                  {latestResume.missing_skills.slice(0, 6).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-lg border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-ink"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Your skill gaps will appear here after resume analysis.</p>
              )}

              <div className="pt-2 flex flex-wrap gap-3">
                <Link to="/growth" className="flex-1 min-w-[140px]">
                  <Button variant="secondary" size="md" className="w-full">
                    Growth Roadmap
                  </Button>
                </Link>
                {latestResume?.missing_skills?.length ? (
                  <Button
                    variant="primary"
                    size="md"
                    className="flex-1 min-w-[140px]"
                    onClick={() =>
                      navigate(
                        `/interview/setup?skills=${encodeURIComponent(latestResume.missing_skills.slice(0, 4).join(', '))}`
                      )
                    }
                  >
                    Targeted Drill
                  </Button>
                ) : (
                  <Link to="/resume" className="flex-1 min-w-[140px]">
                    <Button variant="primary" size="md" className="w-full">
                      Upload Resume
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        </section>

        {/* Practice & Assigned Assessments Table */}
        <section className="rounded-2xl overflow-hidden card-elevated">
          <div className="px-7 py-5 border-b border-border flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-medium">Practice &amp; Assigned Assessments</h3>
              <p className="text-sm text-ink-secondary">
                Private sessions remain hidden from recruiters unless you explicitly choose to share them.
              </p>
            </div>
            <Link to="/interview/setup">
              <Button variant="secondary" size="sm">
                + New Session
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="p-7 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : history.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-base font-medium text-ink">No interview sessions recorded yet.</p>
              <p className="text-sm text-ink-secondary">
                Launch your first practice session to generate a 4-pillar score report.
              </p>
              <div className="pt-1">
                <Link to="/interview/setup">
                  <Button variant="accent" size="md">
                    Start your first session
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs font-mono text-ink-muted bg-canvas">
                  <tr>
                    <th className="px-7 py-3.5 font-medium">Track</th>
                    <th className="px-4 py-3.5 font-medium">Level</th>
                    <th className="px-4 py-3.5 font-medium">Status</th>
                    <th className="px-4 py-3.5 font-medium">Score</th>
                    <th className="px-4 py-3.5 font-medium">Privacy</th>
                    <th className="px-7 py-3.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.slice(0, 10).map((s) => {
                    const isDone = s.status === 'completed';
                    return (
                      <tr key={s.id} className="hover:bg-canvas/60 transition-colors">
                        <td className="px-7 py-4">
                          <div className="font-medium text-ink">
                            {s.domain} · {s.category}
                          </div>
                          {s.is_recruiter_assigned && (
                            <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded bg-[#C9F45B] text-[#111111]">
                              ASSIGNED
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-ink-secondary">{s.difficulty}</td>
                        <td className="px-4 py-4 font-mono text-xs capitalize text-ink-secondary">
                          {s.status.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-4 font-mono text-sm">
                          {s.overall_score !== null && s.overall_score !== undefined
                            ? `${s.overall_score} (${s.rating_band})`
                            : '—'}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => handleToggleShare(s)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink"
                          >
                            {s.shared_with_recruiters ? (
                              <>
                                <Share2 className="h-3.5 w-3.5 text-emerald-600" /> Shared
                              </>
                            ) : (
                              <>
                                <Lock className="h-3.5 w-3.5" /> Private
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-7 py-4 text-right space-x-2">
                          {isDone ? (
                            <Link to={`/insights?session_id=${s.id}`}>
                              <Button variant="secondary" size="sm">
                                Results
                              </Button>
                            </Link>
                          ) : (
                            <Link to={`/interview/room/${s.id}`}>
                              <Button variant="accent" size="sm">
                                Resume
                              </Button>
                            </Link>
                          )}
                          {!s.is_recruiter_assigned && (
                            <button
                              type="button"
                              onClick={() => handleDeletePractice(s)}
                              aria-label="Delete session"
                              className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-ink-muted hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
