"use client";
// Voice in and out.
// - Out: natural Gemini TTS voice (server, cached); falls back to the device voice only if that fails.
// - Camera tips: pre-recorded natural-voice clips in /public/voice (instant, offline-capable).
// - In: records a short clip with MediaRecorder and transcribes it server-side with Gemini, so it works in
//   Brave, Firefox and Safari too (the browser SpeechRecognition API only works in Chrome/Edge).

let current: HTMLAudioElement | null = null;
let currentAbort: AbortController | null = null;
let currentUrl: string | null = null;
const ttsCache = new Map<string, string>(); // text -> object URL (this session)

export const ttsSupported = () => typeof window !== "undefined" && typeof Audio !== "undefined";

/** Turn coach markdown-lite into something pleasant to listen to. */
export function plainForSpeech(md: string) {
  return md
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\(?\s*#[0-9a-fA-F]{6}\b\s*\)?/g, "") // hex codes are noise when spoken
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.])/g, "$1")
    .replace(/([^.!?:])\n+/g, "$1.\n")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function stopSpeaking() {
  currentAbort?.abort();
  currentAbort = null;
  if (current) {
    current.onended = null;
    current.onerror = null;
    current.pause();
    current = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function deviceVoice(text: string, bcp: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) return onEnd?.();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp;
  const voices = window.speechSynthesis.getVoices();
  // Prefer the higher-quality voices when the device has them.
  const good = voices.filter((v) => v.lang.startsWith(bcp.slice(0, 2)));
  u.voice = good.find((v) => /natural|neural|premium|enhanced|google|samantha/i.test(v.name)) || good[0] || null;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

/**
 * Read text aloud in a natural voice. Callbacks: onLoading (fetching audio), onStart, onEnd (finished, stopped or failed).
 * Gemini TTS detects the language from the text, so answers in Hindi/Spanish/etc. are read in that language.
 */
export async function speakNatural(text: string, bcp = "en-US", cb: { onLoading?: () => void; onStart?: () => void; onEnd?: () => void } = {}) {
  stopSpeaking();
  if (!text) return cb.onEnd?.();
  const abort = new AbortController();
  currentAbort = abort;
  try {
    let url = ttsCache.get(text);
    if (!url) {
      cb.onLoading?.();
      const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: abort.signal });
      if (!r.ok) throw new Error(await r.text());
      url = URL.createObjectURL(await r.blob());
      ttsCache.set(text, url);
    }
    if (abort.signal.aborted) return;
    const a = new Audio(url);
    current = a;
    a.onended = () => {
      if (current === a) current = null;
      cb.onEnd?.();
    };
    a.onerror = () => cb.onEnd?.();
    await a.play();
    cb.onStart?.();
  } catch (e) {
    if (abort.signal.aborted) return cb.onEnd?.();
    // Natural voice unavailable (offline / quota): fall back to the device voice rather than staying silent.
    cb.onStart?.();
    deviceVoice(text, bcp, cb.onEnd);
    console.warn("Natural voice unavailable, using device voice:", e);
  }
}

/** Camera guidance: pre-recorded natural-voice clips. Interrupts the previous tip. */
export function playTip(id: string) {
  if (typeof Audio === "undefined") return;
  if (current) current.pause();
  if (currentUrl !== id || !current) currentUrl = id;
  const a = new Audio(`/voice/${id}.mp3`);
  current = a;
  a.play().catch(() => {});
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

export const recordingSupported = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

/**
 * Record a voice question. Stops automatically after ~1.4 s of silence (once speech was heard), or after 25 s.
 * Returns { done: Promise<Blob|null>, stop(), level(): 0..1 for a live meter }.
 */
export async function recordQuestion() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let lvl = 0;
  let heard = false;
  let quietSince = Date.now();
  const startedAt = Date.now();

  const done = new Promise<Blob | null>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      resolve(heard && chunks.length ? new Blob(chunks, { type: rec.mimeType || "audio/webm" }) : null);
    };
  });

  const timer = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    lvl = Math.min(1, rms * 12);
    const now = Date.now();
    if (rms > 0.02) {
      heard = true;
      quietSince = now;
    }
    const silentFor = now - quietSince;
    if ((heard && silentFor > 1400) || now - startedAt > 25000 || (!heard && now - startedAt > 8000)) stop();
  }, 80);

  function stop() {
    clearInterval(timer);
    if (rec.state !== "inactive") rec.stop();
  }
  rec.start(250);
  return { done, stop, level: () => lvl };
}
