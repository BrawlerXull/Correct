"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CompareSlider from "@/components/CompareSlider";
import Coach from "@/components/Coach";
import { dabMap, measure, Metrics, normalisePhoto, Zones, zonesFromMasks } from "@/lib/measure";
import { closest, deltaE2000 } from "@/lib/catalog";
import { hexToLab } from "@/lib/color";
import type { Analysis, SampleBundle } from "@/lib/types";

type Phase = "idle" | "analyzing" | "analyzed" | "rendering" | "done";
type View = "photo" | "dab" | "hd_redness" | "hd_dark_circle" | "hd_age_spot" | "hd_acne";

const SAMPLES = [
  { id: "redness", label: "Redness-prone", blurb: "Flushed cheeks & nose" },
  { id: "undereye", label: "Dark circles", blurb: "Blue-violet under-eye" },
  { id: "spots", label: "Blemishes & marks", blurb: "Post-acne marks, deep skin" },
];

const CONCERN_LABEL: Record<string, string> = {
  hd_redness: "Redness",
  hd_dark_circle: "Dark circles",
  hd_age_spot: "Dark spots",
  hd_acne: "Blemishes",
};
const SEV_STYLE: Record<string, string> = {
  none: "bg-sage-soft text-sage",
  mild: "bg-apricot-soft text-apricot",
  moderate: "bg-apricot-soft text-[#B5672F]",
  strong: "bg-rose-soft text-rose-dark",
};

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [zones, setZones] = useState<Zones | null>(null);
  const [dab, setDab] = useState<string | null>(null);
  const [view, setView] = useState<View>("dab");
  const [heavy, setHeavy] = useState<string | null>(null);
  const [steps, setSteps] = useState<(string | null)[]>([]);
  const [metrics, setMetrics] = useState<{ bare: Metrics; heavy: Metrics; correct: Metrics } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [sample, setSample] = useState<SampleBundle | null>(null);
  const [status, setStatus] = useState<string>("");
  const [bagged, setBagged] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);

  const plan = analysis?.plan;

  const reset = () => {
    setError(null);
    setAnalysis(null);
    setZones(null);
    setDab(null);
    setHeavy(null);
    setSteps([]);
    setMetrics(null);
    setSummary(null);
    setSample(null);
    setBagged(false);
    setView("dab");
  };

  // After analysis: decode masks, draw the dab map, fetch the coach summary.
  useEffect(() => {
    if (!analysis || !photo) return;
    let cancelled = false;
    (async () => {
      const z = await zonesFromMasks(analysis.masks);
      if (cancelled || !z) return;
      setZones(z);
      const green = analysis.plan.steps.find((s) => s.id === "green")?.color;
      const warm = analysis.plan.steps.find((s) => s.id === "peach")?.color;
      setDab(await dabMap(photo, z, { green, warm }));
    })();
    return () => {
      cancelled = true;
    };
  }, [analysis, photo]);

  const coachContext = useMemo(() => {
    if (!plan || !analysis) return null;
    return {
      skin: { hex: plan.profile.skinHex, depth: plan.profile.depthLabel, undertone: plan.profile.undertone, ITA_degrees: plan.profile.ita },
      youcam_scores_higher_is_healthier: analysis.scores,
      concerns: plan.concerns.map((c) => `${c.label}: ${c.severity}`),
      plan: plan.steps.map((s) => ({ step: s.title, shade: `${s.colorName} ${s.color}`, where: s.where })),
      base_coverage_percent: plan.correctedCoverage,
      measured_result: metrics
        ? {
            redness_a_star: { bare: metrics.bare.rednessA, full_coverage_foundation: metrics.heavy.rednessA, correct_method: metrics.correct.rednessA },
            visibility_deltaE_vs_surrounding_skin_lower_is_better: { bare: metrics.bare.visibility, full_coverage_foundation: metrics.heavy.visibility, correct_method: metrics.correct.visibility },
          }
        : "not rendered yet",
    };
  }, [plan, analysis, metrics]);

  useEffect(() => {
    if (!coachContext || summary !== null) return;
    setSummary("");
    postJSON<{ text: string | null }>("/api/coach", { context: coachContext })
      .then((j) => setSummary(j.text || null))
      .catch(() => setSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachContext]);

  async function runAnalysis(file: File | Blob) {
    reset();
    setPhase("analyzing");
    try {
      setStatus("Preparing photo");
      const { dataUrl, blob } = await normalisePhoto(file);
      setPhoto(dataUrl);
      setStatus("YouCam Skin Analysis (redness, dark circles, spots, blemishes) + Skin Tone Analysis");
      const fd = new FormData();
      fd.append("image", blob, "selfie.jpg");
      const r = await fetch("/api/analyze", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Analysis failed");
      setAnalysis(j);
      setPhase("analyzed");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  async function loadSample(id: string) {
    reset();
    setPhase("analyzing");
    setStatus("Loading pre-computed YouCam results");
    try {
      const b: SampleBundle = await (await fetch(`/samples/${id}/bundle.json`)).json();
      setSample(b);
      setPhoto(b.photo);
      setAnalysis(b.analysis);
      setPhase("analyzed");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setError("Sample not available");
      setPhase("idle");
    }
  }

  const finishMeasure = useCallback(
    async (heavyImg: string, finalImg: string) => {
      if (!zones || !photo) return;
      const [bare, h, c] = await Promise.all([measure(photo, zones), measure(heavyImg, zones), measure(finalImg, zones)]);
      setMetrics({ bare, heavy: h, correct: c });
    },
    [zones, photo]
  );

  async function runRenders() {
    if (!plan || !photo) return;
    setPhase("rendering");
    setError(null);
    setTimeout(() => renderRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    if (sample) {
      // Pre-computed renders: reveal progressively so the flow reads the same as live mode.
      setSteps(plan.steps.map(() => null));
      setHeavy(sample.heavy);
      for (let i = 0; i < sample.steps.length; i++) {
        await new Promise((r) => setTimeout(r, 450));
        setSteps((s) => s.map((v, k) => (k === i ? sample.steps[i] : v)));
      }
      await finishMeasure(sample.heavy, sample.steps[sample.steps.length - 1]);
      setPhase("done");
      return;
    }
    try {
      setSteps(plan.steps.map(() => null));
      const keyBase = photo.length + ":" + photo.slice(-64);
      const heavyP = postJSON<{ dataUrl: string }>("/api/render", { image: photo, effects: plan.heavyEffects, key: keyBase + "heavy" }).then((r) => {
        setHeavy(r.dataUrl);
        return r.dataUrl;
      });
      let prevUrl: string | null = null;
      let last = "";
      for (let i = 0; i < plan.steps.length; i++) {
        const chainKey = keyBase + JSON.stringify(plan.steps.slice(0, i + 1).map((s) => s.effects));
        const r: { url: string; dataUrl: string } = await postJSON("/api/render", {
          ...(prevUrl ? { srcUrl: prevUrl } : { image: photo }),
          effects: plan.steps[i].effects,
          key: chainKey,
        });
        prevUrl = r.url;
        last = r.dataUrl;
        setSteps((s) => s.map((v, k) => (k === i ? r.dataUrl : v)));
      }
      const h = await heavyP;
      await finishMeasure(h, last);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("analyzed");
    }
  }

  const finalImg = steps.length ? steps[steps.length - 1] : null;

  const kit = useMemo(() => {
    if (!plan) return [];
    return plan.steps.map((s) => {
      const kind = s.id === "green" ? "green-corrector" : s.id === "peach" ? "warm-corrector" : "skin-tint";
      const m = closest(kind, s.matchHex);
      return { step: s, ...m };
    });
  }, [plan]);

  const tintMatch = useMemo(() => {
    if (!plan) return null;
    return deltaE2000(hexToLab(plan.profile.skinHex), hexToLab(plan.foundationHex));
  }, [plan]);

  const viewImage = view === "photo" ? photo : view === "dab" ? dab : photo;
  const overlay = view !== "photo" && view !== "dab" ? analysis?.masks[view] : null;

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="mx-auto max-w-6xl px-5 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-serif text-2xl tracking-tight">correct</span>
          <span className="h-2 w-2 rounded-full bg-sage" />
          <span className="h-2 w-2 rounded-full bg-apricot -ml-1" />
        </div>
        <span className="text-xs text-muted hidden sm:block">Powered by YouCam Skin AI + Makeup VTO</span>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pt-10 pb-12 grid md:grid-cols-[1.15fr_1fr] gap-10 items-center">
        <div>
          <p className="eyebrow">Colour-correction coach</p>
          <h1 className="font-serif text-4xl md:text-6xl leading-[1.05] mt-3">
            Cancel the colour,
            <br />
            <span className="italic text-rose">not your skin.</span>
          </h1>
          <p className="mt-5 text-lg text-muted max-w-xl leading-relaxed">
            Redness, dark circles and dark spots don’t need more foundation – they need the <em>opposite colour</em>. CORRECT maps exactly where your skin needs it,
            picks the corrector shade for your depth and undertone, and shows the result on your own face.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 items-center">
            <button className="btn-primary !px-6 !py-3" onClick={() => fileRef.current?.click()} disabled={phase === "analyzing" || phase === "rendering"}>
              Upload a selfie
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) runAnalysis(f);
                e.target.value = "";
              }}
            />
            <span className="text-sm text-muted">or try a sample:</span>
            {SAMPLES.map((s) => (
              <button key={s.id} className="chip hover:bg-sand" onClick={() => loadSample(s.id)} disabled={phase === "analyzing" || phase === "rendering"}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted max-w-md">
            Front-facing, bare skin, even light. Photos are sent to YouCam for analysis and not stored by CORRECT. Cosmetic guidance – not a medical diagnosis.
          </p>
          {error && <p className="mt-4 rounded-xl bg-rose-soft text-rose-dark px-4 py-3 text-sm">{error}</p>}
        </div>
        <div className="relative">
          <ColourWheel />
        </div>
      </section>

      {phase === "analyzing" && (
        <section className="mx-auto max-w-6xl px-5 pb-16">
          <div className="card p-6 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full border-2 border-line border-t-rose animate-spin" />
            <div>
              <p className="font-medium">Reading your skin…</p>
              <p className="text-sm text-muted">{status}</p>
            </div>
          </div>
        </section>
      )}

      {analysis && plan && photo && (
        <>
          {/* STEP 1 – what the scan found */}
          <section ref={resultsRef} className="mx-auto max-w-6xl px-5 pb-14 scroll-mt-6">
            <StepHeader n={1} title="Where your skin needs colour correction" sub="YouCam Skin Analysis masks, decoded into a dab map in your corrector shades." />
            {sample && <p className="mb-4 text-xs text-muted">Sample mode: these are real YouCam API results, pre-computed for an AI-generated face so you can explore without a photo.</p>}
            <div className="grid md:grid-cols-[1fr_1.1fr] gap-6">
              <div className="card p-3">
                <div className="relative overflow-hidden rounded-xl bg-sand aspect-[3/4]">
                  {viewImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={viewImage} alt="analysis view" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 skeleton" />
                  )}
                  {overlay && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={overlay} alt="mask" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2 p-2 pt-3">
                  {(["dab", "photo", ...Object.keys(analysis.masks)] as View[]).map((v) => (
                    <button key={v} onClick={() => setView(v)} className={`chip ${view === v ? "!bg-ink !text-cream !border-ink" : "hover:bg-sand"}`}>
                      {v === "dab" ? "Dab map" : v === "photo" ? "Photo" : CONCERN_LABEL[v]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <div className="card p-5">
                  <p className="eyebrow">Your skin, measured</p>
                  <div className="mt-3 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full border border-line" style={{ background: plan.profile.skinHex }} />
                    <div className="text-sm">
                      <p className="font-medium text-base">
                        {plan.profile.depthLabel} · {plan.profile.undertone} undertone
                      </p>
                      <p className="text-muted">
                        Skin {plan.profile.skinHex} · ITA {plan.profile.ita}° · L* {plan.profile.lab.L.toFixed(0)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {plan.concerns.map((c) => (
                      <div key={c.key} className="text-sm">
                        <div className="flex justify-between items-center">
                          <span>{c.label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SEV_STYLE[c.severity]}`}>
                            {c.severity === "none" ? "clear" : c.severity}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-sand overflow-hidden">
                          <div className="h-full rounded-full bg-ink/70" style={{ width: `${100 - c.ui}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-muted">Bar = how much YouCam detected (100 − score). Scores ≥ 85 are treated as clear.</p>
                </div>

                <div className="card p-5">
                  <p className="eyebrow">Your correction plan</p>
                  <ol className="mt-3 space-y-4">
                    {plan.steps.map((s, i) => (
                      <li key={s.id} className="flex gap-4">
                        <div className="shrink-0 flex flex-col items-center">
                          <div className="h-10 w-10 rounded-full border border-line shadow-inner" style={{ background: s.color }} />
                          <span className="text-[10px] text-muted mt-1">{s.color}</span>
                        </div>
                        <div className="text-sm">
                          <p className="font-medium">
                            {i + 1}. {s.title} <span className="text-muted font-normal">– {s.colorName}</span>
                          </p>
                          <p className="text-muted mt-1 leading-relaxed">{s.why}</p>
                          <p className="mt-1 leading-relaxed">
                            <span className="font-medium">Where:</span> {s.where}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {phase === "analyzed" && (
                    <button className="btn-primary w-full mt-5 !py-3" onClick={runRenders}>
                      See it on my face →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* STEP 2 – renders */}
          {(phase === "rendering" || phase === "done") && (
            <section ref={renderRef} className="mx-auto max-w-6xl px-5 pb-14 scroll-mt-6">
              <StepHeader
                n={2}
                title="The usual fix vs. the correct fix"
                sub="Both rendered on your photo with YouCam Makeup VTO. The CORRECT version is chained: each layer is applied on top of the previous result."
              />
              <div className="grid md:grid-cols-3 gap-4">
                <Panel label="Bare skin" img={photo} />
                <Panel label={`Full-coverage foundation · ${plan.heavyCoverage}%`} img={heavy} tone="muted" />
                <Panel label={`CORRECT · corrector + ${plan.correctedCoverage}% tint`} img={finalImg} tone="accent" />
              </div>

              <div className="mt-5 card p-4">
                <p className="eyebrow mb-3">Layer by layer</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Thumb label="0 · Bare" img={photo} />
                  {plan.steps.map((s, i) => (
                    <Thumb key={s.id} label={`${i + 1} · ${s.title}`} img={steps[i]} swatch={s.color} />
                  ))}
                </div>
              </div>

              {phase === "done" && finalImg && (
                <div className="mt-6 grid md:grid-cols-[1fr_1fr] gap-6 items-start">
                  <CompareSlider before={photo} after={finalImg} beforeLabel="Before" afterLabel="CORRECT" />
                  <div className="space-y-5">
                    <MetricsCard metrics={metrics} plan={plan} />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* STEP 3 – kit + coach */}
          <section className="mx-auto max-w-6xl px-5 pb-20">
            <StepHeader n={phase === "done" || phase === "rendering" ? 3 : 2} title="Your kit & coach" sub="Shades matched from the store catalogue by CIEDE2000 colour distance." />
            <div className="grid md:grid-cols-[1fr_1.1fr] gap-6 items-start">
              <div className="card p-5">
                <ul className="divide-y divide-line">
                  {kit.map(({ step, product, dE }) => (
                    <li key={product.sku} className="py-3 flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl border border-line" style={{ background: product.hex }} />
                      <div className="flex-1 text-sm">
                        <p className="font-medium">{product.name}</p>
                        <p className="text-muted">
                          {product.shade} · {product.size} · for “{step.title.toLowerCase()}”
                        </p>
                        <p className="text-[11px] text-muted">ΔE2000 to your target shade: {dE.toFixed(1)} {dE < 3 ? "(near-invisible difference)" : dE < 6 ? "(close match)" : "(nearest available)"}</p>
                      </div>
                      <span className="font-medium">${product.price}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted">
                    {kit.length} items · ${kit.reduce((a, k) => a + k.product.price, 0)}
                  </p>
                  <button className="btn-primary" onClick={() => setBagged(true)}>
                    {bagged ? "Added ✓" : "Add kit to bag"}
                  </button>
                </div>
                {tintMatch !== null && <p className="mt-3 text-[11px] text-muted">Tint target is your measured skin colour lifted 6% (camera samples read slightly dark).</p>}
              </div>
              {coachContext && <Coach context={coachContext} summary={summary || null} />}
            </div>
          </section>
        </>
      )}

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        CORRECT · built on Perfect Corp YouCam APIs (Skin Analysis, Skin Tone Analysis, Makeup VTO) and Gemini · cosmetic guidance only, not medical advice
      </footer>
    </main>
  );
}

function StepHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-6 flex items-start gap-4">
      <span className="font-serif text-3xl text-rose leading-none">{String(n).padStart(2, "0")}</span>
      <div>
        <h2 className="font-serif text-2xl md:text-3xl leading-tight">{title}</h2>
        <p className="text-sm text-muted mt-1">{sub}</p>
      </div>
    </div>
  );
}

function Panel({ label, img, tone }: { label: string; img: string | null; tone?: "muted" | "accent" }) {
  return (
    <figure className={`card p-2 ${tone === "accent" ? "ring-2 ring-sage/60" : ""}`}>
      <div className="relative overflow-hidden rounded-xl bg-sand aspect-[3/4]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={label} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 skeleton grid place-items-center text-xs text-muted">rendering…</div>
        )}
      </div>
      <figcaption className={`px-2 py-2 text-sm ${tone === "accent" ? "font-medium" : "text-muted"}`}>{label}</figcaption>
    </figure>
  );
}

function Thumb({ label, img, swatch }: { label: string; img: string | null; swatch?: string }) {
  return (
    <div>
      <div className="relative overflow-hidden rounded-lg bg-sand aspect-[3/4]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={label} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 skeleton" />
        )}
      </div>
      <p className="mt-1.5 text-xs flex items-center gap-1.5">
        {swatch && <span className="h-3 w-3 rounded-full border border-line" style={{ background: swatch }} />}
        {label}
      </p>
    </div>
  );
}

const ZONE_CONCERNS: Record<string, string[]> = { redness: ["hd_redness"], darkCircle: ["hd_dark_circle"], spots: ["hd_age_spot", "hd_acne"] };
const ZONE_LABEL: Record<string, string> = { redness: "Redness", darkCircle: "Dark circles", spots: "Spots & marks" };

function MetricsCard({ metrics, plan }: { metrics: { bare: Metrics; heavy: Metrics; correct: Metrics } | null; plan: NonNullable<Analysis["plan"]> }) {
  if (!metrics) return <div className="card p-5 skeleton h-48" />;
  const active = (zone: string) => plan.concerns.some((c) => ZONE_CONCERNS[zone].includes(c.key) && c.severity !== "none");
  const TIE = 0.3; // ΔE below ~0.3 is imperceptible – count as a tie
  type Row = { key: string; label: string; unit: string; bare?: number; heavy?: number; correct?: number; note: string };
  const rows: Row[] = [];
  for (const zone of ["redness", "darkCircle", "spots"] as const) {
    // Skip zones that are barely visible on bare skin (ΔE < 2.5) – measuring "improvement" there is just noise.
    const bareVis = metrics.bare.visibility[zone];
    if (!active(zone) || bareVis === undefined || bareVis < 2.5) continue;
    rows.push({
      key: zone,
      label: `${ZONE_LABEL[zone]} – how visible`,
      unit: "ΔE",
      bare: metrics.bare.visibility[zone],
      heavy: metrics.heavy.visibility[zone],
      correct: metrics.correct.visibility[zone],
      note: "Colour difference between the YouCam-flagged area and the skin right around it. Lower = blends in better.",
    });
  }
  if (active("redness") && metrics.bare.rednessA !== undefined)
    rows.push({ key: "a", label: "Redness level", unit: "a*", bare: metrics.bare.rednessA, heavy: metrics.heavy.rednessA, correct: metrics.correct.rednessA, note: "CIELAB a* (red–green axis) averaged over the redness zone. Lower = less red." });
  const wins = rows.filter((r) => r.correct !== undefined && r.heavy !== undefined && r.correct <= r.heavy + TIE).length;
  const pct = (b?: number, x?: number) => (b === undefined || x === undefined || b === 0 ? "" : `${x <= b ? "−" : "+"}${Math.abs(((b - x) / b) * 100).toFixed(0)}%`);
  return (
    <div className="card p-5">
      <p className="eyebrow">Measured on your photo</p>
      <div className="mt-4 space-y-5">
        {rows.map((r) => {
          const correctWins = (r.correct ?? 99) <= (r.heavy ?? 99) + TIE;
          return (
            <div key={r.key}>
              <p className="font-medium text-sm">{r.label}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Stat k="Bare" v={r.bare} unit={r.unit} />
                <Stat k={`Foundation ${plan.heavyCoverage}%`} v={r.heavy} unit={r.unit} delta={pct(r.bare, r.heavy)} hi={!correctWins} />
                <Stat k={`CORRECT ${plan.correctedCoverage}%`} v={r.correct} unit={r.unit} delta={pct(r.bare, r.correct)} hi={correctWins} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted">{r.note}</p>
            </div>
          );
        })}
        <div className="rounded-xl bg-sage-soft p-4 text-sm">
          <p className="font-medium">
            As good or better on {wins} of {rows.length} measures – with {plan.heavyCoverage - plan.correctedCoverage} points less coverage.
          </p>
          <p className="text-muted mt-1">
            A {plan.correctedCoverage}% sheer tint over the right corrector vs. a {plan.heavyCoverage}% full-coverage foundation. Highlighted = the method that did better (within {TIE} ΔE counts as a tie). We show
            it either way.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, unit, delta, hi }: { k: string; v?: number; unit: string; delta?: string; hi?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-3 ${hi ? "bg-ink text-cream" : "bg-sand"}`}>
      <p className={`text-[10px] uppercase tracking-wider ${hi ? "text-cream/70" : "text-muted"}`}>{k}</p>
      <p className="font-serif text-2xl mt-0.5">{v === undefined ? "–" : v.toFixed(1)}</p>
      <p className={`text-[11px] ${hi ? "text-cream/80" : "text-muted"}`}>
        {unit} {delta}
      </p>
    </div>
  );
}

function ColourWheel() {
  // Complementary pairs used by colour correction.
  const pairs = [
    { a: "#C8504A", b: "#8DB07A", la: "Redness", lb: "Green" },
    { a: "#6B5B95", b: "#E8A06A", la: "Blue-violet shadow", lb: "Peach / orange" },
    { a: "#7E6B4E", b: "#C46A4A", la: "Grey-brown spots", lb: "Red-orange" },
  ];
  return (
    <div className="card p-6">
      <p className="eyebrow">The theory</p>
      <p className="font-serif text-2xl mt-2">Opposites cancel.</p>
      <div className="mt-5 space-y-4">
        {pairs.map((p) => (
          <div key={p.la} className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-full" style={{ background: p.a }} />
            <span className="text-sm w-36">{p.la}</span>
            <span className="text-muted">+</span>
            <span className="h-10 w-10 rounded-full" style={{ background: p.b }} />
            <span className="text-sm">{p.lb}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted leading-relaxed">
        Makeup artists have used this for decades. The hard part is the shade: a corrector that is right on fair skin turns grey on deep skin. CORRECT measures your depth (ITA°)
        and undertone first.
      </p>
    </div>
  );
}
