"use client";
// "Language & accessibility" panel: language, text size, contrast and voice options in one place.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LANGS, langInfo, usePrefs } from "@/lib/prefs";
import { ttsSupported } from "@/lib/speech";

export function SettingsButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { prefs } = usePrefs();
  return (
    <>
      <button onClick={() => setOpen(true)} className={`btn-ghost !py-2 !px-3 ${className}`} aria-label="Language and accessibility settings" aria-haspopup="dialog">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
        </svg>
        <span className="text-xs font-semibold uppercase">{prefs.lang}</span>
        <span className="hidden xl:inline text-xs">· Aa</span>
      </button>
      {/* Portal: the sticky header uses backdrop-blur, which would otherwise trap this fixed overlay inside the header. */}
      {open && createPortal(<SettingsDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Toggle({ label, sub, checked, onChange, disabled }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-4 py-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span>
        <span className="block font-medium text-[0.9375rem]">{label}</span>
        {sub && <span className="block text-xs text-muted mt-0.5">{sub}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-4 peer-focus-visible:ring-rose/40 ${checked ? "bg-sage" : "bg-line"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} />
      </span>
    </label>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { prefs, set } = usePrefs();
  const ref = useRef<HTMLDivElement>(null);
  const tts = ttsSupported();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("select")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative w-full sm:max-w-md bg-cream rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 max-h-[92dvh] overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="font-serif text-2xl">
            Language &amp; accessibility
          </h2>
          <button onClick={onClose} className="h-10 w-10 grid place-items-center rounded-full hover:bg-sand" aria-label="Close settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-muted mt-1">Saved on this device only.</p>

        <div className="mt-5">
          <label htmlFor="lang" className="block font-medium text-[0.9375rem]">
            Coach &amp; routine language
          </label>
          <p className="text-xs text-muted mt-0.5">The coach answers, your routine and the read-aloud voice use this language.</p>
          <select
            id="lang"
            value={prefs.lang}
            onChange={(e) => set("lang", e.target.value as typeof prefs.lang)}
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-[0.9375rem] focus:border-ink focus:ring-2 focus:ring-ink/10 outline-none"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="mt-6">
          <legend className="font-medium text-[0.9375rem]">Text size</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                ["normal", "Default", "text-sm"],
                ["large", "Large", "text-base"],
                ["xl", "Extra large", "text-lg"],
              ] as const
            ).map(([v, l, cls]) => (
              <button
                key={v}
                onClick={() => set("textSize", v)}
                aria-pressed={prefs.textSize === v}
                className={`rounded-xl border px-2 py-3 ${cls} ${prefs.textSize === v ? "bg-ink text-cream border-ink" : "bg-white border-line hover:bg-sand"}`}
              >
                <span className="block font-serif">Aa</span>
                <span className="block text-[0.6875rem] mt-0.5">{l}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 divide-y divide-line">
          <Toggle label="High contrast" sub="Darker text and stronger outlines." checked={prefs.contrast === "high"} onChange={(v) => set("contrast", v ? "high" : "normal")} />
          <Toggle
            label="Spoken selfie guidance"
            sub={tts ? "A natural voice says each tip out loud, so you don’t need to look at the screen." : "Not supported in this browser."}
            checked={prefs.voiceTips}
            disabled={!tts}
            onChange={(v) => set("voiceTips", v)}
          />
          <Toggle
            label="Read coach answers aloud"
            sub={tts ? `Natural AI voice, in ${langInfo(prefs.lang).label}. You can also tap “Listen” on any answer.` : "Not supported in this browser."}
            checked={prefs.autoRead}
            disabled={!tts}
            onChange={(v) => set("autoRead", v)}
          />
        </div>

        <button onClick={onClose} className="btn-primary w-full !py-3 mt-5">
          Done
        </button>
      </div>
    </div>
  );
}
