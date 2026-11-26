import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { ChevronDown, Download, ExternalLink, Lock, Share2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button, CountUp, Skeleton } from '@/components/ui/Primitives';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import type { InsightsResponse } from '@/lib/types';
import { MOTION_EASE, staggerContainerVariants, riseVariants } from '@/motion/system';

export default function InsightsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const reduced = useReducedMotion();

  const sessionId = searchParams.get('session_id');
  const isReveal = searchParams.get('reveal') === '1';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [openQuestionIdx, setOpenQuestionIdx] = useState<number | null>(0);
  const [sharing, setSharing] = useState(false);

  const load = async (sid: string | null) => {
    setLoading(true);
    try {
      const res = await api.getInsights(sid);
      setData(res);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load assessment insights.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(sessionId);
  }, [sessionId]);

  const handleToggleShare = async () => {
    if (!data?.session_id) return;
    setSharing(true);
    try {
      const next = !data.shared_with_recruiters;
      await api.shareSession(data.session_id, next);
      setData((prev) => (prev ? { ...prev, shared_with_recruiters: next } : prev));
      toast(next ? 'Shared with authorized recruiters.' : 'Set back to Private Practice.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update privacy.', 'error');
    } finally {
      setSharing(false);
    }
  };

  const score = data?.overall_score ?? 0;
  const ringCircumference = 2 * Math.PI * 52;
  const ringOffset = ringCircumference - (Math.min(100, Math.max(0, score)) / 100) * ringCircumference;

  return (
    <AppShell
      title="Assessment Report"
      subtitle="Deterministic 4-pillar evaluation and question-level evidence."
      actions={
        data?.has_data && data.session_id ? (
          <Link to={`/dossier?session_id=${encodeURIComponent(data.session_id)}`}>
            <Button variant="accent" size="sm">
              <Download className="h-3.5 w-3.5" /> Certified Dossier
            </Button>
          </Link>
        ) : null
      }
    >
      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-44 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      ) : !data || !data.has_data ? (
        <div className="max-w-lg mx-auto rounded-2xl border border-border bg-surface p-10 text-center space-y-4">
          <span className="font-mono text-xs uppercase text-ink-muted">NO ASSESSMENTS YET</span>
          <h2 className="font-display text-2xl font-medium">Complete your first mock interview</h2>
          <p className="text-sm text-ink-secondary">
            Your evaluation breakdown, radar benchmark, and question critiques populate automatically once a session finishes.
          </p>
          <Link to="/interview/setup">
            <Button variant="accent">Configure Session</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {isReveal && (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: MOTION_EASE }}
              className="rounded-xl border border-border bg-surface px-5 py-3 flex items-center justify-between text-xs"
            >
              <span className="font-mono text-ink">
                EVALUATION FINALIZED · {data.domain} ({data.difficulty})
              </span>
              <span className="text-ink-muted">Deterministic 30/25/30/15 Rubric</span>
            </motion.div>
          )}

          {/* Editorial Score Hero */}
          <section className="rounded-2xl p-7 sm:p-10 card-elevated flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="space-y-4 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs px-3 py-1 rounded-md bg-surface-2 text-ink">
                  {data.domain} · {data.difficulty}
                </span>
                <span
                  className={`font-mono text-xs px-3 py-1 rounded-md font-medium ${
                    score >= 70
                      ? 'bg-[#C9F45B] text-[#111111]'
                      : score >= 50
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
                        : 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200 border border-red-300 dark:border-red-800'
                  }`}
                >
                  {data.rating_band}
                </span>
              </div>

              <h2 className="font-display text-3xl sm:text-4xl font-medium tracking-tight">
                Composite Assessment Overview
              </h2>

              <p className="text-sm text-ink-secondary leading-relaxed">
                Calculated deterministically from Communication (30%), Technical Relevance (30%), Confidence (25%), and Professionalism (15%). Confidence and webcam cues are coaching indicators only, never standalone hiring judgments.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {data.history.length > 0 && (
                  <select
                    aria-label="Inspect session"
                    value={data.session_id || ''}
                    onChange={(e) => setSearchParams({ session_id: e.target.value })}
                    className="h-10 rounded-xl border border-border bg-canvas px-3.5 text-xs font-mono"
                  >
                    {data.history.map((h) => (
                      <option key={h.session_id} value={h.session_id}>
                        {h.date} — {h.domain} ({h.overall_score})
                      </option>
                    ))}
                  </select>
                )}

                <Button variant="secondary" size="sm" loading={sharing} onClick={handleToggleShare}>
                  {data.shared_with_recruiters ? (
                    <>
                      <Share2 className="h-3.5 w-3.5 text-emerald-600" /> Shared with Recruiters
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" /> Private Practice Only
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Score Ring */}
            <div className="flex items-center gap-6 shrink-0">
              <div className="relative h-36 w-36 flex items-center justify-center">
                <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="var(--border-subtle)"
                    strokeWidth="6"
                  />
                  <motion.circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="#C9F45B"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    initial={reduced ? { strokeDashoffset: ringOffset } : { strokeDashoffset: ringCircumference }}
                    animate={{ strokeDashoffset: ringOffset }}
                    transition={{ duration: 0.9, ease: MOTION_EASE }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-3xl font-medium" id="overall-score-display">
                    <CountUp value={score} decimals={1} />
                  </span>
                  <span className="font-mono text-[10px] text-ink-muted">/ 100</span>
                </div>
              </div>
            </div>
          </section>

          {/* 4-Pillar Horizontal Breakdown & Radar Benchmark */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <motion.div
              variants={staggerContainerVariants}
              initial={reduced ? false : 'hidden'}
              animate="visible"
              className="lg:col-span-7 rounded-2xl p-7 card-elevated space-y-5"
            >
              <h3 className="font-display text-lg font-medium">Pillar Breakdown</h3>
              {(['technical', 'communication', 'confidence', 'professionalism'] as const).map((key) => {
                const p = data.pillars?.[key];
                if (!p) return null;
                return (
                  <motion.div key={key} variants={riseVariants} className="space-y-2">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium capitalize text-ink">
                        {key} <span className="font-mono text-xs text-ink-muted">({p.weight})</span>
                      </span>
                      <span className="font-mono font-semibold text-ink">{p.score} / 100</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-surface-2 overflow-hidden">
                      <motion.div
                        className="h-full bg-ink dark:bg-[#C9F45B]"
                        initial={reduced ? { width: `${p.score}%` } : { width: 0 }}
                        animate={{ width: `${p.score}%` }}
                        transition={{ duration: 0.75, ease: MOTION_EASE }}
                      />
                    </div>
                    <div className="text-xs text-ink-secondary">{p.metric}</div>
                  </motion.div>
                );
              })}
            </motion.div>

            <div className="lg:col-span-5 rounded-2xl p-7 card-elevated flex flex-col">
              <h3 className="font-display text-lg font-medium mb-2">Benchmark Radar</h3>
              <p className="text-sm text-ink-secondary mb-4">Candidate scores compared against target role baseline.</p>
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={data.radar}>
                    <PolarGrid stroke="var(--border-subtle)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <RechartsTooltip />
                    <Radar
                      name="Candidate"
                      dataKey="candidate"
                      stroke="#111111"
                      fill="#C9F45B"
                      fillOpacity={0.45}
                    />
                    <Radar
                      name="Benchmark"
                      dataKey="benchmark"
                      stroke="var(--text-muted)"
                      fill="transparent"
                      strokeDasharray="4 4"
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Speech, Grammar & Behavioral Vision Telemetry */}
          {data.behavior_summary && (
            <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {[
                { label: 'SPEECH PACE', val: data.behavior_summary.avg_wpm ? `${data.behavior_summary.avg_wpm} WPM` : 'Written' },
                { label: 'GRAMMAR QUALITY', val: data.behavior_summary.avg_grammar_score ? `${data.behavior_summary.avg_grammar_score}%` : '—' },
                { label: 'PRONUNCIATION', val: data.behavior_summary.avg_pronunciation_score ? `${data.behavior_summary.avg_pronunciation_score}%` : '—' },
                { label: 'EYE CONTACT', val: data.behavior_summary.avg_eye_contact !== null ? `${data.behavior_summary.avg_eye_contact}%` : 'Cam Off' },
                { label: 'ATTENTION', val: data.behavior_summary.avg_attention_score !== null ? `${data.behavior_summary.avg_attention_score}%` : 'Cam Off' },
                { label: 'EXPRESSION', val: data.behavior_summary.dominant_emotion || 'Neutral' },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-border bg-surface p-4">
                  <div className="font-mono text-[10px] text-ink-muted">{m.label}</div>
                  <div className="font-display text-lg font-medium mt-1 text-ink">{m.val}</div>
                </div>
              ))}
            </section>
          )}

          {/* Qualitative Strengths, Gaps & Resources */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl p-7 card-elevated space-y-3">
              <span className="font-mono text-xs text-ink-muted">DEMONSTRATED STRENGTHS</span>
              <ul className="space-y-2 text-sm text-ink-secondary list-disc pl-4">
                {(data.feedback?.strengths || []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl p-7 card-elevated space-y-3">
              <span className="font-mono text-xs text-ink-muted">AREAS TO REFINE</span>
              <ul className="space-y-2 text-sm text-ink-secondary list-disc pl-4">
                {(data.feedback?.weaknesses || []).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl p-7 card-elevated space-y-3">
              <span className="font-mono text-xs text-ink-muted">RECOMMENDED NEXT STEPS</span>
              <ul className="space-y-2 text-sm text-ink-secondary list-disc pl-4">
                {(data.feedback?.suggestions || []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
                {(data.feedback?.resources || []).map((r, i) => (
                  <li key={`res-${i}`}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-ink font-medium underline underline-offset-2"
                    >
                      {r.title} <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Question-Level Evaluation Accordions */}
          <section className="space-y-3">
            <h3 className="font-display text-lg font-medium">Question-by-Question Review</h3>
            <div className="divide-y divide-border rounded-2xl card-elevated overflow-hidden">
              {(data.question_evaluations || []).map((qe, idx) => {
                const isOpen = openQuestionIdx === idx;
                return (
                  <div key={qe.order}>
                    <button
                      type="button"
                      onClick={() => setOpenQuestionIdx(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full px-7 py-5 flex items-center justify-between gap-4 text-left hover:bg-canvas/50 transition-colors"
                    >
                      <span className="text-sm font-medium text-ink">
                        <span className="font-mono text-xs text-ink-muted mr-2">Q{qe.order}</span>
                        {qe.prompt}
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-2 text-ink">
                          {qe.score}/100
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={reduced ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={reduced ? undefined : { opacity: 0, height: 0 }}
                          transition={{ duration: 0.24, ease: MOTION_EASE }}
                          className="overflow-hidden border-t border-border bg-canvas/60"
                        >
                          <div className="px-6 py-5 space-y-3 text-sm">
                            <div className="flex flex-wrap gap-2 font-mono text-[11px] text-ink-secondary">
                              {qe.wpm > 0 && <span className="px-2 py-0.5 rounded bg-surface border border-border">{qe.wpm} WPM</span>}
                              {Boolean(qe.grammar_score) && <span className="px-2 py-0.5 rounded bg-surface border border-border">Grammar {qe.grammar_score}%</span>}
                              {Boolean(qe.pronunciation_score) && <span className="px-2 py-0.5 rounded bg-surface border border-border">Pronunciation {qe.pronunciation_score}%</span>}
                              {Boolean(qe.eye_contact_percentage) && (
                                <span className="px-2 py-0.5 rounded bg-surface border border-border">
                                  Eye Contact {qe.eye_contact_percentage}% · {qe.dominant_emotion || 'Neutral'}
                                </span>
                              )}
                            </div>
                            {qe.media_recording_url && (
                              <div className="rounded-xl border border-border bg-surface p-3 space-y-1.5">
                                <span className="font-mono text-[10px] text-ink-muted block">SESSION RECORDING PLAYBACK</span>
                                <video controls src={qe.media_recording_url} className="w-full max-h-56 rounded-lg bg-black" />
                              </div>
                            )}
                            <div>
                              <span className="font-mono text-[11px] text-ink-muted block mb-1">YOUR RESPONSE</span>
                              <p className="text-ink whitespace-pre-wrap">{qe.candidate_response}</p>
                            </div>
                            <div>
                              <span className="font-mono text-[11px] text-ink-muted block mb-1">CRITIQUE</span>
                              <p className="text-ink-secondary">{qe.critique}</p>
                            </div>
                            <div>
                              <span className="font-mono text-[11px] text-ink-muted block mb-1">REFERENCE MODEL ANSWER</span>
                              <p className="text-ink-secondary">{qe.model_answer}</p>
                            </div>
                            <div className="pt-1 text-xs font-medium text-ink">
                              Improvement focus: {qe.improvements}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
