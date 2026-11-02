"use client";
// Thin wrappers over the browser's built-in Web Speech API (no extra service, no cost, works offline on most devices).

export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Turn coach markdown-lite into something pleasant to listen to. */
export function plainForSpeech(md: string) {
  return md
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/#[0-9a-fA-F]{6}\b/g, "") // hex codes are noise when spoken
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\n+/g, ". ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

function pickVoice(bcp: string) {
  const voices = window.speechSynthesis.getVoices();
  const base = bcp.slice(0, 2);
  return voices.find((v) => v.lang === bcp) || voices.find((v) => v.lang.startsWith(base)) || null;
}

export function speak(text: string, bcp = "en-US", opts: { interrupt?: boolean; rate?: number; onEnd?: () => void } = {}) {
  if (!ttsSupported() || !text) return;
  const s = window.speechSynthesis;
  if (opts.interrupt !== false) s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp;
  const v = pickVoice(bcp);
  if (v) u.voice = v;
  u.rate = opts.rate ?? 1;
  if (opts.onEnd) {
    u.onend = opts.onEnd;
    u.onerror = opts.onEnd;
  }
  s.speak(u);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function getRecognizer(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
export type Recognizer = SR;

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
