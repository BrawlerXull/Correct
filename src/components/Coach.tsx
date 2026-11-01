"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "coach"; text: string };

const SUGGESTED = [
  "I have an outdoor wedding in daylight – what should I change?",
  "Can I put green corrector over active breakouts?",
  "How do I stop the corrector looking grey or orange?",
];

export default function Coach({ context, summary }: { context: unknown; summary: string | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (msgs.length) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const history = msgs;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const r = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, question, history }),
      });
      const j = await r.json();
      setMsgs((m) => [...m, { role: "coach", text: j.text || "Sorry – I couldn't answer that just now. Try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 md:p-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-rose-soft grid place-items-center font-serif text-rose-dark">C</div>
        <div>
          <p className="font-medium">Ask your colour-correction coach</p>
          <p className="text-xs text-muted">Answers are grounded in your scan, not generic advice · Gemini</p>
        </div>
      </div>
      <div className="mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {summary && <div className="rounded-2xl bg-sand px-4 py-3 text-sm leading-relaxed">{summary}</div>}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-w-[90%] ${m.role === "user" ? "bg-ink text-cream" : "bg-sand"}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="skeleton h-12 rounded-2xl w-2/3" />}
        <div ref={end} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <button key={s} className="chip hover:bg-sand text-left" onClick={() => ask(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about your plan…"
          className="flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
        <button className="btn-primary" disabled={busy || !q.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
