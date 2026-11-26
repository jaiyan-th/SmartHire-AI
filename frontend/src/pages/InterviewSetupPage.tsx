import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, Mic, Plus, VideoOff } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Primitives';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import { SPRING_SNAPPY, wizardStepVariants } from '@/motion/system';

const DOMAINS = [
  'Software Engineering',
  'AI/ML',
  'Data Science',
  'DevOps & Cloud',
  'Product Management',
];

const CATEGORIES = [
  { id: 'Technical', label: 'Technical & Coding', desc: 'Architecture, algorithms, and applied engineering.' },
  { id: 'Behavioral', label: 'Behavioral (STAR)', desc: 'Situation, Task, Action, and measurable Result.' },
  { id: 'HR', label: 'HR & Culture Fit', desc: 'Career trajectory, motivation, and collaboration.' },
  { id: 'Aptitude', label: 'Quantitative Aptitude', desc: 'Reliability math, scaling, and analytical reasoning.' },
];

export default function InterviewSetupPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const [domain, setDomain] = useState('Software Engineering');
  const [isCustomDomain, setIsCustomDomain] = useState(false);
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [category, setCategory] = useState(searchParams.get('category') || 'Technical');
  const [difficulty, setDifficulty] = useState('Mid-Level');
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [questionCount, setQuestionCount] = useState(5);
  const [focusSkills, setFocusSkills] = useState(searchParams.get('skills') || '');
  const [recordingConsent, setRecordingConsent] = useState(true);
  const [cameraConsent, setCameraConsent] = useState(true);

  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [mediaDenied, setMediaDenied] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [starting, setStarting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  // Pre-fill focus skills from the user's real resume gaps if available
  useEffect(() => {
    if (searchParams.get('skills')) return;
    api
      .getResumeHistory()
      .then((resumes) => {
        if (resumes.length > 0 && resumes[0].missing_skills?.length > 0) {
          setFocusSkills(resumes[0].missing_skills.slice(0, 4).join(', '));
        }
      })
      .catch(() => {});
  }, [searchParams]);

  const stopMedia = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
  };

  useEffect(() => {
    if (step !== 2) {
      stopMedia();
      return;
    }

    let mounted = true;
    const initDevices = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('MediaDevices unavailable');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraConsent,
          audio: true,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMediaDenied(false);
        setMicReady(stream.getAudioTracks().length > 0);
        const hasVid = cameraConsent && stream.getVideoTracks().length > 0;
        setCameraReady(hasVid);
        if (videoRef.current && hasVid) {
          videoRef.current.srcObject = stream;
        }

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx && stream.getAudioTracks().length > 0) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (!mounted) return;
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setMicLevel(Math.min(100, Math.round((avg / 96) * 100)));
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
      } catch {
        if (!mounted) return;
        setMediaDenied(true);
        setCameraReady(false);
        setMicReady(false);
      }
    };

    initDevices();
    return () => {
      mounted = false;
      stopMedia();
    };
  }, [step, cameraConsent]);

  const goStep = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const handleLaunch = async () => {
    if (!recordingConsent) {
      toast('Please confirm assessment and speech processing consent.', 'error');
      return;
    }
    setStarting(true);
    try {
      const res = await api.startInterview({
        domain,
        category,
        difficulty,
        duration_minutes: durationMinutes,
        question_count: questionCount,
        focus_skills: focusSkills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        camera_enabled: cameraConsent && cameraReady,
        recording_consent: recordingConsent,
      });
      stopMedia();
      sessionStorage.setItem('active_interview_session_id', res.session_id);
      toast('Interview studio initialized.', 'success');
      navigate(`/interview/room/${res.session_id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to start session.', 'error');
      setStarting(false);
    }
  };

  const stepsMeta = ['Track & Format', 'Parameters', 'Device Check & Consent'];

  return (
    <AppShell
      title="Interview Configuration"
      subtitle="Select your track, customize session length, and verify audio/camera hardware."
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Progress Indicator */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between text-sm font-mono">
            {stepsMeta.map((label, idx) => (
              <button
                key={label}
                type="button"
                onClick={() => goStep(idx)}
                className={`flex items-center gap-2.5 transition-colors ${
                  idx === step ? 'text-ink font-medium' : idx < step ? 'text-ink-secondary' : 'text-ink-muted'
                }`}
              >
                <span
                  className={`h-6 w-6 rounded-full inline-flex items-center justify-center text-xs border ${
                    idx <= step
                      ? 'bg-[#C9F45B] text-[#111111] border-[#111111]/15 font-semibold'
                      : 'border-border bg-surface text-ink-muted'
                  }`}
                >
                  {idx < step ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
            <motion.div
              className="h-full bg-ink dark:bg-[#C9F45B]"
              animate={{ width: `${((step + 1) / stepsMeta.length) * 100}%` }}
              transition={SPRING_SNAPPY}
            />
          </div>
        </div>

        {/* Wizard Card */}
        <div className="rounded-2xl p-7 sm:p-10 card-elevated overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            {step === 0 && (
              <motion.div
                key="step-0"
                custom={direction}
                variants={wizardStepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-8"
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <label className="block font-mono text-xs uppercase tracking-wider text-ink-muted">
                      1. Select Discipline or Target Role
                    </label>
                    {isCustomDomain && (
                      <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-md bg-[#C9F45B] text-[#111111] font-medium">
                        CUSTOM TARGET
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {DOMAINS.map((d) => {
                      const active = !isCustomDomain && domain === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setIsCustomDomain(false);
                            setDomain(d);
                          }}
                          className={`relative rounded-xl border px-5 py-4 text-left text-base font-medium transition-colors ${
                            active ? 'text-ink border-ink' : 'border-border text-ink-secondary hover:text-ink'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="wizard-domain-pill"
                              transition={SPRING_SNAPPY}
                              className="absolute inset-0 rounded-xl bg-surface-2 border border-ink"
                            />
                          )}
                          <span className="relative z-10">{d}</span>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      data-testid="custom-domain-toggle"
                      onClick={() => {
                        setIsCustomDomain(true);
                        if (customDomainInput.trim()) {
                          setDomain(customDomainInput.trim());
                        }
                      }}
                      className={`relative rounded-xl border px-5 py-4 text-left text-base font-medium transition-colors ${
                        isCustomDomain
                          ? 'text-ink border-ink'
                          : 'border-dashed border-border text-ink-secondary hover:text-ink hover:border-[var(--border-strong)]'
                      }`}
                    >
                      {isCustomDomain && (
                        <motion.span
                          layoutId="wizard-domain-pill"
                          transition={SPRING_SNAPPY}
                          className="absolute inset-0 rounded-xl bg-surface-2 border border-ink"
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2">
                        <Plus className="h-4 w-4 shrink-0" />
                        <span>{isCustomDomain && customDomainInput.trim() ? customDomainInput.trim() : 'Add Targeted Role'}</span>
                      </span>
                    </button>
                  </div>

                  {isCustomDomain && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-xl border border-border bg-canvas p-4 space-y-2.5"
                    >
                      <label htmlFor="custom-domain-input" className="block text-sm font-medium text-ink">
                        Enter your custom targeted role or domain
                      </label>
                      <input
                        id="custom-domain-input"
                        data-testid="custom-domain-input"
                        type="text"
                        autoFocus
                        value={customDomainInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomDomainInput(val);
                          if (val.trim()) setDomain(val.trim());
                        }}
                        placeholder="e.g. Cybersecurity Engineer, Frontend React Architect, Embedded Systems"
                        className="w-full h-11 rounded-xl border border-border bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
                      />
                      <p className="text-xs text-ink-muted">
                        Questions and skill weighting will automatically adapt to your targeted role.
                      </p>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-3.5">
                  <label className="block font-mono text-xs uppercase tracking-wider text-ink-muted">
                    2. Interview Format
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {CATEGORIES.map((c) => {
                      const active = category === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategory(c.id)}
                          className={`relative rounded-xl border p-5 text-left transition-colors ${
                            active ? 'border-ink' : 'border-border hover:border-[var(--border-strong)]'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="wizard-cat-card"
                              transition={SPRING_SNAPPY}
                              className="absolute inset-0 rounded-xl bg-surface-2 border border-ink"
                            />
                          )}
                          <div className="relative z-10">
                            <div className="flex items-center justify-between">
                              <span className="text-base font-medium text-ink">{c.label}</span>
                              {active && <span className="h-2.5 w-2.5 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/20" />}
                            </div>
                            <p className="text-sm text-ink-secondary mt-1.5">{c.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step-1"
                custom={direction}
                variants={wizardStepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-7"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-ink-secondary mb-2">Seniority Level</label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      className="w-full h-11 rounded-xl border border-border bg-canvas px-3.5 text-sm"
                    >
                      <option value="Junior">Junior (0–2 yrs)</option>
                      <option value="Mid-Level">Mid-Level (2–5 yrs)</option>
                      <option value="Senior">Senior / Architect (5+ yrs)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink-secondary mb-2">Duration</label>
                    <select
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="w-full h-11 rounded-xl border border-border bg-canvas px-3.5 text-sm"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={20}>20 minutes</option>
                      <option value={30}>30 minutes</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink-secondary mb-2">Questions</label>
                    <select
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className="w-full h-11 rounded-xl border border-border bg-canvas px-3.5 text-sm"
                    >
                      <option value={3}>3 questions</option>
                      <option value={5}>5 questions</option>
                      <option value={7}>7 questions</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="focus-skills" className="block text-sm font-medium text-ink-secondary mb-2">
                    Focus Skills (optional, comma-separated)
                  </label>
                  <input
                    id="focus-skills"
                    type="text"
                    value={focusSkills}
                    onChange={(e) => setFocusSkills(e.target.value)}
                    placeholder="e.g. Distributed Systems, PostgreSQL, Docker"
                    className="w-full h-11 rounded-xl border border-border bg-canvas px-4 text-sm"
                  />
                  <p className="text-xs text-ink-muted mt-2">
                    Auto-populated from your latest resume skill gaps when available.
                  </p>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                custom={direction}
                variants={wizardStepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start"
              >
                <div className="md:col-span-6 space-y-4">
                  <div className="aspect-video rounded-xl bg-[#090909] border border-border overflow-hidden relative flex items-center justify-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${cameraReady ? 'block' : 'hidden'}`}
                    />
                    {!cameraReady && (
                      <div className="text-center p-6 text-[#A1A1A1]">
                        <VideoOff className="h-7 w-7 mx-auto mb-2" />
                        <p className="text-sm font-medium text-[#F5F5F5]">Camera Standby / Optional</p>
                        <p className="text-xs mt-1">Zero score penalty when camera is disabled.</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-canvas p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-medium text-ink">
                        <Mic className="h-4 w-4" /> Live Microphone Level
                      </span>
                      <span className="font-mono text-ink-muted">
                        {micReady ? 'Active' : 'Keyboard / Text Fallback'}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-surface-2 overflow-hidden">
                      <div
                        className="h-full bg-[#C9F45B] transition-all duration-75"
                        style={{ width: `${Math.max(4, micLevel)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-6 space-y-5">
                  {mediaDenied && (
                    <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Camera or microphone permission unavailable. Text and code modes remain fully functional.
                      </span>
                    </div>
                  )}

                  <div className="rounded-xl border border-border bg-canvas p-5 space-y-2">
                    <div className="font-mono text-xs text-ink-muted uppercase">Session Summary</div>
                    <div className="text-base font-medium text-ink">
                      {domain} · {category} ({difficulty})
                    </div>
                    <div className="text-sm text-ink-secondary">
                      {questionCount} questions · {durationMinutes} minutes
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-canvas p-5 space-y-3.5 text-sm">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={recordingConsent}
                        onChange={(e) => setRecordingConsent(e.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-ink-secondary">
                        I consent to speech transcription and deterministic evaluation of my submitted responses.
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cameraConsent}
                        onChange={(e) => setCameraConsent(e.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-ink-secondary">
                        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                          <Camera className="h-3.5 w-3.5" /> Optional local webcam preview
                        </span>{' '}
                        (frames stay local in your browser; disabling never penalizes scores).
                      </span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-10 pt-6 border-t border-border flex items-center justify-between">
            <Button variant="ghost" size="md" disabled={step === 0} onClick={() => goStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" /> Previous
            </Button>

            {step < 2 ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  if (step === 0 && isCustomDomain && !customDomainInput.trim()) {
                    toast('Please enter your custom targeted role or choose a preset discipline.', 'error');
                    return;
                  }
                  goStep(step + 1);
                }}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="accent"
                size="lg"
                data-testid="start-interview-btn"
                loading={starting}
                onClick={handleLaunch}
              >
                Enter Interview Studio <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
