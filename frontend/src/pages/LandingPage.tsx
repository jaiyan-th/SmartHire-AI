import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  Code2,
  FileText,
  Menu,
  Mic,
  Moon,
  ShieldCheck,
  Sun,
  Target,
  X,
} from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/Primitives';
import StudioAIOrb, { type OrbState } from '@/components/visuals/StudioAIOrb';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { MOTION_EASE, SPRING_SNAPPY, lineMaskVariants, riseVariants } from '@/motion/system';

gsap.registerPlugin(ScrollTrigger);

const HeroIntelligenceSphere = lazy(() => import('@/components/visuals/HeroIntelligenceSphere'));

const WORKFLOW_STAGES = [
  {
    id: 'resume',
    num: '01',
    title: 'Resume Intelligence',
    subtitle: 'Parse verified skills and role gaps before your first prompt.',
    detail:
      'Upload PDF, DOCX, or plain text. SmartHire validates file signatures, extracts verified skills across engineering taxonomies, and maps missing competencies directly into your interview drill plan.',
    tag: 'STAGE 01 · ATS PARSER',
    headline: 'Signature-verified extraction & role alignment',
    items: [
      'Magic-byte validation for .pdf, .docx, and .txt up to 10 MB',
      'Maps missing job description keywords straight into targeted question prompts',
    ],
  },
  {
    id: 'interview',
    num: '02',
    title: 'Interview Studio',
    subtitle: 'A calm, responsive space for deliberate spoken and code practice.',
    detail:
      'Practice Technical, Behavioral (STAR), HR, and Quantitative Aptitude interviews with live Web Speech transcription, real-time cadence & filler telemetry, optional camera framing, and a built-in code editor.',
    tag: 'STAGE 02 · LIVE STUDIO',
    headline: 'Adaptive voice & code room with real-time telemetry',
    items: [
      'Live speaking cadence (WPM), word structure, and filler tracking',
      'Camera-optional equity — zero score penalty if camera is disabled',
    ],
  },
  {
    id: 'assessment',
    num: '03',
    title: 'Deterministic Assessment',
    subtitle: 'Transparent 4-pillar scoring backed by verifiable evidence.',
    detail:
      'Every completed session runs through a reproducible weighted formula: Communication (30%), Technical Relevance (30%), Confidence (25%), and Professionalism (15%), paired with tamper-evident PDF dossiers.',
    tag: 'STAGE 03 · 4-PILLAR RUBRIC',
    headline: 'Composite = 0.30C + 0.30T + 0.25F + 0.15P',
    items: [
      'Question-by-question critique paired with reference model answers',
      'HMAC-SHA256 verification digest on downloadable ReportLab dossiers',
    ],
  },
  {
    id: 'growth',
    num: '04',
    title: 'Growth Journey',
    subtitle: 'Turn weak spots into structured weekly remediation milestones.',
    detail:
      'Evaluation insights automatically generate a role-adapted 4-week roadmap with persisted task checkpoints, skill mastery benchmarks, and direct links back to targeted studio drills.',
    tag: 'STAGE 04 · GROWTH ROADMAP',
    headline: '4-week curriculum adapted to your target discipline',
    items: [
      'Competency mastery bars tracking current coverage vs role target',
      'Persisted milestone checklists synchronized across sessions',
    ],
  },
];

function StageVisualPreview({ stageId }: { stageId: string }) {
  if (stageId === 'resume') {
    return (
      <div className="rounded-xl border border-border bg-canvas p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5 text-sm font-medium text-ink">
            <FileText className="h-4 w-4 text-ink-secondary" />
            <span>Magic-Byte Verified Extractor</span>
          </div>
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-md bg-[#C9F45B] text-[#111111] font-medium">
            PDF / DOCX / TXT
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {['Taxonomy Parse', 'ATS Alignment', 'Gap Detection', 'Drill Routing'].map((step, i) => (
            <div key={step} className="rounded-lg border border-border bg-surface p-3">
              <div className="font-mono text-[10px] text-ink-muted">0{i + 1}</div>
              <div className="text-xs font-medium text-ink mt-1">{step}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (stageId === 'interview') {
    return (
      <div className="rounded-xl border border-[#242424] bg-[#0B0B0B] text-[#F5F5F4] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#A3A3A0]">
            <span className="h-2 w-2 rounded-full bg-[#C9F45B]" />
            <span>LIVE TELEMETRY STREAM</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#242424] bg-[#141414] px-2.5 py-1 text-[11px] font-mono">
            <Mic className="h-3 w-3 text-[#C9F45B]" /> Speech + <Code2 className="h-3 w-3" /> Code
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-14 px-2">
          {[32, 58, 84, 46, 92, 68, 76, 42, 88, 64, 52, 78, 90, 48, 66, 38].map((h, idx) => (
            <span
              key={idx}
              className="flex-1 rounded-full bg-[#C9F45B]/80"
              style={{ height: `${h}%`, opacity: idx % 3 === 0 ? 0.95 : 0.45 }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-1 font-mono text-[11px] text-[#A3A3A0]">
          <div className="rounded-lg bg-[#141414] border border-[#242424] px-3 py-2">Cadence: WPM</div>
          <div className="rounded-lg bg-[#141414] border border-[#242424] px-3 py-2">Fillers: Tracked</div>
          <div className="rounded-lg bg-[#141414] border border-[#242424] px-3 py-2">Cam: Optional</div>
        </div>
      </div>
    );
  }

  if (stageId === 'assessment') {
    return (
      <div className="rounded-xl border border-border bg-canvas p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <BarChart3 className="h-4 w-4 text-ink-secondary" />
            <span>Deterministic Rubric Weights</span>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> HMAC-SHA256
          </span>
        </div>
        <div className="space-y-2.5">
          {[
            { name: 'Communication Clarity', pct: 30 },
            { name: 'Technical Relevance', pct: 30 },
            { name: 'Confidence & Pacing', pct: 25 },
            { name: 'Professional Structure', pct: 15 },
          ].map((row) => (
            <div key={row.name} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-ink font-medium">{row.name}</span>
                <span className="font-mono text-ink-muted">{row.pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-ink dark:bg-[#C9F45B]" style={{ width: `${row.pct * 2.8}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-canvas p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Target className="h-4 w-4 text-ink-secondary" />
          <span>4-Week Remediation Track</span>
        </div>
        <span className="font-mono text-[11px] text-ink-muted">PERSISTED MILESTONES</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {['Week 01', 'Week 02', 'Week 03', 'Week 04'].map((w, i) => (
          <div key={w} className="rounded-lg border border-border bg-surface p-3 space-y-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/20" />
            <div className="font-mono text-[11px] font-medium text-ink">{w}</div>
            <div className="text-[11px] text-ink-muted">
              {i === 0 ? 'Core Foundations' : i === 1 ? 'Applied Patterns' : i === 2 ? 'System Depth' : 'Mock Capstone'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const reduced = useReducedMotion();

  const [scrolled, setScrolled] = useState(false);
  const [activeNav, setActiveNav] = useState<'product' | 'how' | 'features'>('product');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [demoOrbState, setDemoOrbState] = useState<OrbState>('idle');

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (reduced) return;

    const lenis = new Lenis({
      duration: 1.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    const ctx = gsap.context(() => {
      WORKFLOW_STAGES.forEach((stage, idx) => {
        const el = document.getElementById(`story-step-${stage.id}`);
        if (!el) return;
        ScrollTrigger.create({
          trigger: el,
          start: 'top 58%',
          end: 'bottom 42%',
          onEnter: () => setActiveStage(idx),
          onEnterBack: () => setActiveStage(idx),
        });
      });
    }, rootRef);

    return () => {
      cancelAnimationFrame(rafId);
      ctx.revert();
      lenis.destroy();
    };
  }, [reduced]);

  const scrollToSection = (id: string, navKey: 'product' | 'how' | 'features') => {
    setActiveNav(navKey);
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div ref={rootRef} className="min-h-screen bg-canvas text-ink selection:bg-[#C9F45B] selection:text-[#111111]">
      {/* Sticky Minimal Navigation */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
          scrolled
            ? 'bg-canvas/90 backdrop-blur-md border-b border-border'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 h-[72px] flex items-center justify-between">
          <Link to="/" className="focus:outline-none">
            <BrandMark size="md" animateOnce />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-[15px] font-medium" aria-label="Primary">
            {[
              { id: 'hero-product', key: 'product' as const, label: 'Product' },
              { id: 'how-it-works', key: 'how' as const, label: 'How it works' },
              { id: 'features', key: 'features' as const, label: 'Features' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => scrollToSection(item.id, item.key)}
                className={`relative pb-1 transition-colors ${
                  activeNav === item.key ? 'text-ink' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {item.label}
                {activeNav === item.key && (
                  <motion.span
                    layoutId="landing-nav-underline"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-x-0 -bottom-0.5 h-[2px] bg-ink dark:bg-[#C9F45B]"
                  />
                )}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink-secondary hover:text-ink transition-colors"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {isAuthenticated ? (
              <Link to="/dashboard">
                <Button variant="accent" size="md">
                  Open Workspace <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/auth">
                  <Button variant="ghost" size="md">
                    Sign in
                  </Button>
                </Link>
                <Link to="/auth?mode=register">
                  <Button variant="accent" size="md">
                    Get started <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
          </div>

          <div className="flex md:hidden items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: MOTION_EASE }}
              className="md:hidden border-b border-border bg-surface px-6 py-4 space-y-3 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => scrollToSection('hero-product', 'product')}
                className="block w-full text-left py-2 text-sm font-medium text-ink"
              >
                Product
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('how-it-works', 'how')}
                className="block w-full text-left py-2 text-sm font-medium text-ink"
              >
                How it works
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('features', 'features')}
                className="block w-full text-left py-2 text-sm font-medium text-ink"
              >
                Features
              </button>
              <div className="pt-2 border-t border-border flex gap-2">
                <Link to="/auth" className="flex-1">
                  <Button variant="secondary" className="w-full">
                    Sign in
                  </Button>
                </Link>
                <Link to="/auth?mode=register" className="flex-1">
                  <Button variant="accent" className="w-full">
                    Get started
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Full-Viewport Asymmetric Editorial Hero */}
      <section
        id="hero-product"
        className="relative pt-28 pb-16 lg:pt-32 lg:pb-20 min-h-screen flex items-center border-b border-border bg-grid-subtle overflow-hidden"
      >
        <div className="mx-auto max-w-[1440px] w-full px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <div className="lg:col-span-7">
            <motion.div
              variants={riseVariants}
              initial={reduced ? false : 'hidden'}
              animate="visible"
              custom={0.05}
              className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-mono uppercase tracking-wider text-ink-secondary mb-8 shadow-sm"
            >
              <span className="h-2 w-2 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/25" />
              Intelligence in Motion
            </motion.div>

            <h1 className="font-display text-5xl sm:text-6xl lg:text-[72px] xl:text-[84px] font-medium leading-[1.01] tracking-[-0.036em] text-ink max-w-4xl">
              <span className="block overflow-hidden">
                <motion.span
                  className="block"
                  variants={lineMaskVariants}
                  initial={reduced ? false : 'hidden'}
                  animate="visible"
                  custom={0.12}
                >
                  Great interviews aren&apos;t luck.
                </motion.span>
              </span>
              <span className="block overflow-hidden">
                <motion.span
                  className="block"
                  variants={lineMaskVariants}
                  initial={reduced ? false : 'hidden'}
                  animate="visible"
                  custom={0.22}
                >
                  They&apos;re practice.
                </motion.span>
              </span>
            </h1>

            <motion.p
              variants={riseVariants}
              initial={reduced ? false : 'hidden'}
              animate="visible"
              custom={0.34}
              className="mt-7 text-lg sm:text-xl text-ink-secondary max-w-2xl leading-relaxed"
            >
              An intelligent space to practice, reflect and become better with every conversation.
            </motion.p>

            <motion.div
              variants={riseVariants}
              initial={reduced ? false : 'hidden'}
              animate="visible"
              custom={0.44}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <Link to={isAuthenticated ? '/dashboard' : '/auth?mode=register'}>
                <Button variant="accent" size="lg">
                  Start your journey <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => scrollToSection('how-it-works', 'how')}
              >
                Experience the product
              </Button>
            </motion.div>

            <motion.div
              variants={riseVariants}
              initial={reduced ? false : 'hidden'}
              animate="visible"
              custom={0.54}
              className="mt-14 pt-7 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl"
            >
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">01 / Scoring Engine</div>
                <div className="mt-1.5 text-sm font-medium text-ink">4-Pillar Deterministic</div>
              </div>
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">02 / Live Telemetry</div>
                <div className="mt-1.5 text-sm font-medium text-ink">WPM, Fillers &amp; Code</div>
              </div>
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">03 / Privacy &amp; Equity</div>
                <div className="mt-1.5 text-sm font-medium text-ink">Camera-Optional &amp; Private</div>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.25, ease: MOTION_EASE }}
            className="lg:col-span-5 flex items-center justify-center"
          >
            <div className="w-full max-w-[520px] aspect-square rounded-2xl card-elevated bg-dot-matrix relative overflow-hidden flex items-center justify-center p-6">
              <div className="pointer-events-none absolute inset-0 studio-spotlight" />
              {/* Architectural Corner Crosshairs */}
              <span className="absolute top-4 left-4 h-3 w-3 border-l border-t border-ink/25 pointer-events-none" />
              <span className="absolute top-4 right-4 h-3 w-3 border-r border-t border-ink/25 pointer-events-none" />
              <span className="absolute bottom-4 left-4 h-3 w-3 border-l border-b border-ink/25 pointer-events-none" />
              <span className="absolute bottom-4 right-4 h-3 w-3 border-r border-b border-ink/25 pointer-events-none" />

              <div className="absolute top-5 left-6 right-6 flex items-center justify-between text-[11px] font-mono text-ink-muted pointer-events-none">
                <span>FIELD // WEBGL</span>
                <span>LATENCY &lt; 16MS</span>
              </div>

              <Suspense
                fallback={
                  <div className="h-36 w-36 rounded-full border border-border flex items-center justify-center text-xs font-mono text-ink-muted">
                    Initializing field…
                  </div>
                }
              >
                <HeroIntelligenceSphere />
              </Suspense>

              <div className="absolute bottom-5 left-6 right-6 flex items-center justify-between text-xs font-mono text-ink-muted pointer-events-none">
                <span>ADAPTIVE VOICE &amp; CODE ENGINE</span>
                <span className="inline-flex items-center gap-2 text-ink">
                  <span className="h-2 w-2 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/25" /> READY
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Scroll Storytelling Walkthrough */}
      <section id="how-it-works" className="py-24 lg:py-32 border-b border-border">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10">
          <div className="max-w-3xl mb-16">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
              THE WORKFLOW
            </span>
            <h2 className="font-display text-3xl sm:text-5xl font-medium mt-3 tracking-tight">
              Resume to verified mastery, in four deliberate stages.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5 space-y-4">
              {WORKFLOW_STAGES.map((stage, idx) => {
                const isActive = activeStage === idx;
                return (
                  <button
                    key={stage.id}
                    id={`story-step-${stage.id}`}
                    type="button"
                    onClick={() => setActiveStage(idx)}
                    className={`w-full text-left p-6 sm:p-7 rounded-2xl border transition-all duration-200 ${
                      isActive
                        ? 'border-ink bg-surface card-elevated'
                        : 'border-border bg-transparent hover:bg-surface/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-ink-muted">{stage.num}</span>
                      {isActive && (
                        <span className="h-2.5 w-2.5 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/20" />
                      )}
                    </div>
                    <h3 className="font-display text-2xl font-medium mt-2.5 text-ink">{stage.title}</h3>
                    <p className="text-sm sm:text-[15px] text-ink-secondary mt-2 leading-relaxed">{stage.detail}</p>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7 lg:sticky lg:top-28">
              <div className="rounded-2xl p-8 sm:p-10 min-h-[500px] flex flex-col justify-between card-elevated">
                <div className="flex items-center justify-between border-b border-border pb-5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs px-3 py-1 rounded-lg bg-surface-2 text-ink font-medium">
                      STAGE {WORKFLOW_STAGES[activeStage].num}
                    </span>
                    <span className="font-mono text-xs text-ink-muted">
                      {WORKFLOW_STAGES[activeStage].tag}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {WORKFLOW_STAGES.map((s, i) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-label={`View ${s.title}`}
                        onClick={() => setActiveStage(i)}
                        className={`h-2 rounded-full transition-all ${
                          activeStage === i ? 'w-7 bg-ink dark:bg-[#C9F45B]' : 'w-2 bg-border'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={WORKFLOW_STAGES[activeStage].id}
                    initial={reduced ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, y: -10 }}
                    transition={{ duration: 0.28, ease: MOTION_EASE }}
                    className="py-8 space-y-6"
                  >
                    <div>
                      <p className="text-base font-medium text-ink-secondary">
                        {WORKFLOW_STAGES[activeStage].subtitle}
                      </p>
                      <h4 className="font-display text-3xl sm:text-4xl font-medium text-ink leading-tight mt-2">
                        {WORKFLOW_STAGES[activeStage].headline}
                      </h4>
                    </div>

                    <StageVisualPreview stageId={WORKFLOW_STAGES[activeStage].id} />

                    <div className="space-y-3">
                      {WORKFLOW_STAGES[activeStage].items.map((item) => (
                        <div
                          key={item}
                          className="flex items-center gap-3.5 rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-ink"
                        >
                          <Check className="h-4 w-4 text-ink shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="pt-5 border-t border-border flex items-center justify-between text-sm text-ink-muted">
                  <span>Real-time API &amp; database pipeline</span>
                  <Link
                    to={isAuthenticated ? '/interview/setup' : '/auth?mode=register'}
                    className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline"
                  >
                    Launch this stage <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Varied Editorial Features & Interactive Orb Studio Showcase */}
      <section id="features" className="py-24 lg:py-32 border-b border-border">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 space-y-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center rounded-2xl bg-[#090909] text-[#F5F5F4] p-8 sm:p-12 lg:p-16 border border-[#242424] studio-spotlight">
            <div className="lg:col-span-6 space-y-6">
              <span className="font-mono text-xs uppercase tracking-wider text-[#A3A3A0]">
                01 / SIGNATURE INTERVIEW STUDIO
              </span>
              <h2 className="font-display text-3xl sm:text-5xl font-medium leading-tight">
                An attentive AI presence tuned to real speech, never canned loops.
              </h2>
              <p className="text-base text-[#A3A3A0] leading-relaxed max-w-xl">
                Preview how the harmonic particle field transitions cleanly across calm listening, active speaking, synthesis, and evaluation completion.
              </p>
              <div className="flex flex-wrap gap-2.5 pt-2">
                {(['idle', 'listening', 'speaking', 'thinking', 'processing', 'disconnected'] as OrbState[]).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setDemoOrbState(st)}
                      className={`px-4 py-2 rounded-xl text-xs font-mono border capitalize transition-colors ${
                        demoOrbState === st
                          ? 'bg-[#C9F45B] text-[#111111] border-[#C9F45B] font-medium'
                          : 'bg-[#141414] text-[#A3A3A0] border-[#262626] hover:text-[#F5F5F4]'
                      }`}
                    >
                      {st}
                    </button>
                  )
                )}
              </div>
            </div>
            <div className="lg:col-span-6 flex flex-col items-center justify-center">
              <StudioAIOrb
                state={demoOrbState}
                audioLevel={demoOrbState === 'listening' ? 0.52 : 0}
                size={310}
              />
              <span className="mt-3 font-mono text-xs uppercase tracking-widest text-[#A3A3A0]">
                ORB TELEMETRY · {demoOrbState}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start pt-8 border-t border-border">
            <div className="lg:col-span-4">
              <div className="font-display text-6xl font-medium text-ink-muted/35">02</div>
              <h3 className="font-display text-3xl font-medium mt-3">
                Deterministic 4-Pillar Rubric
              </h3>
            </div>
            <div className="lg:col-span-8 space-y-8">
              <p className="text-lg text-ink-secondary leading-relaxed max-w-2xl">
                Every interview ends with transparent, reproducible math — never opaque black-box verdicts. Candidates without cameras are evaluated fairly on response depth and fluency without penalty.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                {[
                  { label: 'Technical', weight: '30%' },
                  { label: 'Communication', weight: '30%' },
                  { label: 'Confidence', weight: '25%' },
                  { label: 'Professionalism', weight: '15%' },
                ].map((p) => (
                  <div key={p.label} className="border-t-2 border-ink/15 pt-4">
                    <div className="font-mono text-3xl font-medium text-ink">{p.weight}</div>
                    <div className="text-sm text-ink-secondary mt-1.5">{p.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start pt-10 border-t border-border">
            <div className="lg:col-span-4">
              <div className="font-display text-6xl font-medium text-ink-muted/35">03</div>
              <h3 className="font-display text-3xl font-medium mt-3">
                Privacy-Isolated Talent Pipeline
              </h3>
            </div>
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-10">
              <div className="space-y-2.5">
                <h4 className="text-base font-medium text-ink">Candidate Data Sovereignty</h4>
                <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
                  Practice interviews remain strictly private unless you explicitly opt in to share them. Export your complete JSON archive or deactivate anytime.
                </p>
              </div>
              <div className="space-y-2.5">
                <h4 className="text-base font-medium text-ink">Recruiter &amp; Admin Governance</h4>
                <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
                  Side-by-side structured comparisons, HMAC-verified PDF dossiers, reusable interview templates, sanitized CSV exports, and live security audit trails.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Editorial Footer */}
      <footer className="py-20">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 pb-16 border-b border-border">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
                READY WHEN YOU ARE
              </span>
              <h2 className="font-display text-4xl sm:text-6xl font-medium tracking-tight mt-3 max-w-2xl">
                Turn preparation into calm execution.
              </h2>
            </div>
            <Link to={isAuthenticated ? '/dashboard' : '/auth?mode=register'}>
              <Button variant="accent" size="lg">
                Start your journey <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-ink-muted">
            <BrandMark size="sm" />
            <div className="flex flex-wrap items-center gap-6">
              <Link to="/auth" className="hover:text-ink transition-colors">
                Sign in
              </Link>
              <Link to="/auth?mode=register" className="hover:text-ink transition-colors">
                Create account
              </Link>
              <a href="/api/docs/" target="_blank" rel="noreferrer" className="hover:text-ink transition-colors">
                API Docs
              </a>
              <span>© {new Date().getFullYear()} smarthire.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
