import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Trash2, UploadCloud } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button, Skeleton } from '@/components/ui/Primitives';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import type { ResumeRecord } from '@/lib/types';
import { MOTION_EASE, SPRING_SNAPPY } from '@/motion/system';

export default function ResumePage() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [rawText, setRawText] = useState('');
  const [targetRole, setTargetRole] = useState('Full Stack Software Engineer (Python / React)');
  const [jobDescription, setJobDescription] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [stageLabel, setStageLabel] = useState('');
  const [activeResume, setActiveResume] = useState<ResumeRecord | null>(null);
  const [editableNotes, setEditableNotes] = useState('');
  const [history, setHistory] = useState<ResumeRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const list = await api.getResumeHistory();
      setHistory(list);
      if (list.length > 0) {
        setActiveResume((prev) => prev ?? list[0]);
      }
    } catch {
      toast('Unable to load resume history.', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  const handleFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast('File exceeds 10 MB size limit.', 'error');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
      if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
        file.text().then((txt) => setRawText(txt.slice(0, 12000))).catch(() => { });
      }
    }
    toast(`Selected ${file.name}`, 'info');
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile && !rawText.trim()) {
      toast('Upload a .pdf/.docx/.txt resume or paste resume text.', 'error');
      return;
    }

    setAnalyzing(true);
    setStageLabel('Validating file & extracting text…');
    try {
      const fd = new FormData();
      if (selectedFile) fd.append('resume', selectedFile);
      if (rawText.trim()) fd.append('raw_text', rawText.trim());
      fd.append('target_role', targetRole.trim());
      fd.append('job_description', jobDescription.trim());

      setStageLabel('Computing ATS alignment & skill gaps…');
      const res = await api.analyzeResume(fd);
      setActiveResume(res.data);
      toast('Resume analysis completed.', 'success');
      loadHistory();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Resume parsing failed.', 'error');
    } finally {
      setAnalyzing(false);
      setStageLabel('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this resume version permanently?')) return;
    try {
      await api.deleteResume(id);
      if (activeResume?.id === id) setActiveResume(null);
      toast('Resume deleted.', 'success');
      loadHistory();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const allExtracted = activeResume
    ? Object.values(activeResume.skills_extracted || {}).flat()
    : [];

  return (
    <AppShell
      title="Resume Intelligence"
      subtitle="Signature-verified PDF/DOCX extraction, ATS benchmarking, and gap-targeted interview setup."
    >
      <div className="space-y-8">
        {/* Split-Screen Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Upload + Live File Preview */}
            <form onSubmit={handleAnalyze} className="lg:col-span-6 rounded-2xl p-7 card-elevated space-y-5">
              <motion.div
                animate={{
                  borderColor: dragOver ? '#C9F45B' : 'var(--border-subtle)',
                  backgroundColor: dragOver ? 'var(--bg-surface-2)' : 'var(--bg-canvas)',
                }}
                transition={{ duration: 0.18 }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <motion.div animate={{ y: dragOver ? -4 : 0 }} transition={SPRING_SNAPPY}>
                  <UploadCloud className="h-9 w-9 mx-auto text-ink-secondary mb-3" />
                </motion.div>
                  <p className="text-base font-medium text-ink">
                    {dragOver ? 'Drop your resume to load' : 'Drag & drop PDF, DOCX, or TXT'}
                  </p>
                    <p className="text-sm text-ink-muted mt-1">
                      {selectedFile
                        ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                        : 'Magic-byte verified · Up to 10 MB'}
                    </p>
                  </motion.div>

                  {/* Live PDF Preview */}
                  {previewUrl && (
                    <div className="rounded-xl border border-border overflow-hidden bg-canvas">
                        <div className="px-4 py-2.5 border-b border-border text-xs font-mono text-ink-muted">
                          PDF DOCUMENT PREVIEW
                        </div>
                        <iframe src={previewUrl} title="Uploaded Resume PDF" className="w-full h-80 bg-white" />
                      </div>
            )}

                      <div>
                          <label htmlFor="resume-raw-text-input" className="block text-sm font-medium text-ink-secondary mb-1.5">
                            Or paste resume text directly
                          </label>
                          <textarea
                            id="resume-raw-text-input"
                            rows={4}
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
                            placeholder="Skills, education, work experience, projects…"
                            className="w-full rounded-xl border border-border bg-canvas p-3.5 text-sm focus:border-ink focus:outline-none"
                          />
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Target Job Role</label>
                          <input
                            type="text"
                            value={targetRole}
                            onChange={(e) => setTargetRole(e.target.value)}
                            className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
                          />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-ink-secondary mb-1.5">
                              Job Description (Optional)
                            </label>
                            <textarea
                              rows={3}
                              value={jobDescription}
                              onChange={(e) => setJobDescription(e.target.value)}
                              placeholder="Paste target job requirements for customized ATS matching…"
                              className="w-full rounded-xl border border-border bg-canvas p-3.5 text-sm"
                            />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        data-testid="analyze-resume-btn"
                        variant="accent"
                        size="lg"
                        loading={analyzing}
                        className="w-full"
                      >
                        {analyzing ? stageLabel : 'Analyze Resume & Compute ATS Match'}
                      </Button>
                    </form>

          {/* Right: Structured Extraction & Gap Results */}
                    <div className="lg:col-span-6 rounded-2xl p-7 card-elevated space-y-6">
                      {!activeResume ? (
                            <div className="py-20 text-center space-y-3">
                              <FileText className="h-9 w-9 mx-auto text-ink-muted" />
                              <p className="text-base font-medium text-ink">No resume selected</p>
                              <p className="text-sm text-ink-secondary max-w-sm mx-auto">
                                Upload or paste a resume on the left to inspect extracted skills, ATS match score, and missing competencies.
                              </p>
                            </div>
                            ) : (
                            <motion.div
                              key={activeResume.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.28, ease: MOTION_EASE }}
                              className="space-y-6"
                            >
                              <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                                <div className="min-w-0">
                                  <span className="font-mono text-[11px] uppercase text-ink-muted">VERIFIED EXTRACTION</span>
                                  <h3 className="font-display text-xl font-medium truncate mt-1" id="ats-result-filename">
                                    {activeResume.file_name}
                                  </h3>
                                  <p className="text-xs text-ink-secondary">{activeResume.target_role}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-display text-3xl font-medium">{activeResume.ats_score}%</div>
                                  <span className="font-mono text-[10px] text-ink-muted">ATS MATCH</span>
                                </div>
                              </div>

                              <p className="text-sm text-ink-secondary leading-relaxed rounded-lg border border-border bg-canvas p-3.5">
                                {activeResume.executive_summary}
                              </p>

                              <div className="space-y-2">
                                <div className="font-mono text-xs text-ink-muted">EXTRACTED SKILLS ({allExtracted.length})</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {allExtracted.length > 0 ? (
                                    allExtracted.map((skill) => (
                                      <span
                                        key={skill}
                                        className="rounded-md border border-border bg-canvas px-2.5 py-1 text-xs font-medium text-ink"
                                      >
                                        {skill}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-ink-muted">No standard taxonomy keywords matched.</span>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="font-mono text-xs text-ink-muted">PRIORITY GAPS</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {activeResume.missing_skills.length > 0 ? (
                                    activeResume.missing_skills.map((skill) => (
                                      <span
                                        key={skill}
                                        className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200"
                                      >
                                        + {skill}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-emerald-600">All benchmark skills covered.</span>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                <div className="rounded-lg border border-border bg-canvas p-3.5 space-y-1.5">
                                  <div className="font-mono text-ink-muted">EXPERIENCE</div>
                                  {activeResume.experience.length > 0 ? (
                                    <ul className="list-disc pl-4 space-y-1 text-ink-secondary">
                                      {activeResume.experience.map((e, i) => (
                                        <li key={i}>{e.detail || e.role}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-ink-muted">No explicit Experience lines parsed.</p>
                                  )}
                                </div>
                                <div className="rounded-lg border border-border bg-canvas p-3.5 space-y-1.5">
                                  <div className="font-mono text-ink-muted">EDUCATION</div>
                                  {activeResume.education.length > 0 ? (
                                    <ul className="list-disc pl-4 space-y-1 text-ink-secondary">
                                      {activeResume.education.map((e, i) => (
                                        <li key={i}>{e.detail || e.degree}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-ink-muted">No explicit Education lines parsed.</p>
                                  )}
                                </div>
                              </div>

                              <div>
                                <label className="block font-mono text-[11px] text-ink-muted mb-1">
                                  CANDIDATE VERIFICATION NOTES (CORRECT OR ADD CONTEXT)
                                </label>
                                <textarea
                                  rows={2}
                                  value={editableNotes}
                                  onChange={(e) => setEditableNotes(e.target.value)}
                                  placeholder="Add missing projects or skills you want to emphasize during your mock interview…"
                                  className="w-full rounded-lg border border-border bg-canvas p-2.5 text-xs"
                                />
                              </div>

                              <Button
                                variant="accent"
                                size="lg"
                                className="w-full"
                                onClick={() =>
                                  navigate(
                                    `/interview/setup?skills=${encodeURIComponent(
                                      [...activeResume.missing_skills.slice(0, 4), editableNotes].filter(Boolean).join(', ')
                                    )}`
                                  )
                                }
                              >
                                Launch Targeted Interview from Gaps <ArrowRight className="h-4 w-4" />
                              </Button>
                            </motion.div>
            )}
                        </div>
        </div>

          {/* Saved Resume Versions */}
          <section className="rounded-2xl overflow-hidden card-elevated">
            <div className="px-7 py-5 border-b border-border flex items-center justify-between">
              <h3 className="font-display text-lg font-medium">Saved Resume Versions</h3>
              <span className="font-mono text-xs text-ink-muted">{history.length} archived</span>
            </div>
            {loadingHistory ? (
              <div className="p-7">
                <Skeleton className="h-12 w-full" />
              </div>
            ) : history.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-muted">No saved resumes yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs font-mono text-ink-muted bg-canvas">
                    <tr>
                      <th className="px-7 py-3.5 font-medium">Filename</th>
                      <th className="px-4 py-3.5 font-medium">Target Role</th>
                      <th className="px-4 py-3.5 font-medium">ATS Match</th>
                      <th className="px-4 py-3.5 font-medium">Uploaded</th>
                      <th className="px-7 py-3.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((r) => (
                      <tr key={r.id} className="hover:bg-canvas/50 transition-colors">
                        <td className="px-7 py-4 font-medium text-ink">{r.file_name}</td>
                        <td className="px-4 py-4 text-ink-secondary">{r.target_role}</td>
                        <td className="px-4 py-4 font-mono font-semibold">{r.ats_score}%</td>
                        <td className="px-4 py-4 font-mono text-xs text-ink-muted">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-7 py-4 text-right space-x-2">
                          <Button variant="secondary" size="sm" onClick={() => setActiveResume(r)}>
                            Inspect
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r.id)}
                            aria-label="Delete resume"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
                  </div>
                </AppShell>
                );
}
