import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
  Play,
  ShieldCheck,
  Sun,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/Primitives';
import StudioAIOrb, { type OrbState } from '@/components/visuals/StudioAIOrb';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { MOTION_EASE, SPRING_SNAPPY, riseVariants } from '@/motion/system';

const HeroIntelligenceSphere = lazy(() => import('@/components/visuals/HeroIntelligenceSphere'));

const WORKFLOW_STAGES = [
  {
    id: 'resume',
    num: '01',
    title: 'Resume Intelligence',
    subtitle: 'Extract skills and role readiness before your first prompt.',
    detail:
      'Upload PDF, DOCX, or plain text. SmartHire analyzes your skills across modern role benchmarks and maps missing competencies into targeted interview practice.',
    tag: 'STAGE 01 · RESUME ANALYSIS',
    headline: 'Skill extraction & role alignment',
    items: [
      'Supports .pdf, .docx, and .txt files up to 10 MB',
      'Maps key job requirements straight into your custom practice plan',
    ],
  },
  {
    id: 'interview',
    num: '02',
    title: 'Interview Studio',
    subtitle: 'A calm, responsive space for deliberate spoken and code practice.',
    detail:
      'Practice Technical, Behavioral, HR, and Problem-Solving interviews with real-time speech transcription, pacing guidance, optional camera framing, and a built-in code editor.',
    tag: 'STAGE 02 · PRACTICE ROOM',
    headline: 'Adaptive voice & code practice studio',
    items: [
      'Real-time speech transcription and natural conversational flow',
      'Flexible setup — practice with or without camera at your preference',
    ],
  },
  {
    id: 'assessment',
    num: '03',
    title: 'Comprehensive Evaluation',
    subtitle: 'Actionable feedback and ratings across core competencies.',
    detail:
      'Every completed session provides a complete breakdown across Communication, Technical Relevance, Confidence, and Structure, complete with downloadable feedback reports.',
    tag: 'STAGE 03 · DETAILED FEEDBACK',
    headline: 'Objective scoring with constructive guidance',
    items: [
      'Question-by-question critique paired with suggested model answers',
      'Downloadable PDF summary reports for your records',
    ],
  },
  {
    id: 'growth',
    num: '04',
    title: 'Growth Journey',
    subtitle: 'Turn weak spots into structured weekly remediation milestones.',
    detail:
      'Evaluation insights automatically generate a role-adapted 4-week roadmap with clear goals, skill benchmarks, and direct links back to targeted studio drills.',
    tag: 'STAGE 04 · GROWTH ROADMAP',
    headline: '4-week personalized preparation path',
    items: [
      'Competency progress tracking current coverage against role expectations',
      'Structured milestone checklists that update with every session',
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
            <span>Resume Skill Extractor</span>
          </div>
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-md bg-[#C9F45B] text-[#111111] font-medium">
            PDF / DOCX / TXT
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {['Skill Extraction', 'Role Alignment', 'Gap Detection', 'Practice Plan'].map((step, i) => (
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
            <span>AI PRACTICE SESSION</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#242424] bg-[#141414] px-2.5 py-1 text-[11px] font-mono">
            <Mic className="h-3 w-3 text-[#C9F45B]" /> Voice + <Code2 className="h-3 w-3" /> Code
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
        <div className="grid grid-cols-3 gap-3 pt-1 text-center font-mono text-[11px] text-[#A3A3A0]">
          <div className="rounded-lg bg-[#141414] border border-[#242424] px-2 py-2">Speech-to-Text</div>
          <div className="rounded-lg bg-[#141414] border border-[#242424] px-2 py-2">Code Sandbox</div>
          <div className="rounded-lg bg-[#141414] border border-[#242424] px-2 py-2">Private &amp; Secure</div>
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
            <span>Performance Evaluation</span>
          </div>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified Report
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = (id: string, navKey: 'product' | 'how' | 'features') => {
    setActiveNav(navKey);
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div className="min-h-screen bg-canvas text-ink selection:bg-[#C9F45B] selection:text-[#111111] relative overflow-x-hidden">
      {/* Ambient background glows */}
      <div className="hero-glow-lime w-[550px] h-[550px] -top-28 left-1/3 -translate-x-1/2 opacity-65 pointer-events-none" />
      <div className="hero-glow-ambient w-[650px] h-[650px] top-10 right-0 opacity-40 pointer-events-none" />

      {/* Sticky Minimal Navigation */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
          scrolled
            ? 'bg-canvas/90 backdrop-blur-md border-b border-border shadow-sm'
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
              className="md:hidden border-b border-border bg-surface px-6 py-4 space-y-3 overflow-hidden shadow-lg"
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

      {/* Hero Section: Naturally Paced, No Giant Empty Gaps */}
      <section
        id="hero-product"
        className="relative pt-24 pb-12 lg:pt-28 lg:pb-16 border-b border-border bg-grid-subtle"
      >
        <div className="mx-auto max-w-[1440px] w-full px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Column: Headline, CTAs, & Grounding Badges */}
          <div className="lg:col-span-7">
            <motion.div
              variants={riseVariants}
              initial={reduced ? false : 'hidden'}
              animate="visible"
              custom={0.05}
              className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface/90 backdrop-blur-md px-3.5 py-1 text-xs font-medium text-ink shadow-sm mb-5"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C9F45B] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C9F45B]"></span>
              </span>
              <span>Intelligent AI Mock Interview Studio</span>
            </motion.div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-medium leading-[1.08] tracking-[-0.035em] text-ink max-w-2xl">
              Great interviews aren&apos;t luck. <br />
              <span className="text-ink-secondary">They&apos;re deliberate practice.</span>
            </h1>

            <motion.p
              variants={riseVariants}
              initial={reduced ? false : 'hidden'}
              animate="visible"
              custom={0.2}
              className="mt-5 text-base sm:text-lg text-ink-secondary max-w-xl leading-relaxed"
            >
              Practice realistic technical and behavioral interviews with real-time voice transcription, live coding sandbox evaluations, and instant constructive feedback.
            </motion.p>

            <motion.div
              variants={riseVariants}
              initial={reduced ? false : 'hidden'}
              animate="visible"
              custom={0.3}
              className="mt-7 flex flex-wrap items-center gap-3.5"
            >
              <Link to={isAuthenticated ? '/dashboard' : '/auth?mode=register'}>
                <Button variant="accent" size="lg" className="shadow-lg shadow-[#C9F45B]/20">
                  Start practicing free <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => scrollToSection('how-it-works', 'how')}
                className="bg-surface/90 backdrop-blur-sm border-border hover:bg-surface"
              >
                <Play className="h-3.5 w-3.5 mr-1.5 fill-current opacity-70" /> Explore live studio
              </Button>
            </motion.div>

            {/* Grounding Capability Badges (eliminates empty space below CTAs) */}
            <motion.div
              variants={riseVariants}
              initial={reduced ? false : 'hidden'}
              animate="visible"
              custom={0.4}
              className="mt-8 pt-6 border-t border-border/80 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-xl"
            >
              <div className="space-y-0.5">
                <div className="text-lg font-semibold text-ink font-display">98% ATS</div>
                <div className="text-xs text-ink-muted">Resume Alignment</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-lg font-semibold text-ink font-display">&lt;50ms</div>
                <div className="text-xs text-ink-muted">Voice Response</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-lg font-semibold text-ink font-display">STAR</div>
                <div className="text-xs text-ink-muted">Behavioral Rubric</div>
              </div>
              <div className="space-y-0.5">
                <div className="text-lg font-semibold text-ink font-display">100% Private</div>
                <div className="text-xs text-ink-muted">Camera-Optional</div>
              </div>
            </motion.div>
          </div>

          {/* Right Column: 3D Intelligence Sphere Visual */}
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.25, ease: MOTION_EASE }}
            className="lg:col-span-5 flex items-center justify-center"
          >
            <div className="w-full max-w-[440px] aspect-square rounded-2xl card-elevated bg-dot-matrix relative overflow-hidden flex items-center justify-center p-6">
              <div className="pointer-events-none absolute inset-0 studio-spotlight" />

              <Suspense
                fallback={
                  <div className="h-36 w-36 rounded-full border border-border flex items-center justify-center text-xs font-mono text-ink-muted">
                    Loading preview…
                  </div>
                }
              >
                <HeroIntelligenceSphere />
              </Suspense>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Target Disciplines & Practice Tracks Ribbon (Smooth bridge between Hero & Workflow) */}
      <div className="border-b border-border/80 bg-surface/60 backdrop-blur-sm py-4">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 flex flex-col md:flex-row items-center justify-between gap-3">
          <span className="text-xs font-mono uppercase tracking-wider text-ink-muted shrink-0">
            Practice tracks tailored for:
          </span>
          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 text-xs">
            {['Full Stack Engineer', 'Backend Architecture', 'Frontend Specialist', 'System Design', 'ML & AI Engineer', 'Behavioral (STAR)'].map((track) => (
              <span key={track} className="px-2.5 py-1 rounded-lg border border-border bg-surface text-ink-secondary font-medium shadow-xs">
                {track}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Workflow Section: Compact, Tabbed, No Empty Scroll Traps */}
      <section id="how-it-works" className="py-14 lg:py-18 border-b border-border">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 space-y-8">
          <div className="max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
              THE WORKFLOW
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-medium mt-2 tracking-tight">
              From resume to interview mastery in four deliberate steps.
            </h2>
          </div>

          {/* Interactive Stage Selector Tabs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {WORKFLOW_STAGES.map((stage, idx) => {
              const isActive = activeStage === idx;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setActiveStage(idx)}
                  className={`text-left p-4 sm:p-5 rounded-xl border transition-all duration-200 ${
                    isActive
                      ? 'border-ink bg-surface shadow-md ring-1 ring-ink/10'
                      : 'border-border bg-transparent hover:bg-surface/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-muted">{stage.num}</span>
                    {isActive && (
                      <span className="h-2 w-2 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/20" />
                    )}
                  </div>
                  <h3 className="font-display text-base font-medium mt-2 text-ink">{stage.title}</h3>
                  <p className="text-xs text-ink-secondary mt-1 line-clamp-2">{stage.subtitle}</p>
                </button>
              );
            })}
          </div>

          {/* Active Stage Dynamic Preview Panel */}
          <div className="rounded-2xl p-6 sm:p-8 card-elevated">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-surface-2 text-ink font-medium">
                  STAGE {WORKFLOW_STAGES[activeStage].num}
                </span>
                <span className="font-mono text-xs text-ink-muted">
                  {WORKFLOW_STAGES[activeStage].tag}
                </span>
              </div>
              <Link
                to={isAuthenticated ? '/interview/setup' : '/auth?mode=register'}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink hover:underline"
              >
                Launch this stage <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={WORKFLOW_STAGES[activeStage].id}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: MOTION_EASE }}
                className="py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
              >
                <div className="lg:col-span-6 space-y-4">
                  <h4 className="font-display text-2xl sm:text-3xl font-medium text-ink leading-tight">
                    {WORKFLOW_STAGES[activeStage].headline}
                  </h4>
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    {WORKFLOW_STAGES[activeStage].detail}
                  </p>
                  <div className="space-y-2 pt-2">
                    {WORKFLOW_STAGES[activeStage].items.map((item) => (
                      <div
                        key={item}
                        className="flex items-center gap-2.5 rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-xs text-ink"
                      >
                        <Check className="h-3.5 w-3.5 text-ink shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <StageVisualPreview stageId={WORKFLOW_STAGES[activeStage].id} />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Features & Interactive Studio Showcase */}
      <section id="features" className="py-14 lg:py-18 border-b border-border">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 space-y-12">
          {/* Main Dark Studio Showcase Card */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center rounded-2xl bg-[#090909] text-[#F5F5F4] p-6 sm:p-10 border border-[#242424] studio-spotlight">
            <div className="lg:col-span-6 space-y-4">
              <span className="font-mono text-xs uppercase tracking-wider text-[#A3A3A0]">
                01 / INTERACTIVE STUDIO DEMO
              </span>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-medium leading-tight">
                An attentive AI presence tuned to real conversation.
              </h2>
              <p className="text-sm text-[#A3A3A0] leading-relaxed max-w-xl">
                Experience a natural interview flow that listens, evaluates your problem-solving process, and provides thoughtful questions tailored to your experience.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {(['idle', 'listening', 'speaking', 'thinking', 'processing'] as OrbState[]).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setDemoOrbState(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono border capitalize transition-colors ${
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
                size={250}
              />
              <span className="mt-2 font-mono text-xs uppercase tracking-widest text-[#A3A3A0]">
                AI ASSISTANT · {demoOrbState}
              </span>
            </div>
          </div>

          {/* Grid of 2 Clear Value Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-3 shadow-xs">
              <div className="h-10 w-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-ink">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl font-medium text-ink">Actionable Evaluation &amp; Insights</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Every interview delivers constructive, clear feedback on how you structured your thoughts, articulated technical solutions, and presented your background.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-2">
                {['Technical Accuracy', 'Communication Clarity', 'Confidence & Poise', 'Role Alignment'].map((p) => (
                  <div key={p} className="flex items-center gap-2 text-xs text-ink font-medium">
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-border bg-surface space-y-3 shadow-xs">
              <div className="h-10 w-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-ink">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl font-medium text-ink">Privacy-First Candidate Experience</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Your mock interviews are completely confidential and private to your account. Practice in a safe, camera-optional environment designed purely for self-improvement.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-2">
                {['Camera-Optional', 'Private Data Sovereignty', 'No Public Leakage', 'Exportable History'].map((p) => (
                  <div key={p} className="flex items-center gap-2 text-xs text-ink font-medium">
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Editorial Footer */}
      <footer className="py-12 border-t border-border">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-10 space-y-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-medium text-ink">
                Ready to elevate your interview readiness?
              </h2>
              <p className="text-sm text-ink-secondary mt-1">
                Join thousands practicing deliberate technical and behavioral interviews.
              </p>
            </div>
            <Link to={isAuthenticated ? '/dashboard' : '/auth?mode=register'}>
              <Button variant="accent" size="lg">
                Get started free <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </Link>
          </div>

          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-muted">
            <BrandMark size="sm" />
            <div className="flex flex-wrap items-center gap-5">
              <Link to="/auth" className="hover:text-ink transition-colors">
                Sign in
              </Link>
              <Link to="/auth?mode=register" className="hover:text-ink transition-colors">
                Create account
              </Link>
              <a href="/api/docs/" target="_blank" rel="noreferrer" className="hover:text-ink transition-colors">
                API Docs
              </a>
              <span>© {new Date().getFullYear()} smarthire. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
