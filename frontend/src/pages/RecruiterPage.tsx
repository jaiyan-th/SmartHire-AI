import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus, Scale, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button, Modal, Skeleton } from '@/components/ui/Primitives';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import type { InterviewTemplate, RecruiterCandidate } from '@/lib/types';

export default function RecruiterPage() {
  const { toast } = useToast();

  const [tab, setTab] = useState<'roster' | 'templates'>('roster');
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<RecruiterCandidate[]>([]);
  const [stats, setStats] = useState({
    evaluated_count: 0,
    average_composite: 0,
    shortlisted_count: 0,
    flagged_count: 0,
  });
  const [templates, setTemplates] = useState<InterviewTemplate[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'rank' | 'recent'>('rank');

  // Modals
  const [activeCandidate, setActiveCandidate] = useState<RecruiterCandidate | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignTemplateId, setAssignTemplateId] = useState('');
  const [assignDeadline, setAssignDeadline] = useState('');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareRows, setCompareRows] = useState<Array<{
    session_id: string;
    candidate_name: string;
    domain: string;
    overall_score: number | null;
    rating_band: string;
    technical_relevance_score: number | null;
    communication_score: number | null;
    professionalism_score: number | null;
    recruiter_status: string;
  }>>([]);

  // Template form
  const [tplTitle, setTplTitle] = useState('');
  const [tplDomain, setTplDomain] = useState('Software Engineering');
  const [tplLevel, setTplLevel] = useState('Mid-Level');
  const [tplDuration, setTplDuration] = useState(25);
  const [tplCount, setTplCount] = useState(5);
  const [tplSkills, setTplSkills] = useState('Python, Django, PostgreSQL, Docker');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [candRes, tplRes] = await Promise.all([
        api.getRecruiterCandidates(),
        api.getRecruiterTemplates(),
      ]);
      setCandidates(candRes.candidates || []);
      setStats(candRes.stats || { evaluated_count: 0, average_composite: 0, shortlisted_count: 0, flagged_count: 0 });
      setTemplates(tplRes || []);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load recruiter data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = candidates.filter((c) => {
      const mName = c.candidate_name.toLowerCase().includes(q) || c.candidate_email.toLowerCase().includes(q);
      const mDom = domainFilter === 'all' || c.domain === domainFilter;
      const mTier = tierFilter === 'all' || c.scores?.rating_band === tierFilter;
      const mFlag = !flaggedOnly || c.proctoring_flagged || c.recruiter_status === 'flagged_for_review';
      return mName && mDom && mTier && mFlag;
    });
    if (sortBy === 'rank') {
      return [...list].sort((a, b) => (b.scores?.overall ?? -1) - (a.scores?.overall ?? -1));
    }
    return list;
  }, [candidates, search, domainFilter, tierFilter, flaggedOnly, sortBy]);

  const toggleCompare = (sid: string) => {
    setSelectedIds((prev) => (prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]));
  };

  const handleCompare = async () => {
    if (selectedIds.length < 2) {
      toast('Select at least 2 candidates to compare.', 'info');
      return;
    }
    try {
      const res = await api.compareCandidates(selectedIds.slice(0, 4));
      setCompareRows(res.comparisons || []);
      setCompareOpen(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Comparison failed.', 'error');
    }
  };

  const handleSaveDecision = async (newStatus: string) => {
    if (!activeCandidate) return;
    try {
      await api.reviewCandidateSession(activeCandidate.session_id, {
        recruiter_status: newStatus,
        recruiter_notes: reviewNotes,
      });
      toast(`Decision persisted: ${newStatus}`, 'success');
      setActiveCandidate(null);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save review.', 'error');
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.assignAssessment({
        candidate_email: assignEmail.trim(),
        template_id: assignTemplateId || null,
        deadline: assignDeadline || null,
      });
      toast(res.message || 'Assessment assigned.', 'success');
      setAssignOpen(false);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Assignment failed.', 'error');
    }
  };

  const handleExportCsv = async () => {
    try {
      const blob = await api.exportRecruiterCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'smarthire_candidates_export.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast('CSV roster exported.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'CSV export failed.', 'error');
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.saveRecruiterTemplate({
        title: tplTitle.trim(),
        domain: tplDomain,
        level: tplLevel,
        duration_minutes: tplDuration,
        question_count: tplCount,
        target_skills: tplSkills.split(',').map((s) => s.trim()).filter(Boolean),
      });
      toast('Template saved.', 'success');
      setTplTitle('');
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save template.', 'error');
    }
  };

  const handleArchiveTemplate = async (id: string) => {
    try {
      await api.deleteRecruiterTemplate(id);
      toast('Template archived.', 'success');
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to archive template.', 'error');
    }
  };

  return (
    <AppShell
      title="Recruiter Portal"
      subtitle="Authorized & candidate-shared assessment roster, comparisons, and templates."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleCompare}>
            <Scale className="h-3.5 w-3.5" /> Compare ({selectedIds.length})
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="accent" size="sm" onClick={() => setAssignOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Assign
          </Button>
        </div>
      }
    >
          <div className="space-y-8">
            {/* Enterprise Stats Strip */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { label: 'AUTHORIZED EVALUATIONS', val: stats.evaluated_count },
                { label: 'COMPOSITE AVERAGE', val: stats.average_composite ? `${stats.average_composite}/100` : '—' },
                { label: 'SHORTLISTED', val: stats.shortlisted_count },
                { label: 'FLAGGED FOR REVIEW', val: stats.flagged_count },
              ].map((s) => (
                  <div key={s.label} className="rounded-2xl p-6 card-elevated">
                    <div className="font-mono text-xs text-ink-muted">{s.label}</div>
                    <div className="font-display text-3xl font-medium mt-2">{s.val}</div>
                  </div>
          ))}
                </section>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <button
            type="button"
            onClick={() => setTab('roster')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === 'roster' ? 'bg-ink text-canvas' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            Candidate Roster
          </button>
          <button
            type="button"
            onClick={() => setTab('templates')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === 'templates' ? 'bg-ink text-canvas' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            Interview Templates ({templates.length})
          </button>
        </div>

          {tab === 'roster' ? (
                <section className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3.5">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search candidate name or email…"
                      className="h-11 w-full sm:w-72 rounded-xl border border-border bg-surface px-4 text-sm"
                    />
                    <select
                      value={domainFilter}
                      onChange={(e) => setDomainFilter(e.target.value)}
                      className="h-11 rounded-xl border border-border bg-surface px-4 text-sm"
                    >
                      <option value="all">All Domains</option>
                      <option value="Software Engineering">Software Engineering</option>
                      <option value="AI/ML">AI / ML</option>
                      <option value="DevOps & Cloud">DevOps &amp; Cloud</option>
                      <option value="Data Science">Data Science</option>
                    </select>
                    <select
                      value={tierFilter}
                      onChange={(e) => setTierFilter(e.target.value)}
                      className="h-11 rounded-xl border border-border bg-surface px-4 text-sm"
                    >
                      <option value="all">All Score Tiers</option>
                      <option value="Excellent">Excellent</option>
                      <option value="Good">Good</option>
                      <option value="Average">Average</option>
                    </select>
                    <select
                      aria-label="Sort candidates"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'rank' | 'recent')}
                      className="h-11 rounded-xl border border-border bg-surface px-4 text-sm"
                    >
                      <option value="rank">Rank (Top Score First)</option>
                      <option value="recent">Most Recent</option>
                    </select>
                      <label className="inline-flex items-center gap-2 text-sm text-ink-secondary cursor-pointer px-2">
                        <input
                          type="checkbox"
                          checked={flaggedOnly}
                          onChange={(e) => setFlaggedOnly(e.target.checked)}
                          className="h-4 w-4"
                        />
                        Flagged only
                      </label>
                  </div>

                    <div className="rounded-2xl card-elevated overflow-hidden">
                      {loading ? (
                        <div className="p-6 space-y-2">
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="border-b border-border bg-canvas font-mono text-xs text-ink-muted">
                              <tr>
                                <th className="px-4 py-3">Compare</th>
                                <th className="px-4 py-3">Rank</th>
                                <th className="px-4 py-3">Candidate</th>
                                <th className="px-4 py-3">Track</th>
                                <th className="px-4 py-3">Tech</th>
                                <th className="px-4 py-3">Comm</th>
                                <th className="px-4 py-3">Overall</th>
                                <th className="px-4 py-3">Review</th>
                                <th className="px-4 py-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-14 text-center text-ink-muted text-sm">
                                      No shared or assigned candidate sessions yet. Click Assign above to invite a candidate or wait for candidates to share results.
                                    </td>
                                </tr>
                              ) : (
                                filtered.map((c) => (
                                  <tr
                                    key={c.session_id}
                                    className="candidate-row hover:bg-canvas/60 transition-colors cursor-pointer"
                                    onClick={() => {
                                      setActiveCandidate(c);
                                      setReviewNotes(c.recruiter_notes || '');
                                    }}
                                  >
                                      <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="checkbox"
                                          checked={selectedIds.includes(c.session_id)}
                                          onChange={() => toggleCompare(c.session_id)}
                                          aria-label={`Select ${c.candidate_name}`}
                                          className="h-4 w-4"
                                        />
                                      </td>
                                        <td className="px-4 py-4 font-mono text-xs">
                                          {c.rank ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 text-ink">
                                              #{c.rank}
                                              {c.percentile ? <span className="text-ink-muted">({c.percentile}p)</span> : null}
                                            </span>
                                          ) : (
                                            '—'
                                          )}
                                        </td>
                                        <td className="px-5 py-4">
                                          <div className="font-medium text-ink">{c.candidate_name}</div>
                                          <div className="text-xs text-ink-muted">{c.candidate_email}</div>
                                        </td>
                                          <td className="px-5 py-4 text-sm text-ink-secondary">{c.target_role}</td>
                                          <td className="px-5 py-4 font-mono text-sm">{c.scores.technical ?? '—'}</td>
                                          <td className="px-5 py-4 font-mono text-sm">{c.scores.communication ?? '—'}</td>
                                          <td className="px-5 py-4 font-mono text-sm font-semibold">
                                            {c.scores.overall ?? 'Pending'}{' '}
                                            <span className="font-normal text-ink-muted">({c.scores.rating_band})</span>
                                          </td>
                                            <td className="px-5 py-4 font-mono text-xs capitalize">
                                              {c.recruiter_status.replace('_', ' ')}
                                            </td>
                                              <td className="px-5 py-4 text-right">
                                                <Button variant="secondary" size="sm">Review</Button>
                                              </td>
                                            </tr>
                                            ))
                      )}
                                          </tbody>
                                        </table>
                                      </div>
              )}
                                    </div>
                                  </section>
                                ) : (
                              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                  <form onSubmit={handleCreateTemplate} className="lg:col-span-5 rounded-2xl p-7 card-elevated space-y-5">
                                    <h3 className="font-display text-lg font-medium">Create Assessment Template</h3>
                                    <div>
                                      <label className="block text-sm font-medium text-ink-secondary mb-1.5">Template title</label>
                                      <input
                                        type="text"
                                        required
                                        value={tplTitle}
                                        onChange={(e) => setTplTitle(e.target.value)}
                                        placeholder="Senior Backend & Distributed Systems"
                                        className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
                                      />
                                    </div>
                                      <div className="grid grid-cols-2 gap-3.5">
                                        <div>
                                          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Domain</label>
                                          <select
                                            value={tplDomain}
                                            onChange={(e) => setTplDomain(e.target.value)}
                                            className="w-full h-11 rounded-xl border border-border bg-canvas px-3 text-sm"
                                          >
                                            <option value="Software Engineering">Software Engineering</option>
                                            <option value="AI/ML">AI/ML</option>
                                            <option value="DevOps & Cloud">DevOps &amp; Cloud</option>
                                            <option value="Data Science">Data Science</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Level</label>
                                          <select
                                            value={tplLevel}
                                            onChange={(e) => setTplLevel(e.target.value)}
                                            className="w-full h-11 rounded-xl border border-border bg-canvas px-3 text-sm"
                                          >
                                            <option value="Junior">Junior</option>
                                            <option value="Mid-Level">Mid-Level</option>
                                            <option value="Senior">Senior</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="block text-xs font-medium text-ink-secondary mb-1">Duration (m)</label>
                                          <input
                                            type="number"
                                            min={10}
                                            max={60}
                                            value={tplDuration}
                                            onChange={(e) => setTplDuration(Number(e.target.value))}
                                            className="w-full h-9 rounded-lg border border-border bg-canvas px-3 text-sm"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-ink-secondary mb-1">Questions</label>
                                          <input
                                            type="number"
                                            min={2}
                                            max={10}
                                            value={tplCount}
                                            onChange={(e) => setTplCount(Number(e.target.value))}
                                            className="w-full h-9 rounded-lg border border-border bg-canvas px-3 text-sm"
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-ink-secondary mb-1">Target skills</label>
                                        <input
                                          type="text"
                                          value={tplSkills}
                                          onChange={(e) => setTplSkills(e.target.value)}
                                          className="w-full h-9 rounded-lg border border-border bg-canvas px-3 text-sm"
                                        />
                                      </div>
                                      <Button type="submit" variant="accent" className="w-full">Save Template</Button>
                                  </form>

                                  <div className="lg:col-span-7 space-y-3">
                                    {templates.map((t) => (
                                      <div key={t.id} className="rounded-xl border border-border bg-surface p-4 flex items-center justify-between gap-4">
                                        <div>
                                          <div className="font-medium text-sm text-ink">{t.title}</div>
                                          <div className="text-xs text-ink-muted mt-0.5 font-mono">
                                            {t.domain} · {t.level} · {t.duration_minutes}m · {(t.target_skills || []).join(', ')}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleArchiveTemplate(t.id)}
                                          aria-label="Archive template"
                                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-muted hover:text-red-600"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                              </section>
        )}
                            </div>

                            {/* Candidate Review Modal */}
                            <Modal
                              open={Boolean(activeCandidate)}
                              onOpenChange={(open) => !open && setActiveCandidate(null)}
                              title={activeCandidate ? `${activeCandidate.candidate_name} — ${activeCandidate.target_role}` : 'Candidate Dossier'}
                              description="Job-relevant assessment evidence and human review decision."
                              maxWidth="max-w-2xl"
                            >
                              {activeCandidate && (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-4 gap-3 text-center">
                                    {[
                                      { k: 'Technical', v: activeCandidate.scores.technical },
                                      { k: 'Communication', v: activeCandidate.scores.communication },
                                      { k: 'Professionalism', v: activeCandidate.scores.professionalism },
                                      { k: 'Overall', v: activeCandidate.scores.overall },
                                    ].map((m) => (
                                      <div key={m.k} className="rounded-lg border border-border bg-canvas p-3">
                                        <div className="font-mono text-[11px] text-ink-muted">{m.k}</div>
                                        <div className="font-display text-lg font-medium mt-0.5">{m.v ?? '—'}</div>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="text-xs text-ink-secondary rounded-lg border border-border bg-canvas p-3 font-mono">
                                    Answered {activeCandidate.telemetry.answered_count}/{activeCandidate.telemetry.total_questions} ·{' '}
                                    {activeCandidate.telemetry.avg_wpm} WPM · {activeCandidate.telemetry.total_fillers} fillers
                                  </div>

                                  <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-border p-3 text-xs">
                                    {activeCandidate.question_evaluations.length === 0 ? (
                                      <p className="text-ink-muted">No evaluated responses recorded yet.</p>
                                    ) : (
                                      activeCandidate.question_evaluations.map((q) => (
                                        <div key={q.order} className="pb-2 border-b border-border last:border-b-0">
                                          <div className="font-medium text-ink">
                                            Q{q.order}: {q.prompt} ({q.score}/100)
                                          </div>
                                          <p className="text-ink-secondary mt-1">{q.candidate_response}</p>
                                        </div>
                                      ))
                                    )}
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-ink-secondary mb-1">Human Reviewer Notes</label>
                                    <textarea
                                      rows={2}
                                      value={reviewNotes}
                                      onChange={(e) => setReviewNotes(e.target.value)}
                                      placeholder="Record structured hiring committee feedback…"
                                      className="w-full rounded-lg border border-border bg-canvas p-2.5 text-xs"
                                    />
                                  </div>

                                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                                    <Link to={`/dossier?session_id=${encodeURIComponent(activeCandidate.session_id)}`}>
                                      <Button variant="secondary" size="sm">Open PDF Dossier</Button>
                                    </Link>
                                    <div className="flex gap-2">
                                      <Button variant="ghost" size="sm" onClick={() => handleSaveDecision('rejected')} className="text-red-600">
                                        Reject
                                      </Button>
                                      <Button variant="secondary" size="sm" onClick={() => handleSaveDecision('flagged_for_review')}>
                                        Flag
                                      </Button>
                                      <Button variant="accent" size="sm" onClick={() => handleSaveDecision('shortlisted')}>
                                        Shortlist
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Modal>

                            {/* Assign Modal */}
                            <Modal open={assignOpen} onOpenChange={setAssignOpen} title="Assign Assessment">
                                <form onSubmit={handleAssign} className="space-y-4">
                                  <div>
                                    <label className="block text-sm font-medium text-ink-secondary mb-1.5">Candidate email</label>
                                    <input
                                      type="email"
                                      required
                                      value={assignEmail}
                                      onChange={(e) => setAssignEmail(e.target.value)}
                                      placeholder="candidate@company.com"
                                      className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-ink-secondary mb-1.5">Template</label>
                                    <select
                                      value={assignTemplateId}
                                      onChange={(e) => setAssignTemplateId(e.target.value)}
                                      className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
                                    >
                                      <option value="">Default Software Engineering</option>
                                      {templates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.title} ({t.domain})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-ink-secondary mb-1.5">Deadline (optional)</label>
                                    <input
                                      type="datetime-local"
                                      value={assignDeadline}
                                      onChange={(e) => setAssignDeadline(e.target.value)}
                                      className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
                                    />
                                  </div>
                                  <Button type="submit" variant="accent" size="lg" className="w-full">Assign Interview</Button>
                                </form>
                            </Modal>

                            {/* Compare Modal (emphasizes job-relevant evidence over webcam confidence) */}
                            <Modal
                              open={compareOpen}
                              onOpenChange={setCompareOpen}
                              title="Side-by-Side Evidence Comparison"
                              description="Compares job-relevant technical, communication, and professionalism scores."
                              maxWidth="max-w-3xl"
                            >
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                  <thead className="border-b border-border font-mono text-ink-muted">
                                    <tr>
                                      <th className="py-2 pr-4">Candidate</th>
                                      <th className="py-2 pr-4">Domain</th>
                                      <th className="py-2 pr-4">Overall</th>
                                      <th className="py-2 pr-4">Technical</th>
                                      <th className="py-2 pr-4">Communication</th>
                                      <th className="py-2 pr-4">Professionalism</th>
                                      <th className="py-2">Review Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {compareRows.map((r) => (
                                      <tr key={r.session_id}>
                                        <td className="py-2.5 pr-4 font-medium text-ink">{r.candidate_name}</td>
                                        <td className="py-2.5 pr-4 text-ink-secondary">{r.domain}</td>
                                        <td className="py-2.5 pr-4 font-mono font-semibold">
                                          {r.overall_score ?? '—'} ({r.rating_band})
                                        </td>
                                        <td className="py-2.5 pr-4 font-mono">{r.technical_relevance_score ?? '—'}</td>
                                        <td className="py-2.5 pr-4 font-mono">{r.communication_score ?? '—'}</td>
                                        <td className="py-2.5 pr-4 font-mono">{r.professionalism_score ?? '—'}</td>
                                        <td className="py-2.5 font-mono capitalize">{r.recruiter_status.replace('_', ' ')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </Modal>
                          </AppShell>
                          );
}
