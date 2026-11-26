import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Copy, MessageSquare, Mic, MicOff, Send, Trash2, X } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import type { MentorContextSummary, MentorMessage } from '@/lib/types';
import { MOTION_EASE, SPRING_SNAPPY } from '@/motion/system';

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
  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [summary, setSummary] = useState<MentorContextSummary | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [inputSource, setInputSource] = useState<'text' | 'voice'>('text');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    api
      .getMentorChatHistory()
      .then((res) => {
        setMessages(res.messages || []);
        setSummary(res.context_summary || null);
        setSuggestions(res.suggested_prompts || []);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, [open, loaded]);

  useEffect(() => {
    if (open) {
      listEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [messages, open, sending, reduced]);

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
      setSummary(res.context_summary);
      setSuggestions(res.suggested_prompts || []);
      toast('Mentor chat history cleared.', 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to clear chat.', 'error');
    }
  };

  const handleCopy = (msg: MentorMessage) => {
    navigator.clipboard?.writeText(msg.content).then(() => {
      setCopiedId(msg.id);
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
            <div className="px-5 py-4 border-b border-border bg-surface flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#C9F45B] ring-1 ring-[#111111]/20 shrink-0" />
                  <h3 className="font-display text-base font-medium truncate">SmartHire Mentor</h3>
                </div>
                <p className="text-xs text-ink-muted truncate">
                  Voice &amp; text doubt resolution · Text responses only
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClear}
                    aria-label="Clear conversation"
                    title="Clear chat"
                    className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (listening) stopVoice();
                    setOpen(false);
                  }}
                  aria-label="Close mentor chatbot"
                  className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Grounded Live Profile Context Strip */}
            {summary && (
              <div className="px-5 py-2.5 border-b border-border bg-canvas flex flex-wrap items-center gap-2 text-[11px] font-mono text-ink-secondary">
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

            {/* Chat Feed */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.length === 0 ? (
                <div className="py-6 space-y-5">
                  <div className="rounded-xl border border-border bg-canvas p-4 space-y-2">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">
                      PERSONALIZED ASSISTANT
                    </div>
                    <p className="text-sm text-ink leading-relaxed">
                      Ask any doubt by <strong>typing</strong> or clicking the <strong>mic</strong>. I read your real SmartHire resume, target role, and interview scores to give tailored text guidance.
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
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3 ${
                        m.role === 'user'
                          ? 'bg-ink text-canvas rounded-br-sm text-sm'
                          : 'bg-canvas border border-border rounded-bl-sm'
                      }`}
                    >
                      {m.role === 'user' ? (
                        <div className="space-y-1">
                          <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                          {m.input_source === 'voice' && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] opacity-75">
                              <Mic className="h-2.5 w-2.5" /> Voice input
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <FormattedBotText text={m.content} />
                          <div className="pt-1.5 border-t border-border/60 flex items-center justify-between gap-2 text-[10px] font-mono text-ink-muted">
                            <span>{m.provider}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(m)}
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

            {/* Voice + Text Input Composer */}
            <div className="p-4 border-t border-border bg-surface space-y-2.5">
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
