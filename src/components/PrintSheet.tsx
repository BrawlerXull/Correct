"use client";
// One-page A4 client sheet for makeup artists (and anyone who wants it on paper). Hidden on screen; shown only when printing.
import RichText from "./RichText";
import type { Plan } from "@/lib/rules";
import type { Product } from "@/lib/catalog";

type KitItem = { step: Plan["steps"][number]; product: Product; dE: number };

export default function PrintSheet({
  plan,
  photo,
  map,
  after,
  kit,
  summary,
  t,
}: {
  plan: Plan;
  photo: string;
  map: string | null;
  after: string | null;
  kit: KitItem[];
  summary: string | null;
  t: (s: string) => string;
}) {
  const p = plan.profile;
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const imgs = [
    ["Before", photo],
    ["Where to apply", map],
    ["Corrected look", after],
  ].filter(([, src]) => src) as [string, string][];
  return (
    <div className="print-only print-sheet text-ink text-[11pt] leading-snug">
      <div className="flex items-end justify-between border-b-2 border-ink pb-2">
        <div>
          <p className="font-serif text-[22pt] leading-none">Colour-correction client sheet</p>
          <p className="text-[9pt] mt-1">CORRECT · correct-youcam.vercel.app · {date}</p>
        </div>
        <div className="text-right text-[10pt]">
          <p>Client: ________________________</p>
          <p className="mt-2">Artist: ________________________</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: `repeat(${imgs.length}, 1fr)` }}>
        {imgs.map(([label, src]) => (
          <figure key={label}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label} className="w-full aspect-[3/4] object-cover rounded-md border border-ink/30" style={{ maxHeight: "72mm" }} />
            <figcaption className="text-[9pt] mt-0.5 text-center">{label}</figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="font-semibold text-[10pt] uppercase tracking-wider">Skin</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="inline-block h-5 w-5 rounded-full border border-ink/40" style={{ background: p.skinHex }} />
            {p.depthLabel} · {p.undertone} undertone · {p.skinHex.toUpperCase()}
            {p.fitzpatrick ? ` · Fitzpatrick ${p.fitzpatrick}` : ""}
          </p>
        </div>
        <div>
          <p className="font-semibold text-[10pt] uppercase tracking-wider">Concerns found</p>
          <p className="mt-1">
            {plan.concerns.map((c) => `${t(c.label)} (${c.severity === "none" ? "clear" : c.severity})`).join(" · ")}
          </p>
        </div>
      </div>

      <p className="mt-3 font-semibold text-[10pt] uppercase tracking-wider">Routine</p>
      <table className="mt-1 w-full border-collapse text-[10pt]">
        <thead>
          <tr className="text-left border-b border-ink">
            <th className="py-1 pr-2 w-6">#</th>
            <th className="py-1 pr-2">Step &amp; shade</th>
            <th className="py-1 pr-2">Where &amp; how</th>
            <th className="py-1">Product</th>
          </tr>
        </thead>
        <tbody>
          {kit.map(({ step, product }, i) => (
            <tr key={step.id} className="border-b border-ink/30 align-top">
              <td className="py-1.5 pr-2 font-semibold">{i + 1}</td>
              <td className="py-1.5 pr-2">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-4 w-4 shrink-0 rounded border border-ink/40" style={{ background: step.color }} />
                  <span className="font-semibold">{t(step.title)}</span>
                </span>
                <span className="block text-[9pt]">
                  {t(step.colorName)} · {step.color.toUpperCase()}
                </span>
              </td>
              <td className="py-1.5 pr-2">{t(step.where)}</td>
              <td className="py-1.5">
                {product.name}
                <span className="block text-[9pt]">Shade {product.shade}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[9pt]">
        Base coverage {plan.correctedCoverage}% (sheer) instead of {plan.heavyCoverage}% full coverage. Equivalent products from any brand work – match the shade family.
      </p>

      {summary && (
        <div className="mt-3">
          <p className="font-semibold text-[10pt] uppercase tracking-wider">Coach notes</p>
          <div className="mt-1 text-[10pt]">
            <RichText text={summary} />
          </div>
        </div>
      )}

      <div className="mt-3">
        <p className="font-semibold text-[10pt] uppercase tracking-wider">Artist notes</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-5 border-b border-ink/40" />
        ))}
      </div>
      <p className="mt-3 text-[8pt]">Skin analysis by YouCam Skin AI. Cosmetic guidance only – not a medical diagnosis. Patch-test new products.</p>
    </div>
  );
}
