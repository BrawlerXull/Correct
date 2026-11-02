"use client";
// Guided selfie camera: runs on-device face detection on the live preview and coaches the user
// (distance, centring, head level, light) so the photo passes YouCam's HD skin-analysis checks first time.
import { useCallback, useEffect, useRef, useState } from "react";
import { getDetector } from "@/lib/prep";
import { usePrefs } from "@/lib/prefs";
import { playTip, stopSpeaking, ttsSupported, vibrate } from "@/lib/speech";

type Check = { id: string; ok: boolean; tip: string; label: string; voice?: string }; // voice = /public/voice/<id>.mp3

export default function CameraCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (b: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [ready, setReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [autoShoot, setAutoShoot] = useState(true);
  const goodSince = useRef<number | null>(null);
  const { prefs, set } = usePrefs();
  const voice = prefs.voiceTips;
  const [ttsOk, setTtsOk] = useState(false);
  useEffect(() => setTtsOk(ttsSupported()), []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0); // un-mirrored, full sensor resolution
    vibrate([40, 60, 40]);
    if (voice) playTip("captured");
    c.toBlob(
      (b) => {
        if (!b) return;
        stop();
        onCapture(b);
      },
      "image/jpeg",
      0.95
    );
  }, [onCapture, stop, voice]);

  // Start / stop camera.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setChecks([]);
    setReady(false);
    goodSince.current = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setReady(true);
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission was blocked. Allow camera access in your browser, or upload a photo instead."
            : name === "NotFoundError"
            ? "No camera found on this device. Please upload a photo instead."
            : "The camera couldn't start. Please upload a photo instead."
        );
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      stop();
    };
  }, [open, onClose, stop]);

  // Live guidance loop (~4 fps).
  useEffect(() => {
    if (!open || !ready) return;
    let alive = true;
    const probe = document.createElement("canvas");
    const tick = async () => {
      const v = videoRef.current;
      if (!alive || !v || !v.videoWidth) return;
      try {
        const det = await getDetector();
        const s = 480 / Math.max(v.videoWidth, v.videoHeight);
        probe.width = Math.round(v.videoWidth * s);
        probe.height = Math.round(v.videoHeight * s);
        const ctx = probe.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, probe.width, probe.height);
        const res = det.detect(probe);
        const faces = res.detections.filter((d) => d.boundingBox);
        const W = probe.width, H = probe.height;
        const out: Check[] = [];
        if (faces.length !== 1) {
          out.push({ id: "face", ok: false, label: "One face in view", tip: faces.length ? "Only one person in the frame, please." : "Look at the camera so we can see your face.", voice: faces.length ? "many-faces" : "no-face" });
        } else {
          const b = faces[0].boundingBox!;
          const frac = b.width / W;
          out.push({ id: "face", ok: true, label: "Face found", tip: "" });
          out.push({
            id: "dist",
            ok: frac >= 0.26 && frac <= 0.62,
            label: "Good distance",
            tip: frac < 0.26 ? "Move a little closer." : "Move back a little – keep your whole face in the oval.",
            voice: frac < 0.26 ? "closer" : "back",
          });
          const cx = (b.originX + b.width / 2) / W, cy = (b.originY + b.height / 2) / H;
          out.push({ id: "centre", ok: Math.abs(cx - 0.5) < 0.12 && Math.abs(cy - 0.46) < 0.16, label: "Centred", tip: "Centre your face in the oval.", voice: "centre" });
          const kp = faces[0].keypoints || [];
          if (kp.length >= 2) {
            const [r, l] = kp; // right eye, left eye (normalised)
            const angle = (Math.atan2((l.y - r.y) * H, (l.x - r.x) * W) * 180) / Math.PI;
            out.push({ id: "level", ok: Math.abs(angle) < 8 || Math.abs(Math.abs(angle) - 180) < 8, label: "Head level", tip: "Keep your head straight (don't tilt).", voice: "level" });
          }
          // Light: mean luminance inside the face box.
          const x0 = Math.max(0, Math.floor(b.originX)), y0 = Math.max(0, Math.floor(b.originY));
          const bw = Math.max(1, Math.min(W - x0, Math.floor(b.width))), bh = Math.max(1, Math.min(H - y0, Math.floor(b.height)));
          const px = ctx.getImageData(x0, y0, bw, bh).data;
          let sum = 0;
          for (let i = 0; i < px.length; i += 16) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
          const lum = sum / (px.length / 16);
          out.push({ id: "light", ok: lum > 85 && lum < 225, label: "Good light", tip: lum <= 85 ? "Too dark – face a window or a lamp." : "Too bright – step out of direct light.", voice: lum <= 85 ? "dark" : "bright" });
        }
        if (!alive) return;
        setChecks(out);
        const allOk = out.length >= 4 && out.every((c) => c.ok);
        if (allOk) {
          goodSince.current ??= Date.now();
        } else {
          goodSince.current = null;
          setCountdown(null);
        }
      } catch {
        /* detector unavailable – manual capture still works */
      }
      if (alive) setTimeout(tick, 250);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [open, ready]);

  // Auto-capture after holding a good pose for ~1.5s (3-2-1).
  useEffect(() => {
    if (!open || !ready || !autoShoot) return;
    const id = setInterval(() => {
      const since = goodSince.current;
      if (!since) return setCountdown(null);
      const left = 3 - Math.floor((Date.now() - since) / 500);
      if (left <= 0) {
        clearInterval(id);
        capture();
      } else setCountdown(left);
    }, 100);
    return () => clearInterval(id);
  }, [open, ready, autoShoot, capture]);

  const firstProblem = checks.find((c) => !c.ok);
  const allOk = checks.length >= 4 && !firstProblem;
  const spokenTip = !ready || error ? "" : allOk ? "hold" : firstProblem?.voice || "";

  // Spoken guidance: say each new tip once it has been stable for a moment; never repeat the same tip within 4 s.
  const lastSpoken = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  useEffect(() => {
    if (!open || !voice || !spokenTip) return;
    const id = setTimeout(() => {
      const now = Date.now();
      if (lastSpoken.current.text === spokenTip && now - lastSpoken.current.at < 4000) return;
      lastSpoken.current = { text: spokenTip, at: now };
      playTip(spokenTip);
    }, 700);
    return () => clearTimeout(id);
  }, [spokenTip, open, voice]);
  // A small buzz the moment everything lines up – feedback without looking at the screen.
  useEffect(() => {
    if (open && allOk) vibrate(30);
  }, [allOk, open]);
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="cam-title">
      <div className="relative w-full h-full sm:h-auto sm:max-w-[min(28rem,calc((100dvh-260px)*0.75))] bg-ink sm:rounded-3xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 text-cream" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}>
          <h2 id="cam-title" className="font-medium">
            Take your selfie
          </h2>
          {ttsOk && (
            <button
              onClick={() => {
                if (voice) stopSpeaking();
                set("voiceTips", !voice);
              }}
              aria-pressed={voice}
              className={`ml-auto mr-1 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${voice ? "bg-sage text-white" : "bg-white/10 text-cream hover:bg-white/20"}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                {voice ? <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" /> : <path d="M17 9l4 6M21 9l-4 6" />}
              </svg>
              {voice ? "Voice tips on" : "Voice tips off"}
            </button>
          )}
          <button onClick={onClose} className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/10" aria-label="Close camera">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="relative flex-1 sm:flex-none sm:aspect-[3/4] bg-black">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover -scale-x-100" aria-label="Camera preview" />
          {/* oval guide */}
          <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <mask id="hole">
                <rect width="300" height="400" fill="white" />
                <ellipse cx="150" cy="185" rx="92" ry="122" fill="black" />
              </mask>
            </defs>
            <rect width="300" height="400" fill="rgba(0,0,0,0.45)" mask="url(#hole)" />
            <ellipse cx="150" cy="185" rx="92" ry="122" fill="none" stroke={allOk ? "#8DB07A" : "white"} strokeWidth="3" strokeDasharray={allOk ? "0" : "8 6"} />
          </svg>
          {countdown !== null && allOk && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="font-serif text-7xl text-white drop-shadow">{countdown}</span>
            </div>
          )}
          {error && <div className="absolute inset-0 grid place-items-center p-6 text-center text-cream text-sm bg-ink/80">{error}</div>}
          {!ready && !error && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-cream/80 text-sm">
              Starting camera… If your browser asks, choose “Allow” to use the camera.
            </div>
          )}
        </div>

        <div className="px-4 pt-3 text-cream" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
          <p className="min-h-[24px] text-center font-medium" aria-live="polite">
            {error ? "" : !ready ? "" : allOk ? (autoShoot ? "Perfect – hold still…" : "Perfect – take the photo") : firstProblem?.tip || "Position your face in the oval"}
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-1.5" aria-label="Photo checks">
            {checks.map((c) => (
              <li key={c.id} className={`rounded-full px-2.5 py-1 text-[0.6875rem] ${c.ok ? "bg-sage/80 text-white" : "bg-white/10 text-cream/70"}`}>
                {c.ok ? "✓ " : "○ "}
                {c.label}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-cream/80">
              <input type="checkbox" checked={autoShoot} onChange={(e) => setAutoShoot(e.target.checked)} className="accent-sage" />
              Auto-capture
            </label>
            <button
              onClick={capture}
              disabled={!ready || !!error}
              className="h-16 w-16 rounded-full border-4 border-white bg-white/90 disabled:opacity-40 focus-visible:ring-4 focus-visible:ring-sage"
              aria-label="Take photo"
            />
            <span className="w-[92px] text-right text-[0.6875rem] text-cream/60">Nothing is saved</span>
          </div>
        </div>
      </div>
    </div>
  );
}
