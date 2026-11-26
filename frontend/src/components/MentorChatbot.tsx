import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  History,
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import type { MentorContextSummary, MentorMessage, MentorQAPair } from '@/lib/types';
import { MOTION_EASE, SPRING_SNAPPY } from '@/motion/system';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'could', 'do', 'does',
  'for', 'from', 'had', 'have', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'me', 'my',
  'of', 'on', 'or', 'our', 'please', 'should', 'so', 'tell', 'that', 'the', 'their',
  'this', 'to', 'was', 'we', 'what', 'when', 'where', 'which', 'who', 'why', 'will',
  'with', 'would', 'you', 'your',
]);

function tokenizeDoubt(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

function findSimilarPastDoubts(draft: string, qaHistory: MentorQAPair[]): MentorQAPair[] {
  const cleanDraft = draft.trim().toLowerCase();
  if (cleanDraft.length < 3 || qaHistory.length === 0) return [];

  const draftTokens = tokenizeDoubt(cleanDraft);
  const scored = qaHistory
    .map((pair) => {
      const qLower = pair.question.toLowerCase();
      const aLower = pair.answer.toLowerCase();
      let score = 0;

      if (qLower.includes(cleanDraft) || cleanDraft.includes(qLower)) {
        score += 5;
      }

      if (draftTokens.length > 0) {
        const qTokens = new Set(tokenizeDoubt(qLower));
        let overlap = 0;
        for (const tok of draftTokens) {
          if (qTokens.has(tok) || qLower.includes(tok)) {
            overlap += 1;
          } else if (aLower.includes(tok)) {
            overlap += 0.4;
          }
        }
        if (overlap >= 1) {
          score += overlap / Math.max(1, draftTokens.length) * 4 + overlap * 0.5;
        }
      }

      return { pair, score };
    })
    .filter((item) => item.score >= 1.5)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 2).map((s) => s.pair);
}

function formatDoubtTimestamp(iso: string): string {
  try {
    const dt = new Date(iso);
    return dt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function FormattedBotText({ text }: { text: string }) {
  const lines = text.split('\n');
  const renderInline = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={idx} className="px-1.5 py-0.5 rounded bg-surface-2 font-mono text-[12px] text-ink">
            {part.slice(1, -1)}
          </code>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-1.5 text-[13.5px] leading-relaxed text-ink-secondary">
      {lines.map((rawLine, idx) => {
        const trimmed = rawLine.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/20 shrink-0" />
              <span>{renderInline(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

export function MentorChatbot() {
  const { toast } = useToast();
  const reduced = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [qaHistory, setQaHistory] = useState<MentorQAPair[]>([]);
  const [searchedHistory, setSearchedHistory] = useState<MentorQAPair[] | null>(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [highlightedPair, setHighlightedPair] = useState<{ qId: string; aId?: string | null } | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const [summary, setSummary] = useState<MentorContextSummary | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [inputSource, setInputSource] = useState<'text' | 'voice'>('text');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!open) return;
    api
      .getMentorChatHistory()
      .then((res) => {
        setMessages(res.messages || []);
        setQaHistory(res.qa_history || []);
        setSummary(res.context_summary || null);
        setSuggestions(res.suggested_prompts || []);
      })
      .catch(() => {
        // Ignore transient fetch failures; composer still remains usable
      });
  }, [open]);

  useEffect(() => {
    if (!open || activeTab !== 'history') return;
    const trimmed = historyQuery.trim();
    if (!trimmed) {
      setSearchedHistory(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .getMentorChatHistory(trimmed)
        .then((res) => {
          setSearchedHistory(res.qa_history || []);
        })
        .catch(() => {
          // Keep client-side fallback filtering below
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [historyQuery, open, activeTab]);

  useEffect(() => {
    if (open && activeTab === 'chat' && !highlightedPair) {
      listEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [messages, open, activeTab, sending, reduced, highlightedPair]);

  const similarPastDoubts = useMemo(() => {
    if (activeTab !== 'chat') return [];
    return findSimilarPastDoubts(draft, qaHistory);
  }, [draft, qaHistory, activeTab]);

  const visibleHistoryItems = useMemo(() => {
    if (searchedHistory !== null) return searchedHistory;
    const q = historyQuery.trim().toLowerCase();
    if (!q) return qaHistory;
    return qaHistory.filter(
      (item) => item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q),
    );
  }, [qaHistory, searchedHistory, historyQuery]);

  const jumpToSavedMessage = (questionId: string, answerId?: string | null) => {
    setActiveTab('chat');
    const targetId = answerId || questionId;
    setHighlightedPair({ qId: questionId, aId: answerId });
    window.setTimeout(() => {
      const targetEl = messageRefs.current[targetId] || messageRefs.current[questionId];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      }
      window.setTimeout(() => setHighlightedPair(null), 2600);
    }, 80);
  };

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const stopVoice = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setListening(false);
  };

  const toggleVoiceInput = () => {
    if (listening) {
      stopVoice();
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;

    if (!SpeechRec) {
      toast('Voice dictation unavailable in this browser. Type your doubt below.', 'info');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      const prefix = draft.trim() ? draft.trim() + ' ' : '';

      rec.onresult = (ev) => {
        let finalText = '';
        let interimText = '';
        for (let i = 0; i < ev.results.length; i++) {
          const piece = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalText += piece + ' ';
          else interimText += piece;
        }
        setDraft((prefix + finalText + interimText).trim());
        setInputSource('voice');
      };

      rec.onerror = () => {
        setListening(false);
        toast('Microphone access blocked or unavailable. You can type your doubt anytime.', 'info');
      };

      rec.onend = () => {
        setListening(false);
      };

      rec.start();
      recognitionRef.current = rec;
      setListening(true);
      setInputSource('voice');
    } catch {
      setListening(false);
      toast('Could not start voice dictation.', 'error');
    }
  };

  const handleSend = async (overrideText?: string, overrideSource?: 'text' | 'voice') => {
    const text = (overrideText ?? draft).trim();
    if (!text || sending) return;

    if (listening) stopVoice();

    const source = overrideSource ?? inputSource;
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMsg: MentorMessage = {
      id: optimisticId,
      role: 'user',
      content: text,
      input_source: source,
      provider: source,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    if (!overrideText) setDraft('');
    setInputSource('text');
    setSending(true);

    try {
      const res = await api.sendMentorChat(text, source);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        res.user_message,
        res.assistant_message,
      ]);
      const newPair: MentorQAPair = {
        question_id: res.user_message.id,
        answer_id: res.assistant_message.id,
        question: res.user_message.content,
        answer: res.assistant_message.content,
        input_source: res.user_message.input_source,
        provider: res.assistant_message.provider,
        created_at: res.user_message.created_at,
      };
      setQaHistory((prev) => [newPair, ...prev]);
      setSummary(res.context_summary);
      setSuggestions(res.suggested_prompts || []);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      toast(err instanceof Error ? err.message : 'Unable to send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    try {
      const res = await api.clearMentorChat();
      setMessages([]);
      setQaHistory([]);
      setSearchedHistory(null);
      setConfirmClearAll(false);
      setSummary(res.context_summary);
      setSuggestions(res.suggested_prompts || []);
      toast('Mentor chat history cleared.', 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to clear chat.', 'error');
    }
  };

  const handleDeleteDoubt = async (pair: MentorQAPair) => {
    try {
      const res = await api.clearMentorChat(pair.question_id);
      setMessages((prev) =>
        prev.filter((m) => m.id !== pair.question_id && (!pair.answer_id || m.id !== pair.answer_id)),
      );
      setQaHistory((prev) => prev.filter((p) => p.question_id !== pair.question_id));
      if (searchedHistory) {
        setSearchedHistory((prev) => (prev ? prev.filter((p) => p.question_id !== pair.question_id) : null));
      }
      setSummary(res.context_summary);
      toast('Removed saved doubt from history.', 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to remove saved doubt.', 'error');
    }
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard?.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  return (
    <div className="no-print">
      {/* Floating Launcher Trigger */}
      {!open && (
        <motion.button
          type="button"
          data-testid="chatbot-trigger"
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={reduced ? undefined : { y: -2 }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={SPRING_SNAPPY}
          onClick={() => setOpen(true)}
          aria-label="Open Personalized Mentor Chatbot"
          className="fixed bottom-6 right-6 z-40 h-12 px-5 rounded-full bg-ink text-canvas border border-border shadow-xl inline-flex items-center gap-2.5 text-sm font-medium cursor-pointer"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[#C9F45B] ring-1 ring-black/20" />
          <MessageSquare className="h-4 w-4" />
          <span>Ask Mentor</span>
        </motion.button>
      )}

      {/* Slide-Over Personalized Mentor Drawer (Text Output Only) */}
      <AnimatePresence>
        {open && (
          <motion.aside
            data-testid="chatbot-drawer"
            aria-label="Personalized Mentor Chatbot"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: MOTION_EASE }}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[440px] h-[min(680px,calc(100vh-3rem))] rounded-2xl border border-border bg-surface text-ink shadow-2xl flex flex-col overflow-hidden card-elevated"
          >
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-border bg-surface space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/20 shrink-0" />
                    <h3 className="font-display text-base font-medium truncate">SmartHire Mentor</h3>
                  </div>
                  <p className="text-xs text-ink-muted truncate">
                    Voice &amp; text doubt resolution · Saved history
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {messages.length > 0 && !confirmClearAll && (
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(true)}
                      aria-label="Clear conversation"
                      title="Clear all saved history"
                      className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (listening) stopVoice();
                      setConfirmClearAll(false);
                      setOpen(false);
                    }}
                    aria-label="Close mentor chatbot"
                    className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Chat vs Saved History Switcher */}
              <div className="flex items-center gap-1 rounded-xl bg-canvas p-1 border border-border">
                <button
                  type="button"
                  data-testid="chatbot-tab-chat"
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'chat'
                      ? 'bg-surface text-ink shadow-sm border border-border'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Chat</span>
                </button>
                <button
                  type="button"
                  data-testid="chatbot-tab-history"
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'history'
                      ? 'bg-surface text-ink shadow-sm border border-border'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  <span>Past Doubts ({qaHistory.length})</span>
                </button>
              </div>

              {confirmClearAll && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs">
                  <span className="text-ink font-medium">
                    Clear all {qaHistory.length} saved doubt{qaHistory.length === 1 ? '' : 's'}?
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="px-2.5 py-1 rounded-lg border border-border bg-surface text-ink-secondary hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Grounded Live Profile Context Strip */}
            {summary && (
              <div className="px-5 py-2 border-b border-border bg-canvas flex flex-wrap items-center gap-2 text-[11px] font-mono text-ink-secondary">
                <span className="px-2 py-0.5 rounded bg-surface border border-border text-ink truncate max-w-[180px]">
                  {summary.target_role}
                </span>
                <span className="px-2 py-0.5 rounded bg-surface border border-border">
                  {summary.has_resume ? `ATS ${summary.ats_score}%` : 'No resume'}
                </span>
                <span className="px-2 py-0.5 rounded bg-surface border border-border">
                  {summary.completed_sessions} session{summary.completed_sessions === 1 ? '' : 's'}
                </span>
              </div>
            )}

            {activeTab === 'history' ? (
              <div data-testid="chatbot-history-panel" className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    data-testid="chatbot-history-search"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                    placeholder="Search past questions or answers…"
                    className="w-full h-9 rounded-xl border border-border bg-canvas pl-8 pr-8 text-xs text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
                  />
                  {historyQuery && (
                    <button
                      type="button"
                      onClick={() => setHistoryQuery('')}
                      aria-label="Clear history search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {visibleHistoryItems.length === 0 ? (
                  <div className="py-10 text-center space-y-2 rounded-xl border border-dashed border-border bg-canvas/50 px-4">
                    <History className="h-5 w-5 text-ink-muted mx-auto" />
                    <p className="text-xs font-medium text-ink">
                      {historyQuery.trim() ? 'No past doubts match that keyword.' : 'No saved questions yet.'}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      Every question you ask is saved here so you can refer back anytime without re-asking.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {visibleHistoryItems.map((pair) => {
                      const isExpanded = expandedQuestionId === pair.question_id;
                      return (
                        <div
                          key={pair.question_id}
                          data-testid="chatbot-history-item"
                          className="rounded-xl border border-border bg-canvas overflow-hidden transition-colors hover:border-[var(--border-strong)]"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedQuestionId((prev) => (prev === pair.question_id ? null : pair.question_id))
                            }
                            className="w-full px-3.5 py-3 text-left flex items-start justify-between gap-2.5 cursor-pointer"
                          >
                            <div className="min-w-0 space-y-1">
                              <p className="text-xs font-medium text-ink line-clamp-2">{pair.question}</p>
                              <div className="flex items-center gap-2 text-[10px] font-mono text-ink-muted">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  {formatDoubtTimestamp(pair.created_at)}
                                </span>
                                <span>·</span>
                                <span>{pair.input_source === 'voice' ? 'Voice' : 'Text'}</span>
                              </div>
                            </div>
                            <span className="text-ink-muted shrink-0 mt-0.5">
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="px-3.5 pb-3.5 pt-2 border-t border-border/70 bg-surface space-y-3">
                              <FormattedBotText text={pair.answer} />
                              <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => jumpToSavedMessage(pair.question_id, pair.answer_id)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#C9F45B]/25 border border-[#C9F45B]/60 px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-[#C9F45B]/40 transition-colors"
                                  >
                                    <ArrowUpRight className="h-3 w-3" />
                                    Refer in chat
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDraft(pair.question);
                                      setActiveTab('chat');
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink-secondary hover:text-ink transition-colors"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Ask updated
                                  </button>
                                </div>

                                <div className="flex items-center gap-2 text-[11px] font-mono text-ink-muted">
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(pair.question_id, pair.answer)}
                                    className="inline-flex items-center gap-1 hover:text-ink transition-colors"
                                  >
                                    {copiedId === pair.question_id ? (
                                      <>
                                        <Check className="h-3 w-3 text-emerald-600" /> Copied
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3 w-3" /> Copy
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDoubt(pair)}
                                    aria-label="Delete saved doubt"
                                    title="Remove from history"
                                    className="p-1 rounded text-ink-muted hover:text-red-600 transition-colors"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Chat Feed */
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="py-6 space-y-5">
                    <div className="rounded-xl border border-border bg-canvas p-4 space-y-2">
                      <div className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">
                        PERSONALIZED ASSISTANT
                      </div>
                      <p className="text-sm text-ink leading-relaxed">
                        Ask any doubt by <strong>typing</strong> or clicking the <strong>mic</strong>. Every question and answer is automatically stored in <strong>Past Doubts</strong> so you can refer back anytime.
                      </p>
                    </div>

                    {suggestions.length > 0 && (
                      <div className="space-y-2">
                        <div className="font-mono text-[11px] text-ink-muted uppercase">Suggested Doubts</div>
                        <div className="flex flex-col gap-2">
                          {suggestions.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => handleSend(prompt, 'text')}
                              className="w-full text-left rounded-xl border border-border bg-canvas px-3.5 py-2.5 text-xs font-medium text-ink hover:border-ink transition-colors"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      ref={(el) => {
                        messageRefs.current[m.id] = el;
                      }}
                      data-testid={m.role === 'assistant' ? 'chatbot-bot-msg' : 'chatbot-user-msg'}
                      className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-4 py-3 transition-shadow ${
                          m.role === 'user'
                            ? 'bg-ink text-canvas rounded-br-sm text-sm'
                            : 'bg-canvas border border-border rounded-bl-sm'
                        } ${highlightedPair && (highlightedPair.qId === m.id || highlightedPair.aId === m.id) ? 'ring-2 ring-[#C9F45B]' : ''}`}
                      >
                        {m.role === 'user' ? (
                          <div className="space-y-1">
                            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                            <div className="flex items-center justify-end gap-2 font-mono text-[10px] opacity-70">
                              {m.input_source === 'voice' && (
                                <span className="inline-flex items-center gap-1">
                                  <Mic className="h-2.5 w-2.5" /> Voice
                                </span>
                              )}
                              <span>{formatDoubtTimestamp(m.created_at)}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <FormattedBotText text={m.content} />
                            <div className="pt-1.5 border-t border-border/60 flex items-center justify-between gap-2 text-[10px] font-mono text-ink-muted">
                              <span>
                                {m.provider} · {formatDoubtTimestamp(m.created_at)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(m.id, m.content)}
                                className="inline-flex items-center gap-1 hover:text-ink transition-colors"
                              >
                                {copiedId === m.id ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" /> Copy
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {sending && (
                  <div className="flex items-start">
                    <div className="rounded-2xl rounded-bl-sm bg-canvas border border-border px-4 py-3 text-xs font-mono text-ink-muted">
                      Thinking with your profile context…
                    </div>
                  </div>
                )}
                <div ref={listEndRef} />
              </div>
            )}

            {/* Voice + Text Input Composer */}
            <div className="p-4 border-t border-border bg-surface space-y-2.5">
              {similarPastDoubts.length > 0 && (
                <div
                  data-testid="chatbot-recall-banner"
                  className="rounded-xl border border-[#C9F45B]/70 bg-[#C9F45B]/15 px-3 py-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-ink">
                    <span className="font-semibold">Asked earlier · Refer old answer</span>
                    <span className="text-ink-muted">No need to re-ask</span>
                  </div>
                  <div className="space-y-1">
                    {similarPastDoubts.map((match) => (
                      <button
                        key={match.question_id}
                        type="button"
                        onClick={() => {
                          setDraft('');
                          jumpToSavedMessage(match.question_id, match.answer_id);
                        }}
                        className="w-full text-left rounded-lg bg-surface/90 hover:bg-surface border border-border px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs text-ink transition-colors cursor-pointer"
                      >
                        <span className="truncate">{match.question}</span>
                        <span className="shrink-0 font-mono text-[10px] text-ink-secondary inline-flex items-center gap-0.5">
                          View <ArrowUpRight className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {listening && (
                <div className="flex items-center justify-between rounded-lg bg-[#C9F45B]/20 border border-[#C9F45B]/50 px-3 py-1.5 text-xs text-ink">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    Listening — speak your doubt clearly
                  </span>
                  <button type="button" onClick={stopVoice} className="font-mono text-[11px] underline">
                    Stop
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  data-testid="chatbot-voice-btn"
                  onClick={toggleVoiceInput}
                  aria-label={listening ? 'Stop voice dictation' : 'Ask doubt using voice input'}
                  title={listening ? 'Stop voice input' : 'Dictate doubt with microphone'}
                  className={`h-11 w-11 rounded-xl border inline-flex items-center justify-center shrink-0 transition-colors ${
                    listening
                      ? 'bg-[#C9F45B] text-[#111111] border-[#111111]/20'
                      : 'bg-canvas text-ink-secondary border-border hover:text-ink hover:border-[var(--border-strong)]'
                  }`}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>

                <textarea
                  data-testid="chatbot-input"
                  rows={1}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (!listening) setInputSource('text');
                    if (activeTab !== 'chat') setActiveTab('chat');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask a doubt (text or mic)…"
                  className="flex-1 min-h-[44px] max-h-28 rounded-xl border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none resize-none"
                />

                <button
                  type="button"
                  data-testid="chatbot-send-btn"
                  disabled={!draft.trim() || sending}
                  onClick={() => handleSend()}
                  aria-label="Send question"
                  className="h-11 w-11 rounded-xl bg-[#C9F45B] text-[#111111] border border-[#111111]/15 inline-flex items-center justify-center shrink-0 disabled:opacity-45 hover:brightness-95 transition-all cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
