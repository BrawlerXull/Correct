"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import RichText from "./RichText";

export type Msg = { role: "user" | "coach"; text: string; error?: boolean };

/** Shared coach state so the inline summary card and the drawer show the same conversation. */
export function useCoach(context: unknown) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const history = msgs;
      setMsgs((m) => [...m, { role: "user", text: q }]);
      setBusy(true);
      try {
        const r = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, question: q, history }),
        });
        const j = await r.json();
        setMsgs((m) => [...m, j.text ? { role: "coach", text: j.text } : { role: "coach", text: "Sorry – I couldn't answer just now. Please try again.", error: true }]);
      } catch {
        setMsgs((m) => [...m, { role: "coach", text: "Connection problem – please try again.", error: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, context]
  );
  const clear = () => setMsgs([]);
  return { msgs, busy, ask, clear };
}

const GENERAL_QS = ["What is colour correcting?", "Which corrector colour hides redness?", "Do I need a corrector if I wear foundation?"];
const PLAN_QS = ["Why were these shades picked for me?", "I have an outdoor wedding – what should I change?", "Can I use this over active breakouts?", "How do I stop the corrector looking grey or orange?"];

export function CoachAvatar({ size = 36 }: { size?: number }) {
  return (
    <span aria-hidden className="grid place-items-center rounded-full bg-gradient-to-br from-sage to-apricot text-white font-serif shrink-0" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      C
    </span>
  );
}

/** Floating launcher – always visible, bottom-right. */
export function CoachLauncher({ onOpen, hasPlan, unread }: { onOpen: () => void; hasPlan: boolean; unread: boolean }) {
  return (
    <button
      onClick={onOpen}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      className="fixed right-4 sm:right-5 z-40 flex items-center gap-3 rounded-full bg-ink text-cream pl-2 pr-4 sm:pr-5 py-2 shadow-xl hover:bg-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose/40 transition"
      aria-label={hasPlan ? "Ask the coach about your plan" : "Ask the colour-correction coach"}
    >
      <span className="relative">
        <CoachAvatar size={36} />
        {unread && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-rose ring-2 ring-ink" />}
      </span>
      <span className="text-left leading-tight">
        <span className="block text-sm font-medium">Ask the coach</span>
        <span className="hidden sm:block text-[11px] text-cream/70">{hasPlan ? "Questions about your plan" : "Colour-correction help"}</span>
      </span>
    </button>
  );
}

export default function CoachDrawer({
  open,
  onClose,
  coach,
  hasPlan,
  summary,
}: {
  open: boolean;
  onClose: () => void;
  coach: ReturnType<typeof useCoach>;
  hasPlan: boolean;
  summary: string | null;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [coach.msgs, coach.busy, open]);

  if (!open) return null;
  const suggestions = hasPlan ? PLAN_QS : GENERAL_QS;
  const send = () => {
    coach.ask(q);
    setQ("");
  };

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-title"
        className="absolute right-0 top-0 h-full w-full sm:w-[440px] bg-cream shadow-2xl flex flex-col sm:rounded-l-3xl"
      >
        <header className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-line" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}>
          <CoachAvatar size={40} />
          <div className="flex-1">
            <h2 id="coach-title" className="font-medium">
              CORRECT coach
            </h2>
            <p className="text-xs text-muted">{hasPlan ? "Knows your scan results and shades" : "General colour-correction help · scan for personal advice"}</p>
          </div>
          {coach.msgs.length > 0 && (
            <button onClick={coach.clear} className="text-xs text-muted underline-offset-2 hover:underline px-2 py-1">
              Clear
            </button>
          )}
          <button onClick={onClose} className="h-10 w-10 grid place-items-center rounded-full hover:bg-sand focus-visible:ring-2 focus-visible:ring-ink" aria-label="Close coach">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4" aria-live="polite" aria-busy={coach.busy}>
          {/* Welcome / summary */}
          <div className="flex gap-3">
            <CoachAvatar size={28} />
            <div className="rounded-2xl rounded-tl-sm bg-white border border-line px-4 py-3 text-[15px] text-ink/90 max-w-[85%]">
              {hasPlan && summary ? (
                <>
                  <p className="text-[11px] uppercase tracking-wider text-muted mb-2">Your plan in brief</p>
                  <RichText text={summary} />
                </>
              ) : hasPlan ? (
                <p>I’ve read your scan. Ask me anything about your shades, where to apply them, or how to adapt for an occasion.</p>
              ) : (
                <p>
                  Hi! I’m your colour-correction coach. Ask me anything – or <strong>upload a selfie or try a sample</strong> so I can give advice for <em>your</em> skin.
                </p>
              )}
            </div>
          </div>

          {coach.msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="rounded-2xl rounded-tr-sm bg-ink text-cream px-4 py-2.5 text-[15px] max-w-[85%] leading-relaxed">{m.text}</p>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <CoachAvatar size={28} />
                <div className={`rounded-2xl rounded-tl-sm border px-4 py-3 text-[15px] max-w-[85%] ${m.error ? "bg-rose-soft border-rose/30 text-rose-dark" : "bg-white border-line text-ink/90"}`}>
                  <RichText text={m.text} />
                </div>
              </div>
            )
          )}
          {coach.busy && (
            <div className="flex gap-3 items-center" role="status">
              <CoachAvatar size={28} />
              <span className="flex gap-1 rounded-2xl bg-white border border-line px-4 py-3" aria-label="Coach is typing">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-2 w-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />
                ))}
              </span>
            </div>
          )}
        </div>

        <footer className="border-t border-line px-4 sm:px-5 pt-3 bg-cream" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
          <p className="text-[11px] uppercase tracking-wider text-muted mb-2">Suggested questions</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {suggestions.map((s) => (
              <button key={s} onClick={() => coach.ask(s)} disabled={coach.busy} className="chip shrink-0 hover:bg-sand !py-1.5 disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label htmlFor="coach-input" className="sr-only">
              Your question
            </label>
            <textarea
              id="coach-input"
              ref={inputRef}
              rows={1}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type your question…"
              className="flex-1 resize-none rounded-2xl border border-line bg-white px-4 py-3 text-[15px] outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 max-h-32"
            />
            <button className="btn-primary !h-12 !px-5" disabled={coach.busy || !q.trim()} aria-label="Send question">
              Send
            </button>
          </form>
          <p className="mt-2 text-[11px] text-muted">Cosmetic advice only – not medical. Powered by Gemini.</p>
        </footer>
      </section>
    </div>
  );
}
