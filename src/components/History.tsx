"use client";
// "My scans over time" – compares the latest scan with the previous one, per concern. Data never leaves the device.
import type { ScanEntry } from "@/lib/history";

const LABEL: Record<string, string> = { hd_redness: "Redness", hd_dark_circle: "Dark circles", hd_age_spot: "Dark spots", hd_acne: "Blemishes" };
const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function History({ list, currentId, onDelete, onClear }: { list: ScanEntry[]; currentId: string | null; onDelete: (id: string) => void; onClear: () => void }) {
  if (!list.length) return null;
  const cur = list.find((e) => e.id === currentId) || list[0];
  const prev = list.find((e) => e.at < cur.at);
  return (
    <section aria-labelledby="hist-title" className="card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">My scans over time</p>
          <h3 id="hist-title" className="font-serif text-2xl mt-1">
            {prev ? `Compared with ${fmt(prev.at)}` : "Saved – scan again later to see changes"}
          </h3>
          <p className="text-sm text-muted mt-1">
            Kept only in this browser. Useful when trying a new skincare product: scan in similar light every week or two.
          </p>
        </div>
        <button onClick={onClear} className="text-xs text-muted underline underline-offset-2 hover:text-ink px-1 py-1">
          Delete all saved scans
        </button>
      </div>

      {prev && (
        <ul className="mt-4 grid sm:grid-cols-2 gap-2">
          {Object.keys(LABEL)
            .filter((k) => cur.scores[k] !== undefined && prev.scores[k] !== undefined)
            .map((k) => {
              const d = cur.scores[k] - prev.scores[k]; // ui_score: higher = healthier
              const tone = Math.abs(d) < 3 ? "text-muted" : d > 0 ? "text-[#3F6B39]" : "text-rose-dark";
              const word = Math.abs(d) < 3 ? "About the same" : d > 0 ? "Calmer than last time" : "More visible than last time";
              return (
                <li key={k} className="flex items-center justify-between gap-3 rounded-xl bg-sand/60 px-3 py-2.5 text-sm">
                  <span className="font-medium">{LABEL[k]}</span>
                  <span className={`text-right ${tone}`}>
                    <span className="block font-medium">{word}</span>
                    <span className="block text-xs">
                      score {prev.scores[k]} → {cur.scores[k]} {Math.abs(d) >= 3 ? `(${d > 0 ? "+" : ""}${d})` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
        </ul>
      )}

      <ol className="mt-4 flex gap-3 overflow-x-auto pb-1" aria-label="Saved scans">
        {list.map((e) => (
          <li key={e.id} className={`shrink-0 w-24 text-center ${e.id === cur.id ? "" : "opacity-80"}`}>
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.thumb} alt={`Scan from ${fmt(e.at)}`} className={`w-24 aspect-[3/4] object-cover rounded-lg border-2 ${e.id === cur.id ? "border-ink" : "border-transparent"}`} />
              <button
                onClick={() => onDelete(e.id)}
                className="absolute right-1 top-1 h-7 w-7 grid place-items-center rounded-full bg-white/90 text-ink text-xs hover:bg-white"
                aria-label={`Delete scan from ${fmt(e.at)}`}
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-[0.6875rem] text-muted">{e.id === cur.id ? "This scan" : fmt(e.at)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[0.6875rem] text-muted">Scores come from YouCam Skin Analysis (higher = calmer skin). Lighting changes scores a little, so look at trends, not single points.</p>
    </section>
  );
}
