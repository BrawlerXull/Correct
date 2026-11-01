"use client";
import { useRef, useState } from "react";

/** Before/after comparison. Drag, click, or use arrow keys (accessible slider). */
export default function CompareSlider({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div>
      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded-2xl select-none touch-none cursor-ew-resize bg-sand aspect-[3/4]"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && move(e.clientX)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before} alt={beforeLabel} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        </div>
        <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} aria-hidden>
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-10 rounded-full bg-white shadow-card grid place-items-center text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
            </svg>
          </div>
        </div>
        <span className="absolute left-3 top-3 chip !bg-white/90">{beforeLabel}</span>
        <span className="absolute right-3 top-3 chip !bg-white/90">{afterLabel}</span>
      </div>
      <label className="mt-3 flex items-center gap-3 text-xs text-muted">
        <span className="shrink-0">{beforeLabel}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(pos)}
          onChange={(e) => setPos(Number(e.target.value))}
          className="w-full accent-ink"
          aria-label={`Compare ${beforeLabel} and ${afterLabel}`}
          aria-valuetext={`${Math.round(pos)}% ${beforeLabel}`}
        />
        <span className="shrink-0">{afterLabel}</span>
      </label>
    </div>
  );
}
