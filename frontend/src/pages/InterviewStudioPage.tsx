import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Camera,
  CameraOff,
  Check,
  ChevronRight,
  Code2,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  Volume2,
} from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { Button, Tooltip } from '@/components/ui/Primitives';
import StudioAIOrb, { type OrbState } from '@/components/visuals/StudioAIOrb';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import { formatDurationSeconds } from '@/lib/cn';
import { LiveVisionTracker, type VisionTelemetrySample } from '@/lib/visionBehavior';
import type { InterviewAnswer, InterviewSession } from '@/lib/types';
import { MOTION_EASE, SPRING_SNAPPY } from '@/motion/system';

const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'sort of', 'kind of'];

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

export default function InterviewStudioPage() {
  const { sessionId: paramSessionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reduced = useReducedMotion();

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answersMap, setAnswersMap] = useState<Record<string, InterviewAnswer>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(1200);

  const [inputMode, setInputMode] = useState<'speech' | 'code'>('speech');
  const [language, setLanguage] = useState('python');
  const [transcript, setTranscript] = useState('');
  const [codeText, setCodeText] = useState('');

  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [webcamExpanded, setWebcamExpanded] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [liveVision, setLiveVision] = useState<VisionTelemetrySample | null>(null);

  const questionStartRef = useRef<number>(Date.now());
  const tabSwitchesRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number>(0);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const visionTrackerRef = useRef<LiveVisionTracker | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const resolvedSessionId = paramSessionId || sessionStorage.getItem('active_interview_session_id');

  const cleanupMedia = useCallback(() => {
    cancelAnimationFrame(analyserRafRef.current);
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // ignore
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => { });
    }
    audioCtxRef.current = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!resolvedSessionId) {
      navigate('/interview/setup', { replace: true });
      return;
    }

    let active = true;
    api
      .getSession(resolvedSessionId)
      .then((s) => {
        if (!active) return;
        if (s.status === 'completed') {
          navigate(`/insights?session_id=${s.id}`, { replace: true });
          return;
        }
        setSession(s);
        sessionStorage.setItem('active_interview_session_id', s.id);
        const map: Record<string, InterviewAnswer> = {};
        (s.answers || []).forEach((a) => {
          map[a.question] = a;
        });
        setAnswersMap(map);
        const startIdx = Math.min(s.current_question_index || 0, Math.max(0, s.questions.length - 1));
        setQuestionIdx(startIdx);
        setRemainingSeconds(s.remaining_total_seconds ?? s.duration_minutes * 60);
        setCameraOn(Boolean(s.camera_enabled));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setOrbState('disconnected');
        toast('Could not recover interview session.', 'error');
        navigate('/interview/setup', { replace: true });
      });

    return () => {
      active = false;
      cleanupMedia();
    };
  }, [resolvedSessionId, navigate, toast, cleanupMedia]);

  useEffect(() => {
    if (!session) return;
    let active = true;

    const setupDevices = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraOn,
          audio: true,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current && cameraOn && stream.getVideoTracks().length > 0) {
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
          const loop = () => {
            if (!active) return;
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = (data[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / data.length);
            setAudioLevel(Math.min(1, rms * 4.5));
            analyserRafRef.current = requestAnimationFrame(loop);
          };
          loop();
        }
      } catch {
        setCameraOn(false);
      }
    };

    setupDevices();
    return () => {
      active = false;
      cleanupMedia();
    };
  }, [session?.id, cameraOn, cleanupMedia]);

  const currentQuestion = session?.questions[questionIdx] || null;
  useEffect(() => {
    if (!currentQuestion) return;
    questionStartRef.current = Date.now();
    recordedChunksRef.current = [];
    visionTrackerRef.current?.reset();
    setLiveVision(null);
    const saved = answersMap[currentQuestion.id];
    setTranscript(saved?.transcript_text || '');
    setCodeText(saved?.code_text || '');
    if (saved?.language) setLanguage(saved.language);
  }, [currentQuestion?.id]);

  // Real-time 1Hz Computer Vision webcam analysis (eye-contact, attention, engagement, expression)
  useEffect(() => {
    if (!session || !cameraOn) {
      setLiveVision(null);
      return;
    }
    if (!visionTrackerRef.current) {
      visionTrackerRef.current = new LiveVisionTracker();
    }
    const timer = window.setInterval(() => {
      visionTrackerRef.current?.analyzeFrame(videoRef.current).then((sample) => {
        if (sample) setLiveVision(sample);
      });
    }, 950);
    return () => window.clearInterval(timer);
  }, [session?.id, cameraOn]);

  const stopAndCollectClip = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === 'inactive') {
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          recordedChunksRef.current = [];
          resolve(blob.size > 512 ? blob : null);
        } else {
          resolve(null);
        }
        return;
      }
      rec.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: rec.mimeType || 'video/webm' });
        recordedChunksRef.current = [];
        resolve(blob.size > 512 ? blob : null);
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }, [transcript, questionIdx, reduced]);

  useEffect(() => {
    if (!session) return;
    const onVisChange = () => {
      if (document.hidden) {
        tabSwitchesRef.current += 1;
        api.sendProctoringTelemetry(session.id, 'TAB_SWITCH', tabSwitchesRef.current).catch(() => { });
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, [session]);

  const handleFinishSession = useCallback(async () => {
    if (!session || finalizing) return;
    setFinalizing(true);
    setOrbState('processing');
    setIsRecording(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    try {
      if (currentQuestion) {
        const dur = Math.max(5, Math.round((Date.now() - questionStartRef.current) / 1000));
        const visionSummary = cameraOn ? visionTrackerRef.current?.getSummary() : null;
        const mediaClip = session.recording_consent ? await stopAndCollectClip() : null;
        await api.submitAnswer({
          session_id: session.id,
          question_id: currentQuestion.id,
          input_mode: codeText.trim() && !transcript.trim() ? 'code' : 'speech',
          language,
          transcript_text: transcript.trim(),
          code_text: codeText.trim(),
          duration_seconds: dur,
          eye_contact_percentage: visionSummary?.eyeContactPct ?? 0,
          attention_score: visionSummary?.attentionScore ?? 0,
          engagement_score: visionSummary?.engagementScore ?? 0,
          dominant_emotion: visionSummary?.dominantEmotion || (cameraOn ? 'Focused' : 'Neutral'),
          media_recording: mediaClip,
          next_question_index: questionIdx,
        });
      }
      await api.finishInterview(session.id);
      sessionStorage.removeItem('active_interview_session_id');
      cleanupMedia();
      navigate(`/insights?session_id=${session.id}&reveal=1`);
    } catch (err) {
      setOrbState('idle');
      setFinalizing(false);
      toast(err instanceof Error ? err.message : 'Unable to finalize interview.', 'error');
    }
  }, [session, finalizing, currentQuestion, codeText, transcript, language, cameraOn, questionIdx, cleanupMedia, navigate, toast]);

  useEffect(() => {
    if (!session || finalizing) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          handleFinishSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [session, finalizing, handleFinishSession]);

  const liveMetrics = useMemo(() => {
    const clean = transcript.trim();
    const words = clean ? clean.split(/\s+/).filter(Boolean) : [];
    const elapsed = Math.max(10, Math.round((Date.now() - questionStartRef.current) / 1000));
    const wpm = words.length ? Math.round((words.length / elapsed) * 60) : 0;
    const lower = clean.toLowerCase();
    let fillers = 0;
    FILLER_WORDS.forEach((f) => {
      const m = lower.match(new RegExp(`\\b${f}\\b`, 'g'));
      if (m) fillers += m.length;
    });
    return { words: words.length, wpm, fillers };
  }, [transcript]);

  const handleWhisperTranscribe = async () => {
    const clip = await stopAndCollectClip();
    if (!clip) {
      toast('Record audio using Speak first, then transcribe with Whisper.', 'info');
      return;
    }
    setTranscribing(true);
    try {
      const res = await api.transcribeAudio(clip);
      if (res.transcript) {
        setTranscript((prev) => (prev ? `${prev.trim()} ${res.transcript}` : res.transcript));
        toast(`Transcribed via ${res.provider}`, 'success');
      } else {
        toast(res.error || 'No speech recognized in audio clip.', 'info');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Whisper transcription failed.', 'error');
    } finally {
      setTranscribing(false);
    }
  };

  const toggleMic = () => {
    const startMediaRecorder = () => {
      if (!session?.recording_consent || !streamRef.current || typeof MediaRecorder === 'undefined') return;
      try {
        recordedChunksRef.current = [];
        const mime = MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';
        const recorder = mime
          ? new MediaRecorder(streamRef.current, { mimeType: mime })
          : new MediaRecorder(streamRef.current);
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch {
        // ignore unsupported browser codec
      }
    };

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;

    if (!SpeechRec) {
      if (isRecording) {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
        setOrbState('idle');
      } else {
        startMediaRecorder();
        setIsRecording(true);
        setOrbState('listening');
        toast('Recording audio for Whisper STT & playback. Click Mute then Whisper STT or Next Question.', 'info');
      }
      setTranscriptOpen(true);
      return;
    }

    if (isRecording) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
      setOrbState('idle');
      return;
    }

    startMediaRecorder();
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    const baseText = transcript ? transcript.trim() + ' ' : '';

    rec.onresult = (ev) => {
      let finalSeg = '';
      let interimSeg = '';
      for (let i = 0; i < ev.results.length; i++) {
        const piece = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalSeg += piece + ' ';
        else interimSeg += piece;
      }
      setTranscript((baseText + finalSeg + interimSeg).trim());
    };

    rec.onerror = () => {
      setIsRecording(false);
      setOrbState('idle');
    };

    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
    setOrbState('listening');
  };

  const speakPrompt = () => {
    if (!currentQuestion || !('speechSynthesis' in window)) {
      toast('Speech synthesis not supported in this browser.', 'info');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(currentQuestion.prompt);
      utter.rate = 0.98;
      utter.onstart = () => setOrbState('speaking');
      utter.onend = () => setOrbState(isRecording ? 'listening' : 'idle');
      utter.onerror = () => setOrbState(isRecording ? 'listening' : 'idle');
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore
    }
  };

  const persistAndMove = async (targetIdx: number) => {
    if (!session || !currentQuestion) return;
    setSaving(true);
    setOrbState('thinking');
    try {
      const dur = Math.max(5, Math.round((Date.now() - questionStartRef.current) / 1000));
      const visionSummary = cameraOn ? visionTrackerRef.current?.getSummary() : null;
      const mediaClip = session.recording_consent ? await stopAndCollectClip() : null;
      const res = await api.submitAnswer({
        session_id: session.id,
        question_id: currentQuestion.id,
        input_mode: codeText.trim() && !transcript.trim() ? 'code' : 'speech',
        language,
        transcript_text: transcript.trim(),
        code_text: codeText.trim(),
        duration_seconds: dur,
        eye_contact_percentage: visionSummary?.eyeContactPct ?? 0,
        attention_score: visionSummary?.attentionScore ?? 0,
        engagement_score: visionSummary?.engagementScore ?? 0,
        dominant_emotion: visionSummary?.dominantEmotion || (cameraOn ? 'Focused' : 'Neutral'),
        media_recording: mediaClip,
        next_question_index: targetIdx,
      });
      setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: res.answer }));
      setQuestionIdx(targetIdx);
      toast('Response saved.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to save response.', 'error');
    } finally {
      setSaving(false);
      setOrbState(isRecording ? 'listening' : 'idle');
    }
  };

  if (loading || !session || !currentQuestion) {
    return (
      <div className="min-h-screen bg-[#090909] text-[#F5F5F5] flex flex-col items-center justify-center gap-4">
        <StudioAIOrb state="processing" size={210} />
        <p className="font-mono text-sm text-[#A1A1A1]">Initializing interview studio…</p>
      </div>
    );
  }

  const isLast = questionIdx >= session.questions.length - 1;

  return (
    <div className="min-h-screen bg-[#090909] text-[#F5F5F4] flex flex-col justify-between relative overflow-hidden studio-spotlight">
      {/* Studio Top HUD */}
      <header className="h-[72px] px-5 sm:px-10 border-b border-[#242424] bg-[#090909]/85 backdrop-blur-md flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-4 min-w-0">
          <BrandMark size="md" className="text-[#F5F5F4] [&_span]:text-[#F5F5F4]" />
          <span className="hidden sm:inline-block h-5 w-px bg-[#242424]" />
          <span className="font-mono text-xs sm:text-sm text-[#A3A3A0] truncate">
            {session.domain} · {session.category}
          </span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden md:flex items-center gap-1.5" aria-label="Question progress">
            {session.questions.map((q, idx) => (
              <span
                key={q.id}
                className={`h-1.5 rounded-full transition-all ${
                  idx === questionIdx
                    ? 'w-6 bg-[#C9F45B]'
                    : idx < questionIdx
                      ? 'w-2.5 bg-[#F5F5F4]/60'
                      : 'w-2 bg-[#2A2A2A]'
                }`}
              />
            ))}
          </div>
          <span className="font-mono text-xs sm:text-sm text-[#A3A3A0]">
            Question {questionIdx + 1} / {session.questions.length}
          </span>
          <span
            className={`px-3 py-1.5 rounded-xl border font-mono text-xs sm:text-sm font-medium ${
              remainingSeconds < 120
                ? 'border-red-500/40 text-red-400 bg-red-950/30'
                : 'border-[#242424] bg-[#141414] text-[#F5F5F4]'
            }`}
          >
            {formatDurationSeconds(remainingSeconds)}
          </span>
        </div>
      </header>

      {/* Main Studio Canvas */}
      <main className="flex-1 mx-auto w-full max-w-[1440px] px-5 sm:px-10 py-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left: Orb + Question Prompt */}
        <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-7">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <StudioAIOrb state={orbState} audioLevel={audioLevel} size={220} />
            <div className="space-y-2 text-center sm:text-left">
              <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[#A3A3A0]">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    orbState === 'disconnected' ? 'bg-red-500' : 'bg-[#C9F45B]'
                  }`}
                />
                {finalizing ? 'EVALUATING RESPONSES' : orbState.toUpperCase()}
              </div>
              <div className="text-base font-medium text-[#F5F5F4]">{currentQuestion.competency}</div>
              <div className="text-xs text-[#737370]">
                {isRecording ? 'Microphone capturing live speech' : 'Click Speak below or type your answer'}
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: MOTION_EASE }}
              className="w-full"
            >
              <h2 className="font-display text-2xl sm:text-3xl xl:text-4xl font-medium leading-snug text-[#F5F5F4]">
                {currentQuestion.prompt}
              </h2>
            </motion.div>
          </AnimatePresence>

          {/* Mode Switcher & Cadence Strip */}
          <div className="w-full flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#242424]">
            <div className="inline-flex p-1 rounded-xl bg-[#141414] border border-[#242424]">
              <button
                type="button"
                onClick={() => setInputMode('speech')}
                className={`px-4 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                  inputMode === 'speech' ? 'bg-[#C9F45B] text-[#111111]' : 'text-[#A3A3A0] hover:text-[#F5F5F4]'
                }`}
              >
                <Mic className="h-3.5 w-3.5" /> Speech &amp; Transcript
              </button>
              <button
                type="button"
                onClick={() => setInputMode('code')}
                className={`px-4 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                  inputMode === 'code' ? 'bg-[#C9F45B] text-[#111111]' : 'text-[#A3A3A0] hover:text-[#F5F5F4]'
                }`}
              >
                <Code2 className="h-3.5 w-3.5" /> Code Editor
              </button>
            </div>

            <div className="flex items-center gap-5 font-mono text-xs sm:text-sm text-[#A3A3A0]">
              <span>{liveMetrics.wpm} WPM</span>
              <span>{liveMetrics.fillers} fillers</span>
              <span>{liveMetrics.words} words</span>
            </div>
          </div>

          {inputMode === 'code' && (
            <div className="w-full rounded-2xl border border-[#242424] bg-[#121212] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#242424] flex items-center justify-between text-xs text-[#A3A3A0]">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="bg-[#1A1A1A] text-[#F5F5F4] border border-[#2A2A2A] rounded-lg px-2.5 py-1 text-xs"
                >
                  <option value="python">Python 3</option>
                  <option value="javascript">TypeScript / JS</option>
                  <option value="sql">PostgreSQL</option>
                  <option value="cpp">C++ / Java</option>
                </select>
                <span className="font-mono text-[11px]">Code response</span>
              </div>
              <textarea
                value={codeText}
                onChange={(e) => setCodeText(e.target.value)}
                rows={9}
                placeholder="# Write your solution or architectural notes…"
                className="w-full bg-transparent p-4 font-mono text-sm text-[#F5F5F4] focus:outline-none resize-y"
              />
            </div>
          )}
        </div>

        {/* Right: Floating Webcam & Collapsible Live Transcript */}
        <div className="lg:col-span-5 space-y-5">
          <motion.div
            layout
            transition={SPRING_SNAPPY}
            className={`rounded-2xl border border-[#242424] bg-[#121212] overflow-hidden ${
              webcamExpanded ? 'h-72' : 'h-48'
            } relative flex items-center justify-center`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraOn ? 'block' : 'hidden'}`}
            />
            {!cameraOn && (
              <div className="text-center px-5 text-[#A3A3A0]">
                <CameraOff className="h-6 w-6 mx-auto mb-2" />
                <span className="text-sm font-medium text-[#F5F5F4] block">Camera Off</span>
                <span className="text-xs text-[#737370] block mt-1">Zero score penalty in audio/text mode</span>
              </div>
            )}

            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-lg bg-black/75 px-2.5 py-1 font-mono text-[11px] text-[#F5F5F4]">
                {isRecording && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                {isRecording ? 'RECORDING' : cameraOn ? 'VISION ACTIVE' : 'AUDIO / TEXT'}
              </span>
              <button
                type="button"
                onClick={() => setWebcamExpanded((v) => !v)}
                aria-label={webcamExpanded ? 'Compact webcam' : 'Expand webcam'}
                className="p-2 rounded-lg bg-black/75 text-[#F5F5F4] hover:bg-black"
              >
                {webcamExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>

            {cameraOn && liveVision && (
              <div
                data-testid="live-vision-hud"
                className="absolute bottom-2.5 left-2.5 right-2.5 rounded-lg bg-black/80 backdrop-blur-sm border border-[#2A2A2A] px-3 py-1.5 flex items-center justify-between gap-2 font-mono text-[10px] text-[#F5F5F4]"
              >
                <span>Gaze {liveVision.eyeContactPct}%</span>
                <span>Attn {liveVision.attentionScore}%</span>
                <span>Eng {liveVision.engagementScore}%</span>
                <span className="text-[#C9F45B]">{liveVision.emotion}</span>
              </div>
            )}
          </motion.div>

          <AnimatePresence initial={false}>
            {transcriptOpen && (
              <motion.div
                initial={reduced ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={reduced ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: MOTION_EASE }}
                className="rounded-2xl border border-[#242424] bg-[#121212] overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-[#242424] flex items-center justify-between text-xs">
                  <span className="font-mono text-[#A3A3A0]">LIVE TRANSCRIPT</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleWhisperTranscribe}
                      disabled={transcribing}
                      className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#1A1A1A] border border-[#2A2A2A] text-[#C9F45B] hover:border-[#C9F45B]/60 disabled:opacity-50"
                    >
                      {transcribing ? 'Transcribing…' : 'Whisper STT'}
                    </button>
                    <span className="text-[#737370]">Editable</span>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <div className="text-xs text-[#A3A3A0] leading-relaxed">
                    <span className="font-mono text-[#C9F45B] mr-2">PROMPT:</span>
                    {currentQuestion.prompt}
                  </div>
                  <textarea
                    id="live-transcript-input"
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={6}
                    placeholder="Speak with your microphone or type your response here…"
                    className="w-full rounded-xl border border-[#242424] bg-[#090909] p-4 text-sm text-[#F5F5F4] focus:border-[#C9F45B] focus:outline-none resize-y"
                  />
                  <div ref={transcriptEndRef} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Clear User-Friendly Control Dock */}
      <footer className="pb-6 pt-3 px-4 flex items-center justify-center z-20">
        <div className="inline-flex items-center gap-3 sm:gap-4 rounded-2xl border border-[#242424] bg-[#121212]/95 backdrop-blur-xl px-5 py-3 shadow-2xl">
          <Tooltip content={isRecording ? 'Pause microphone' : 'Start live transcription'}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={SPRING_SNAPPY}
              onClick={toggleMic}
              aria-label="Toggle microphone"
              className="flex flex-col items-center gap-1 group"
            >
              <span
                className={`h-11 w-11 rounded-full inline-flex items-center justify-center transition-colors ${
                  isRecording
                    ? 'bg-[#C9F45B] text-[#111111]'
                    : 'bg-[#1A1A1A] text-[#F5F5F4] border border-[#2A2A2A] group-hover:border-[#525252]'
                }`}
              >
                {isRecording ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </span>
              <span className="text-[10px] font-mono text-[#A3A3A0]">{isRecording ? 'Mute' : 'Speak'}</span>
            </motion.button>
          </Tooltip>

          <Tooltip content={cameraOn ? 'Disable camera' : 'Enable local camera'}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={SPRING_SNAPPY}
              onClick={() => setCameraOn((v) => !v)}
              aria-label="Toggle camera"
              className="flex flex-col items-center gap-1 group"
            >
              <span
                className={`h-11 w-11 rounded-full inline-flex items-center justify-center transition-colors ${
                  cameraOn
                    ? 'bg-[#F5F5F4] text-[#111111]'
                    : 'bg-[#1A1A1A] text-[#F5F5F4] border border-[#2A2A2A] group-hover:border-[#525252]'
                }`}
              >
                {cameraOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
              </span>
              <span className="text-[10px] font-mono text-[#A3A3A0]">Camera</span>
            </motion.button>
          </Tooltip>

          <Tooltip content="Read question aloud">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={SPRING_SNAPPY}
              onClick={speakPrompt}
              aria-label="Repeat question"
              className="flex flex-col items-center gap-1 group"
            >
              <span className="h-11 w-11 rounded-full bg-[#1A1A1A] text-[#F5F5F4] border border-[#2A2A2A] group-hover:border-[#525252] inline-flex items-center justify-center">
                <Volume2 className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-mono text-[#A3A3A0]">Read</span>
            </motion.button>
          </Tooltip>

          <Tooltip content={transcriptOpen ? 'Hide transcript' : 'Show transcript'}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={SPRING_SNAPPY}
              onClick={() => setTranscriptOpen((v) => !v)}
              aria-label="Toggle transcript"
              className="flex flex-col items-center gap-1 group"
            >
              <span
                className={`h-11 w-11 rounded-full inline-flex items-center justify-center border ${
                  transcriptOpen
                    ? 'bg-[#1A1A1A] text-[#C9F45B] border-[#C9F45B]/40'
                    : 'bg-[#1A1A1A] text-[#F5F5F4] border-[#2A2A2A]'
                }`}
              >
                <MessageSquare className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-mono text-[#A3A3A0]">Notes</span>
            </motion.button>
          </Tooltip>

          <span className="h-8 w-px bg-[#242424] mx-0.5" />

          <Button
            type="button"
            variant="secondary"
            size="md"
            loading={saving}
            data-testid="next-question-btn"
            onClick={() => persistAndMove(isLast ? questionIdx : questionIdx + 1)}
            className="rounded-xl bg-[#1A1A1A] text-[#F5F5F4] border-[#2A2A2A] hover:bg-[#242424]"
          >
            {isLast ? (
              <>
                <Check className="h-4 w-4" /> Save Answer
              </>
            ) : (
              <>
                Next Question <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="danger"
            size="md"
            loading={finalizing}
            data-testid="submit-interview-btn"
            onClick={handleFinishSession}
            className="rounded-xl"
          >
            <PhoneOff className="h-4 w-4" />
            <span className="hidden sm:inline">End &amp; Evaluate</span>
          </Button>
        </div>
      </footer>
    </div>
  );
}
