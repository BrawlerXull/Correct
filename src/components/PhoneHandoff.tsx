"use client";
// "Continue on your phone": laptop webcams are often low-res and badly lit, so desktop users can scan a QR code
// that opens CORRECT on their phone with the guided camera already open.
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function usePhoneHandoffVisible() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Only on mouse/trackpad devices – on a phone you're already there.
    setShow(window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(display-mode: standalone)").matches);
  }, []);
  return show;
}

export function PhoneHandoffDialog({ onClose }: { onClose: () => void }) {
  const [svg, setSvg] = useState<string>("");
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const u = `${window.location.origin}/?start=camera`;
    setUrl(u);
    QRCode.toString(u, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#2A2320", light: "#FFFFFF" } }).then(setSvg);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="handoff-title" className="relative w-full max-w-sm bg-cream rounded-3xl shadow-2xl p-6 text-center">
        <button onClick={onClose} className="absolute right-3 top-3 h-10 w-10 grid place-items-center rounded-full hover:bg-sand" aria-label="Close" autoFocus>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 id="handoff-title" className="font-serif text-2xl">
          Use your phone’s camera
        </h2>
        <p className="mt-1 text-sm text-muted">Phone cameras capture skin far better than most laptop webcams.</p>
        <div className="mx-auto mt-5 w-56 rounded-2xl bg-white p-3 border border-line" role="img" aria-label="QR code that opens CORRECT on your phone">
          {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="aspect-square skeleton rounded-lg" />}
        </div>
        <ol className="mt-5 space-y-1.5 text-left text-sm text-ink/80">
          <li>1. Open your phone’s camera and point it at the code.</li>
          <li>2. Tap the link – the guided selfie opens straight away.</li>
          <li>3. Your results stay on your phone.</li>
        </ol>
        <button
          className="btn-ghost w-full mt-5 !py-2.5"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Link copied ✓" : "Copy link instead"}
        </button>
      </div>
    </div>
  );
}
