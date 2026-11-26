import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ExternalLink, Mic } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button, CountUp, Skeleton } from '@/components/ui/Primitives';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import type { SkillGapResponse } from '@/lib/types';
import { MOTION_EASE, SPRING_SNAPPY } from '@/motion/system';

export default function GrowthPage() {
  const { toast } = useToast();
  const reduced = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SkillGapResponse | null>(null);

  useEffect(() => {
    api
      .getSkillGap()
      .then((res) => setData(res))
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load growth roadmap.', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleToggleMilestone = async (key: string, nextDone: boolean) => {
    if (!data) return;
    setData({
      ...data,
      roadmap: data.roadmap.map((w) => ({
        ...w,
        milestones: w.milestones.map((m) => (m.key === key ? { ...m, done: nextDone } : m)),
      })),
    });
    try {
      await api.toggleMilestone(key, nextDone);
      toast(nextDone ? 'Milestone completed.' : 'Milestone unmarked.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save milestone.', 'error');
    }
  };

  const allMilestones = data?.roadmap.flatMap((w) => w.milestones) || [];
  const completedCount = allMilestones.filter((m) => m.done).length;
  const progressPct = allMilestones.length ? Math.round((completedCount / allMilestones.length) * 100) : 0;

  return (
    <AppShell
      title="Growth Journey"
      subtitle="Role competency alignment and 4-week structured remediation roadmap."
      actions={
        <Link to="/interview/setup">
          <Button variant="accent" size="sm">
            <Mic className="h-3.5 w-3.5" /> Practice Drill
          </Button>
        </Link>
      }
    >
      {loading || !data ? (
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : data.has_data === false || (data.role_comparison.length === 0 && data.roadmap.length === 0) ? (
        <section className="max-w-2xl mx-auto rounded-2xl p-10 text-center space-y-5 card-elevated">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
            TARGET ROLE · {data.target_role}
          </span>
          <h2 className="font-display text-2xl sm:text-3xl font-medium">
            No resume or interview assessment data yet
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            Upload your resume for ATS skill extraction or complete your first mock interview so SmartHire can calculate verified competency alignment and generate a personalized 4-week roadmap.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to="/resume">
              <Button variant="secondary" size="lg">
                Upload Resume (ATS)
              </Button>
            </Link>
            <Link to="/interview/setup">
              <Button variant="accent" size="lg">
                <Mic className="h-4 w-4" /> Start Mock Interview
              </Button>
            </Link>
          </div>
        </section>
      ) : (
        <div className="space-y-10">
          {/* Header Readiness Bar */}
          <section className="rounded-2xl p-7 sm:p-9 card-elevated flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <span className="font-mono text-xs text-ink-muted">TARGET BENCHMARK</span>
              <h2 className="font-display text-2xl sm:text-3xl font-medium mt-1">{data.target_role}</h2>
              <p className="text-sm text-ink-secondary mt-1">
                Role alignment: <span className="font-mono font-semibold text-ink">{data.overall_match_percentage}%</span>
              </p>
            </div>

            <div className="min-w-[220px] space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-ink-muted">ROADMAP COMPLETION</span>
                <span className="font-display text-2xl font-medium">
                  <CountUp value={progressPct} suffix="%" />
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
                <motion.div
                  className="h-full bg-[#C9F45B]"
                  animate={{ width: `${progressPct}%` }}
                  transition={SPRING_SNAPPY}
                />
              </div>
              <div className="text-xs text-ink-muted font-mono">
                {completedCount} of {allMilestones.length} milestones completed
              </div>
            </div>
          </section>

          {/* Skill Matrix & Weak Area Diagnosis */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-2xl p-7 card-elevated space-y-5">
              <h3 className="font-display text-lg font-medium">Competency Mastery vs Target</h3>
              <div className="space-y-4">
                {data.role_comparison.map((row) => (
                  <div key={row.skill} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">{row.skill}</span>
                      <span className="font-mono text-xs text-ink-secondary">
                        {row.candidate}% / Req {row.required}% · {row.status}
                      </span>
                    </div>
                    <div className="relative h-2.5 w-full rounded-full bg-surface-2 overflow-hidden">
                      <motion.div
                        className="h-full bg-ink dark:bg-[#C9F45B]"
                        initial={reduced ? { width: `${row.candidate}%` } : { width: 0 }}
                        animate={{ width: `${row.candidate}%` }}
                        transition={{ duration: 0.7, ease: MOTION_EASE }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl p-7 card-elevated space-y-4">
              <h3 className="font-display text-lg font-medium">Evidence-Based Focus Areas</h3>
              {data.weak_areas.length === 0 ? (
                <p className="text-sm text-ink-secondary">No critical gaps detected.</p>
              ) : (
                <div className="space-y-3">
                  {data.weak_areas.map((w, i) => (
                    <div key={i} className="rounded-xl border border-border bg-canvas p-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{w.topic}</span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-2 text-ink-secondary">
                          {w.impact}
                        </span>
                      </div>
                      <p className="text-sm text-ink-secondary">{w.detail}</p>
                      <p className="text-xs font-medium text-ink">Next: {w.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Connected 4-Week Milestone Roadmap */}
          <section className="space-y-4">
            <h3 className="font-display text-xl font-medium">4-Week Remediation Curriculum</h3>
            <div className="relative space-y-5 pl-5 border-l border-border">
              {data.roadmap.map((week) => (
                <div
                  key={week.week}
                  className="relative rounded-2xl p-7 card-elevated space-y-4"
                >
                  <span className="absolute -left-[25px] top-8 h-3 w-3 rounded-full bg-[#C9F45B] ring-4 ring-canvas border border-[#111111]/20" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-display text-lg font-medium text-ink">{week.week}</h4>
                    <span className="font-mono text-xs text-ink-muted">{week.focus}</span>
                  </div>

                  <div className="space-y-2.5">
                    {week.milestones.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => handleToggleMilestone(m.key, !m.done)}
                        className="w-full flex items-center gap-3.5 rounded-xl border border-border bg-canvas px-4 py-3 text-left text-sm hover:border-ink transition-colors"
                      >
                        <span
                          className={`h-4 w-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                            m.done
                              ? 'bg-[#C9F45B] border-[#111111]/30 text-[#111111]'
                              : 'border-border bg-surface'
                          }`}
                        >
                          {m.done && (
                            <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={SPRING_SNAPPY}>
                              <Check className="h-3 w-3 stroke-[2.5]" />
                            </motion.span>
                          )}
                        </span>
                        <span className={m.done ? 'line-through text-ink-muted' : 'text-ink'}>{m.task}</span>
                      </button>
                    ))}
                  </div>

                  {week.resources.length > 0 && (
                    <div className="pt-2 border-t border-border flex flex-wrap gap-4 text-xs">
                      {week.resources.map((r) => (
                        <a
                          key={r.url}
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-ink-secondary hover:text-ink underline underline-offset-2"
                        >
                          {r.name} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
