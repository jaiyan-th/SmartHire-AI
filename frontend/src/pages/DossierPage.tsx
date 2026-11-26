import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button, Skeleton } from '@/components/ui/Primitives';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import type { Evaluation } from '@/lib/types';

export default function DossierPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .getLatestEvaluation(sessionId)
      .then(async (res) => {
        if (!res || res.has_data === false) {
          setEv(null);
          return;
        }
        setEv(res);
        const sid = res.session || sessionId;
        if (sid && res.verification_digest) {
          try {
            const ver = await api.verifyDossier(sid, res.verification_digest);
            setVerified(ver.verified);
          } catch {
            setVerified(null);
          }
        }
      })
      .catch((err) => toast(err instanceof Error ? err.message : 'Unable to load dossier.', 'error'))
      .finally(() => setLoading(false));
  }, [sessionId, toast]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const blob = await api.downloadPdfReport(ev?.session || sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SmartHire_Dossier_${String(ev?.session || 'CERT').slice(0, 8).toUpperCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast('ReportLab PDF dossier downloaded.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'PDF generation failed.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppShell
      title="Certified Assessment Dossier"
      subtitle="Tamper-resistant candidate evaluation record."
      actions={
        <div className="flex items-center gap-2 no-print">
          <Link to="/insights">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" /> Insights
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          {ev && (
            <Button variant="accent" size="sm" loading={downloading} onClick={handleDownloadPdf}>
              <Download className="h-3.5 w-3.5" /> Official PDF
            </Button>
          )}
        </div>
      }
    >
      {loading ? (
        <Skeleton className="h-96 max-w-4xl mx-auto" />
      ) : !ev ? (
        <div className="max-w-lg mx-auto rounded-xl border border-border bg-surface p-10 text-center space-y-4">
          <h2 className="font-display text-xl font-medium">No Evaluation Found</h2>
          <p className="text-sm text-ink-secondary">
            Complete an interview assessment first to generate a certified dossier.
          </p>
          <Link to="/interview/setup">
            <Button variant="accent">Start Mock Interview</Button>
          </Link>
        </div>
      ) : (
        <article
          id="dossier-paper"
          className="max-w-5xl mx-auto rounded-2xl border border-border bg-white text-[#111111] p-9 sm:p-14 shadow-sm space-y-8"
        >
          <header className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b-2 border-[#111111]">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-[#646464]">
                OFFICIAL EVALUATION RECORD
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-medium mt-1">smarthire. Dossier</h2>
              <p className="text-sm text-[#646464] mt-1">
                Deterministic 4-Pillar Assessment Certificate
              </p>
            </div>

            <div className="text-right font-mono text-xs space-y-1.5">
              <div className="font-semibold">
                ID: SH-{String(ev.session || sessionId || 'CERT').slice(0, 8).toUpperCase()}
              </div>
              {ev.verification_digest && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F7F7F5] border border-[#E6E6E3]">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                  <span>
                    DIGEST: {ev.verification_digest} {verified ? '✓' : ''}
                  </span>
                </div>
              )}
            </div>
          </header>

          <section className="grid grid-cols-2 sm:grid-cols-4 gap-5 border border-[#E6E6E3] rounded-xl p-5 bg-[#F7F7F5] text-sm">
            <div>
              <div className="text-xs text-[#646464]">Candidate</div>
              <div className="font-medium mt-1">{ev.candidate_name || user?.full_name || 'Candidate'}</div>
            </div>
            <div>
              <div className="text-xs text-[#646464]">Discipline</div>
              <div className="font-medium mt-1">
                {ev.session_domain} ({ev.session_difficulty})
              </div>
            </div>
            <div>
              <div className="text-xs text-[#646464]">Date</div>
              <div className="font-medium mt-1">{ev.session_date}</div>
            </div>
            <div>
              <div className="text-xs text-[#646464]">Composite Score</div>
              <div className="font-mono font-semibold mt-1">
                {ev.overall_score} / 100 ({ev.rating_band})
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-display text-lg font-medium">4-Pillar Score Breakdown</h3>
            <table className="w-full text-left text-sm border border-[#E6E6E3]">
              <thead className="bg-[#F7F7F5] border-b border-[#E6E6E3] font-mono">
                <tr>
                  <th className="p-3">Evaluation Pillar</th>
                  <th className="p-3">Weight</th>
                  <th className="p-3">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E6E3]">
                <tr>
                  <td className="p-3 font-medium">Technical Relevance</td>
                  <td className="p-3 font-mono">30%</td>
                  <td className="p-3 font-mono font-semibold">{ev.technical_relevance_score} / 100</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Verbal Communication</td>
                  <td className="p-3 font-mono">30%</td>
                  <td className="p-3 font-mono font-semibold">{ev.communication_score} / 100</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Confidence &amp; Engagement</td>
                  <td className="p-3 font-mono">25%</td>
                  <td className="p-3 font-mono font-semibold">{ev.confidence_score} / 100</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Professionalism &amp; Structure</td>
                  <td className="p-3 font-mono">15%</td>
                  <td className="p-3 font-mono font-semibold">{ev.professionalism_score} / 100</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-2">
              <h4 className="font-mono uppercase text-[#646464]">Demonstrated Strengths</h4>
              <ul className="list-disc pl-4 space-y-1 text-[#111111]">
                {(ev.strengths || []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-mono uppercase text-[#646464]">Actionable Recommendations</h4>
              <ul className="list-disc pl-4 space-y-1 text-[#111111]">
                {[...(ev.weaknesses || []), ...(ev.improvement_suggestions || [])].map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-display text-base font-medium">Question-by-Question Log</h3>
            <div className="space-y-3">
              {(ev.question_evaluations || []).map((q) => (
                <div key={q.order} className="rounded-lg border border-[#E6E6E3] p-4 text-xs space-y-1.5">
                  <div className="font-medium">
                    Q{q.order}: {q.prompt} <span className="font-mono text-[#646464]">({q.score}/100)</span>
                  </div>
                  <div className="text-[#646464]">Response: {q.candidate_response}</div>
                  <div>Critique: {q.critique}</div>
                </div>
              ))}
            </div>
          </section>

          <footer className="pt-6 border-t border-dashed border-[#CECEC9] text-[11px] text-[#646464]">
            AI-assisted evaluation results support preparation and structured human review and are not standalone guarantees of employability.
          </footer>
        </article>
      )}
    </AppShell>
  );
}
