"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CompareSlider from "@/components/CompareSlider";
import CoachDrawer, { CoachAvatar, CoachLauncher, SpeakButton, useCoach } from "@/components/Coach";
import { SettingsButton } from "@/components/Settings";
import { PhoneHandoffDialog, usePhoneHandoffVisible } from "@/components/PhoneHandoff";
import { usePrefs } from "@/lib/prefs";
import RichText from "@/components/RichText";
import { InstallButton } from "@/components/Pwa";
import CameraCapture from "@/components/CameraCapture";
import { renderRoutineCard } from "@/lib/shareCard";
import PrintSheet from "@/components/PrintSheet";
import History from "@/components/History";
import { clearHistory, deleteScan, loadHistory, saveScan, type ScanEntry } from "@/lib/history";
import { dabMap, measure, Metrics, Zones, zonesFromMasks } from "@/lib/measure";
import { preparePhoto, preloadFaceDetector, PrepError, PrepInfo } from "@/lib/prep";
import { closest } from "@/lib/catalog";
import { searchQuery, STORES } from "@/lib/shop";
import type { Analysis, SampleBundle } from "@/lib/types";

type Phase = "idle" | "analyzing" | "analyzed" | "rendering" | "done";
type View = "dab" | "photo" | "hd_redness" | "hd_dark_circle" | "hd_age_spot" | "hd_acne";

const SAMPLES = [
  { id: "redness", label: "Redness-prone", blurb: "Flushed cheeks & nose" },
  { id: "undereye", label: "Dark circles", blurb: "Blue-grey under-eye" },
  { id: "spots", label: "Blemishes & marks", blurb: "Post-acne marks, deep skin" },
];

const CONCERN_LABEL: Record<string, string> = { hd_redness: "Redness", hd_dark_circle: "Dark circles", hd_age_spot: "Dark spots", hd_acne: "Blemishes" };
const CONCERN_PLAIN: Record<string, string> = {
  hd_redness: "Pink or red flushing, often on cheeks, nose and chin.",
  hd_dark_circle: "Blue, purple or brown shadow under the eyes.",
  hd_age_spot: "Flat patches darker than the rest of your skin.",
  hd_acne: "Spots and post-blemish marks.",
};
const SEV_TEXT: Record<string, string> = { none: "Clear", mild: "Mild", moderate: "Moderate", strong: "Noticeable" };
const SEV_STYLE: Record<string, string> = {
  none: "bg-sage-soft text-[#3F6B39]",
  mild: "bg-apricot-soft text-[#8A4A1C]",
  moderate: "bg-apricot-soft text-[#8A4A1C]",
  strong: "bg-rose-soft text-rose-dark",
};

const STEPS = [
  { id: "start", label: "Scan" },
  { id: "results", label: "Your plan" },
  { id: "tryon", label: "Try it on" },
  { id: "kit", label: "Your kit" },
];

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}

/** Embed mode: tell the host store page what happened (no photos are ever sent – only shades and SKUs). */
function toHost(type: string, data: unknown = {}) {
  if (typeof window !== "undefined" && window.parent !== window) window.parent.postMessage({ source: "correct-widget", type, ...((data as object) || {}) }, "*");
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function CorrectApp({ embed = false }: { embed?: boolean }) {
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
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [sample, setSample] = useState<SampleBundle | null>(null);
  const [status, setStatus] = useState<string>("");
  const [bagged, setBagged] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachSeen, setCoachSeen] = useState(false);
  const [prepNote, setPrepNote] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [history, setHistory] = useState<ScanEntry[]>([]);
  const [scanId, setScanId] = useState<string | null>(null);
  useEffect(() => setHistory(loadHistory()), []);
  useEffect(() => {
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => {
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
    };
  }, []);
  const showHandoff = usePhoneHandoffVisible();
  const [sharing, setSharing] = useState<"idle" | "busy" | "done">("idle");
  const [visibleSection, setVisibleSection] = useState<string>("start");
  const fileRef = useRef<HTMLInputElement>(null);

  const { prefs } = usePrefs();
  const lang = prefs.lang;
  const [tr, setTr] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false); // translated routine strings (original -> translated)
  const plan = analysis?.plan;
  const busy = phase === "analyzing" || phase === "rendering";

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
    setCoachSeen(false);
    setPrepNote(null);
    setScanId(null);
  };

  // Warm up the on-device face detector so the first upload is instant.
  useEffect(() => {
    preloadFaceDetector();
    // Arrived from the "continue on your phone" QR code: open the guided camera straight away.
    const q = new URLSearchParams(window.location.search);
    if (q.get("start") === "camera") {
      setCameraOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Scroll-spy: highlight the step whose section is currently in view.
  useEffect(() => {
    const ids = ["start", "results", "tryon", "kit"];
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (vis[0]) setVisibleSection(vis[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [phase, analysis]);

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
      skin: { hex: plan.profile.skinHex, depth: plan.profile.depthLabel, undertone: plan.profile.undertone, ITA_degrees: plan.profile.ita, fitzpatrick_type: plan.profile.fitzpatrick },
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

  const coach = useCoach(coachContext, lang);
  const t = (str: string) => (lang !== "en" && tr[str]) || str;

  // Re-write the coach summary when the language changes.
  const lastLang = useRef(lang);
  useEffect(() => {
    if (lastLang.current === lang) return;
    lastLang.current = lang;
    if (coachContext && !summaryLoading) setSummary(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Translate the written routine (titles, where, why) into the chosen language.
  useEffect(() => {
    if (!plan || lang === "en") return;
    const strings = Array.from(new Set([...plan.steps.flatMap((s) => [s.title, s.where, s.why, s.colorName]), ...plan.concerns.map((c) => c.label)]));
    let cancelled = false;
    setTranslating(true);
    postJSON<{ strings: string[] }>("/api/translate", { lang, strings })
      .then((j) => {
        if (cancelled || !Array.isArray(j.strings)) return;
        const m: Record<string, string> = {};
        strings.forEach((s, i) => (m[s] = j.strings[i]));
        setTr(m);
      })
      .catch(() => {})
      .finally(() => !cancelled && setTranslating(false));
    return () => {
      cancelled = true;
    };
  }, [plan, lang]);

  // Personal summary from the coach, once per analysis.
  useEffect(() => {
    if (!coachContext || summary !== null || summaryLoading) return;
    setSummaryLoading(true);
    postJSON<{ text: string | null }>("/api/coach", { context: coachContext, lang })
      .then((j) => setSummary(j.text || ""))
      .catch(() => setSummary(""))
      .finally(() => setSummaryLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachContext, summary]);

  const openCoach = useCallback(() => {
    setCoachOpen(true);
    setCoachSeen(true);
  }, []);
  const askCoach = (q: string) => {
    openCoach();
    coach.ask(q);
  };

  async function runAnalysis(file: File | Blob) {
    if (!navigator.onLine) {
      setError("You’re offline, so a live skin scan can’t run right now. The three sample faces below work without internet.");
      scrollTo("start");
      return;
    }
    reset();
    setPhase("analyzing");
    setTimeout(() => scrollTo("progress"), 50);
    try {
      setStatus("Finding your face and framing the photo (on your device)…");
      const prepped = await preparePhoto(file);
      setPhoto(prepped.dataUrl);
      setStatus("Scanning for redness, dark circles, spots and blemishes (low-resolution photos are sharpened first with YouCam AI Photo Enhance)…");
      const fd = new FormData();
      fd.append("image", prepped.blob, "selfie.jpg");
      const r = await fetch("/api/analyze", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Analysis failed");
      if (j.photo) setPhoto(j.photo); // exactly what YouCam analysed – keeps masks and renders aligned
      setPrepNote(describePrep(prepped.info, j.prep));
      setAnalysis(j);
      setPhase("analyzed");
      saveScan(j.photo || prepped.dataUrl, j.plan, j.scores)
        .then(({ list, entry }) => {
          setHistory(list);
          setScanId(entry.id);
        })
        .catch(() => {});
      setTimeout(() => scrollTo("results"), 120);
    } catch (e) {
      setError(e instanceof PrepError || e instanceof Error ? e.message : String(e));
      setPhase("idle");
      setTimeout(() => scrollTo("start"), 50);
    }
  }

  async function loadSample(id: string) {
    reset();
    setPhase("analyzing");
    setStatus("Loading the sample face…");
    try {
      const b: SampleBundle = await (await fetch(`/samples/${id}/bundle.json`)).json();
      setSample(b);
      setPhoto(b.photo);
      setAnalysis(b.analysis);
      setPhase("analyzed");
      setTimeout(() => scrollTo("results"), 120);
    } catch {
      setError("Sorry, that sample couldn't be loaded.");
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
    setTimeout(() => scrollTo("tryon"), 80);
    setSteps(plan.steps.map(() => null));
    if (sample) {
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
      return { step: s, ...closest(kind, s.matchHex) };
    });
  }, [plan]);

  useEffect(() => {
    if (!embed || !plan) return;
    toHost("correct:plan", {
      skin: { hex: plan.profile.skinHex, depth: plan.profile.depthLabel, undertone: plan.profile.undertone, fitzpatrick: plan.profile.fitzpatrick },
      concerns: plan.concerns.filter((c) => c.severity !== "none").map((c) => ({ key: c.key, label: c.label, severity: c.severity })),
      steps: kit.map(({ step, product, dE }) => ({ step: step.title, shadeHex: step.color, shadeName: step.colorName, sku: product.sku, product: product.name, productShade: product.shade, price: product.price, deltaE: +dE.toFixed(2) })),
    });
  }, [embed, plan, kit]);

  const addToBag = () => {
    setBagged(true);
    if (embed) toHost("correct:add-to-bag", { items: kit.map(({ product }) => ({ sku: product.sku, name: product.name, shade: product.shade, price: product.price, qty: 1 })) });
  };

  const stepAvailable = (i: number) => i === 0 || (i === 1 && !!plan) || (i === 2 && (phase === "rendering" || phase === "done")) || (i === 3 && !!plan);
  const progressStep = phase === "idle" || phase === "analyzing" ? 0 : phase === "analyzed" ? 1 : phase === "rendering" ? 2 : 3;
  const spyIdx = STEPS.findIndex((s) => s.id === visibleSection);
  // Highlight where the user IS (scroll position); fall back to how far they've progressed.
  const currentStep = plan && spyIdx >= 0 && stepAvailable(spyIdx) ? spyIdx : progressStep;
  const mapImg = view === "dab" ? dab : photo;

  async function shareCard() {
    if (!plan || !photo) return;
    setSharing("busy");
    try {
      const after = finalImg || dab || photo;
      const blob = await renderRoutineCard({ before: photo, after, afterLabel: finalImg ? "With CORRECT" : "Where to apply", plan, kit });
      const file = new File([blob], "my-correct-routine.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      const touch = window.matchMedia("(pointer: coarse)").matches;
      let shared = false;
      if (touch && nav.canShare?.({ files: [file] })) {
        // Phones: native share sheet (save to Photos, send to a friend, post).
        shared = await nav
          .share({ files: [file], title: "My colour-correction routine" })
          .then(() => true)
          .catch(() => false);
      }
      if (!shared) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "my-correct-routine.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      setSharing("done");
      setTimeout(() => setSharing("idle"), 2500);
    } catch {
      setSharing("idle");
    }
  }

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] btn-primary">
        Skip to main content
      </a>

      {/* ───────────── Sticky header with progress ───────────── */}
      <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center gap-4">
          <a href="#top" className="flex items-center gap-2 shrink-0" aria-label="CORRECT home">
            <Logo />
            <span className="font-serif text-xl tracking-tight">correct</span>
          </a>
          <nav aria-label="Progress" className="hidden md:block flex-1">
            <ol className="flex items-center justify-center gap-1">
              {STEPS.map((s, i) => {
                const avail = stepAvailable(i);
                const done = i < progressStep && i !== currentStep;
                const current = i === currentStep;
                return (
                  <li key={s.id} className="flex items-center">
                    {i > 0 && <span aria-hidden className={`mx-1 h-px w-6 ${done || current ? "bg-ink/40" : "bg-line"}`} />}
                    <button
                      onClick={() => avail && scrollTo(s.id)}
                      disabled={!avail}
                      aria-current={current ? "step" : undefined}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${current ? "bg-ink text-cream" : avail ? "hover:bg-sand" : "text-muted/60 cursor-not-allowed"}`}
                    >
                      <span className={`grid h-5 w-5 place-items-center rounded-full text-[0.6875rem] font-semibold ${current ? "bg-cream text-ink" : done ? "bg-sage text-white" : "bg-sand text-muted"}`}>
                        {done ? "✓" : i + 1}
                      </span>
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SettingsButton />
            {!embed && <InstallButton className="hidden sm:inline-flex" />}
            <button onClick={openCoach} className="btn-ghost !py-2 hidden sm:inline-flex">
              <CoachAvatar size={22} /> Ask the coach
            </button>
            {embed && (
              <button onClick={() => toHost("correct:close")} className="h-10 w-10 grid place-items-center rounded-full hover:bg-sand" aria-label="Close and return to the store">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {/* Mobile progress */}
        <nav aria-label="Progress" className="md:hidden border-t border-line/70">
          <ol className="mx-auto max-w-6xl px-3 py-2 grid grid-cols-4 gap-1.5">
            {STEPS.map((s, i) => {
              const avail = stepAvailable(i);
              const current = i === currentStep;
              const done = i < progressStep && !current;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => avail && scrollTo(s.id)}
                    disabled={!avail}
                    aria-current={current ? "step" : undefined}
                    className="w-full text-left disabled:opacity-50"
                  >
                    <span className={`block h-1.5 rounded-full ${current ? "bg-ink" : done ? "bg-sage" : "bg-line"}`} />
                    <span className={`mt-1 block truncate text-[0.6875rem] ${current ? "font-semibold text-ink" : "text-muted"}`}>
                      {i + 1}. {s.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      {!online && (
        <div role="status" className="no-print sticky top-16 z-20 bg-ink text-cream text-center text-sm px-4 py-2">
          You’re offline. Sample faces, maps and routines still work; live scans and the coach need internet.
        </div>
      )}
      <main id="main" className="min-h-screen pb-24 sm:pb-8">
        {/* ───────────── Hero: what this is + start ───────────── */}
        <section
          id="top"
          className={embed ? "mx-auto max-w-xl px-4 pt-5 pb-8" : "mx-auto max-w-6xl px-4 sm:px-5 pt-8 md:pt-14 pb-10 grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-10 items-start"}
        >
          {embed ? (
            <p className="mb-4 text-[0.9375rem] text-ink/80">
              <strong className="font-semibold text-ink">Find your corrector shade.</strong> One selfie: we find redness, dark circles and dark spots, pick matched shades from this store and show them on your face.
            </p>
          ) : (
          <div className="lg:pt-6">
            <p className="eyebrow">AI colour-correction coach</p>
            <h1 className="font-serif text-4xl md:text-6xl leading-[1.05] mt-3">
              Cancel the colour,
              <br />
              <span className="italic text-rose">not your skin.</span>
            </h1>
            <p className="mt-5 text-lg md:text-xl text-ink/80 max-w-xl leading-relaxed">
              <strong className="font-semibold text-ink">CORRECT</strong> tells you which <strong className="font-semibold text-ink">corrector shade</strong> your skin needs, shows you{" "}
              <strong className="font-semibold text-ink">exactly where to put it</strong>, and lets you see the result on your own face, before you buy anything.
            </p>
            <ul className="mt-6 space-y-2.5 text-[0.9375rem] text-ink/80">
              {[
                ["For", "redness, dark circles, dark spots and post-acne marks"],
                ["Instead of", "piling on full-coverage foundation that looks heavy"],
                ["You get", "a personal routine, a matched product kit and a coach to ask"],
              ].map(([k, v]) => (
                <li key={k} className="flex gap-3">
                  <span className="w-24 shrink-0 text-muted">{k}</span>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          </div>
          )}

          {/* Start card */}
          <div id="start" className="card p-6 md:p-7 scroll-mt-32 md:scroll-mt-24">
            <h2 className="font-serif text-2xl">Start here</h2>
            <p className="text-sm text-muted mt-1">Takes about 15 seconds. No account needed.</p>

            <div className="mt-5 grid gap-3">
              <button
                className="w-full rounded-2xl bg-ink text-cream px-5 py-5 text-left hover:bg-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose/30 disabled:opacity-50"
                onClick={() => setCameraOpen(true)}
                disabled={busy}
              >
                <span className="flex items-center gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-cream text-ink shrink-0">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M4 7h3l2-3h6l2 3h3v12H4z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                  </span>
                  <span>
                    <span className="block font-medium text-lg">Take a guided selfie</span>
                    <span className="block text-sm text-cream/70">Live tips for distance, light and angle</span>
                  </span>
                </span>
              </button>
              <button
                className="w-full rounded-2xl border-2 border-dashed border-ink/25 bg-white px-5 py-4 text-left hover:border-ink hover:bg-sand/40 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose/30 disabled:opacity-50"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <span className="flex items-center gap-4">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-sand text-ink shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
                    </svg>
                  </span>
                  <span>
                    <span className="block font-medium">Upload a photo</span>
                    <span className="block text-sm text-muted">Any size – we frame and sharpen it for you</span>
                  </span>
                </span>
              </button>
            </div>
            {showHandoff && !embed && (
              <button onClick={() => setHandoffOpen(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-ink/80 hover:bg-sand">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="7" y="2" width="10" height="20" rx="2" />
                  <path d="M11 18h2" />
                </svg>
                On a laptop? <span className="font-medium underline underline-offset-2">Use your phone’s camera instead</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Choose a photo"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) runAnalysis(f);
                e.target.value = "";
              }}
            />

            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" /> or try a sample face <span className="h-px flex-1 bg-line" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadSample(s.id)}
                  disabled={busy}
                  className={`group text-left rounded-xl border bg-white p-1.5 hover:border-ink transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose/30 disabled:opacity-50 ${sample?.id === s.id ? "border-ink" : "border-line"}`}
                  aria-label={`Try sample: ${s.label}, ${s.blurb}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/samples/${s.id}/thumb.jpg`} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" />
                  <span className="block px-1 pt-2 text-[0.8125rem] font-medium leading-tight">{s.label}</span>
                  <span className="block px-1 pb-1 text-[0.6875rem] text-muted leading-tight">{s.blurb}</span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-xs text-muted leading-relaxed">
              🔒 Your photo is sent to the YouCam API for analysis and isn’t stored by CORRECT. Sample faces are AI-generated. Cosmetic guidance only, not a medical diagnosis.
            </p>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-rose-soft text-rose-dark px-4 py-3 text-sm">
                {error}
              </p>
            )}
          </div>
        </section>

        {!plan && phase !== "analyzing" && history.length > 0 && (
          <div className="mx-auto max-w-6xl px-4 sm:px-5 pb-10">
            <History list={history} currentId={null} onDelete={(id) => setHistory(deleteScan(id))} onClear={() => setHistory(clearHistory())} />
          </div>
        )}

        {/* ───────────── How it works ───────────── */}
        {!embed && !plan && phase !== "analyzing" && (
          <section aria-labelledby="how" className="mx-auto max-w-6xl px-5 pb-16">
            <h2 id="how" className="eyebrow mb-4">
              How it works
            </h2>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ["Scan", "AI finds redness, dark circles, spots and blemishes, and measures your exact skin tone."],
                ["Map", "See exactly where each corrector goes on your face, in its real colour."],
                ["Try it on", "Compare the colour-corrected look with full-coverage foundation, on your own photo."],
                ["Shop & ask", "Get matched shades, and ask the coach anything about your routine."],
              ].map(([t, d], i) => (
                <li key={t} className="card p-5">
                  <span className="font-serif text-3xl text-rose">{i + 1}</span>
                  <h3 className="mt-2 font-medium">{t}</h3>
                  <p className="mt-1 text-sm text-muted leading-relaxed">{d}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 card p-5 md:p-6 grid md:grid-cols-[auto_1fr] gap-6 items-center">
              <div>
                <p className="eyebrow">Why it works</p>
                <p className="font-serif text-2xl mt-1">Opposite colours cancel out.</p>
              </div>
              <ul className="grid sm:grid-cols-3 gap-4">
                {[
                  ["#C8504A", "#8DB07A", "Redness", "Green"],
                  ["#6B5B95", "#E8A06A", "Blue-purple shadow", "Peach / orange"],
                  ["#7E6B4E", "#C46A4A", "Grey-brown marks", "Red-orange"],
                ].map(([a, b, la, lb]) => (
                  <li key={la} className="flex items-center gap-3 text-sm">
                    <span className="flex -space-x-2" aria-hidden>
                      <span className="h-9 w-9 rounded-full ring-2 ring-white" style={{ background: a }} />
                      <span className="h-9 w-9 rounded-full ring-2 ring-white" style={{ background: b }} />
                    </span>
                    <span>
                      {la} <span className="text-muted">→ cancelled by</span> <strong className="font-medium">{lb}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ───────────── Who it's for (impact) ───────────── */}
        {!embed && !plan && phase !== "analyzing" && (
          <section aria-labelledby="who" className="mx-auto max-w-6xl px-4 sm:px-5 pb-16">
            <h2 id="who" className="eyebrow mb-4">
              Who it’s for
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              <article className="card p-5">
                <p className="font-serif text-3xl text-rose">~1 in 20</p>
                <h3 className="mt-1 font-medium">adults live with rosacea</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  A 2018 meta-analysis put adult prevalence at about 5.5%. Most people hide the redness under heavier foundation – which still shows pink through it.
                </p>
                <p className="mt-2 text-[0.6875rem] text-muted">Gether et al., British Journal of Dermatology, 2018</p>
              </article>
              <article className="card p-5">
                <p className="font-serif text-3xl text-rose">Darker skin</p>
                <h3 className="mt-1 font-medium">is most affected by dark marks</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  Post-inflammatory hyperpigmentation is more common and longer-lasting in deeper skin tones – yet most corrector advice is written for fair skin and turns ashy on deep skin. CORRECT’s shades
                  scale across six depths.
                </p>
                <p className="mt-2 text-[0.6875rem] text-muted">Davis &amp; Callender, J Clin Aesthet Dermatol, 2010</p>
              </article>
              <article className="card p-5">
                <p className="font-serif text-3xl text-rose">For stores</p>
                <h3 className="mt-1 font-medium">the right shade, first time</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  Correctors are the hardest base product to buy online: shoppers can’t swatch them and the “right” colour depends on their depth. CORRECT turns one selfie into a matched basket from the
                  store’s own catalogue (CIEDE2000), so fewer wrong-shade buys and returns.
                </p>
                <a href="/store-demo" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-rose-dark underline underline-offset-2">
                  See it embedded in a demo store (one script tag) →
                </a>
              </article>
            </div>
          </section>
        )}

        {/* ───────────── Progress ───────────── */}
        {phase === "analyzing" && (
          <section id="progress" className="mx-auto max-w-6xl px-5 pb-16 scroll-mt-32 md:scroll-mt-24" aria-live="polite">
            <div className="card p-6 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full border-2 border-line border-t-rose animate-spin motion-reduce:animate-none" aria-hidden />
              <div>
                <p className="font-medium">Reading your skin…</p>
                <p className="text-sm text-muted">{status}</p>
              </div>
            </div>
          </section>
        )}

        {analysis && plan && photo && (
          <>
            {/* ───────────── 2. Results at a glance ───────────── */}
            <section id="results" className="mx-auto max-w-6xl px-5 pb-14 scroll-mt-32 md:scroll-mt-24">
              <SectionHeader n={2} title="Your results" sub="What the scan found, and the routine we built for your skin." />
              {prepNote && !sample && (
                <p className="mb-4 rounded-xl bg-sage-soft px-4 py-2.5 text-sm text-ink/80" role="status">
                  <strong className="font-medium">Photo prepared:</strong> {prepNote}
                </p>
              )}
              {sample && (
                <p className="mb-4 rounded-xl bg-sand px-4 py-2.5 text-sm text-ink/80">
                  <strong className="font-medium">Sample mode:</strong> real YouCam API results, pre-computed for an AI-generated face. Upload your own selfie for a live scan.
                </p>
              )}

              <div className="card p-5 md:p-6 grid lg:grid-cols-[220px_1fr_1fr] gap-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="Your photo" className="hidden lg:block w-full aspect-[3/4] object-cover rounded-xl" />
                <div>
                  <p className="eyebrow">Your skin</p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="h-12 w-12 rounded-full border border-line shrink-0" style={{ background: plan.profile.skinHex }} aria-hidden />
                    <div>
                      <p className="font-medium text-lg leading-tight">
                        {plan.profile.depthLabel} skin, {plan.profile.undertone} undertone
                      </p>
                      <p className="text-xs text-muted">
                        Measured tone {plan.profile.skinHex.toUpperCase()}
                        {plan.profile.fitzpatrick ? ` · Fitzpatrick type ${plan.profile.fitzpatrick}` : ""}
                      </p>
                    </div>
                  </div>
                  {plan.profile.depthAgreement && plan.profile.depthAgreement !== "unavailable" && (
                    <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] ${plan.profile.depthAgreement === "override" ? "bg-apricot-soft text-[#8A4A1C]" : "bg-sage-soft text-[#3F6B39]"}`}>
                      {plan.profile.depthAgreement === "override"
                        ? "Lighting skewed the colour – shade depth set from the Fitzpatrick model"
                        : "✓ Two independent measures agree on your skin depth"}
                    </p>
                  )}
                  <p className="eyebrow mt-6">What we found</p>
                  <ul className="mt-3 space-y-2.5">
                    {plan.concerns.map((c) => (
                      <li key={c.key} className="flex items-center gap-3">
                        <span className={`w-24 shrink-0 rounded-full px-2.5 py-1 text-center text-xs font-medium ${SEV_STYLE[c.severity]}`}>{SEV_TEXT[c.severity]}</span>
                        <span className="text-sm">
                          <span className="font-medium">{t(c.label)}</span>
                          <span className="block text-xs text-muted">{CONCERN_PLAIN[c.key]}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col">
                  <p className="eyebrow flex items-center gap-2">
                    Your routine
                    {translating && lang !== "en" && (
                      <span className="normal-case tracking-normal text-[0.6875rem] text-rose-dark" role="status">
                        · translating…
                      </span>
                    )}
                  </p>
                  <ol className="mt-3 space-y-2">
                    {plan.steps.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-3 rounded-xl bg-sand/60 px-3 py-2.5">
                        <span className="text-xs font-semibold text-muted w-4">{i + 1}</span>
                        <span className="h-8 w-8 rounded-full border border-black/10 shrink-0" style={{ background: s.color }} aria-hidden />
                        <span className="text-sm leading-tight">
                          <span className="font-medium">{t(s.title)}</span>
                          <span className="block text-xs text-muted">{t(s.colorName)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-auto pt-5 flex flex-col sm:flex-row gap-2">
                    {phase === "analyzed" && (
                      <button className="btn-primary !py-3 flex-1" onClick={runRenders}>
                        See it on my face →
                      </button>
                    )}
                    {(phase === "rendering" || phase === "done") && (
                      <button className="btn-ghost !py-3 flex-1" onClick={() => scrollTo("tryon")}>
                        Jump to try-on ↓
                      </button>
                    )}
                    <button className="btn-ghost !py-3 flex-1" onClick={openCoach}>
                      <CoachAvatar size={20} /> Ask about my plan
                    </button>
                  </div>
                </div>
              </div>

              {/* Coach summary – marketed inline */}
              <div className="mt-5 rounded-2xl border border-sage/40 bg-gradient-to-br from-sage-soft to-apricot-soft p-5 md:p-6">
                <div className="flex items-start gap-4">
                  <CoachAvatar size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">Your coach says</p>
                    <div className="mt-2 text-[0.9375rem] text-ink/90" aria-live="polite">
                      {summaryLoading || summary === null ? (
                        <div className="space-y-2" aria-label="Loading coach summary">
                          <div className="skeleton h-4 rounded w-11/12" />
                          <div className="skeleton h-4 rounded w-9/12" />
                          <div className="skeleton h-4 rounded w-10/12" />
                        </div>
                      ) : summary ? (
                        <>
                          <RichText text={summary} />
                          <SpeakButton text={summary} className="mt-2 -ml-2.5 !bg-white/60" />
                        </>
                      ) : (
                        <p>Your plan is ready below. Ask me anything about it.</p>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {["Why these shades for me?", "I have an outdoor event – what changes?", "Can I use this on breakouts?"].map((q) => (
                        <button key={q} onClick={() => askCoach(q)} className="chip !bg-white/80 hover:!bg-white !py-1.5">
                          {q}
                        </button>
                      ))}
                      <button onClick={openCoach} className="chip !bg-ink !text-cream !border-ink !py-1.5">
                        Ask your own question →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {!sample && scanId && history.length > 0 && (
                <div className="mt-5">
                  <History list={history} currentId={scanId} onDelete={(id) => setHistory(deleteScan(id))} onClear={() => setHistory(clearHistory())} />
                </div>
              )}
            </section>

            {/* ───────────── Map + detailed routine ───────────── */}
            <section aria-labelledby="map-title" className="mx-auto max-w-6xl px-5 pb-14">
              <div className="grid md:grid-cols-[1fr_1.15fr] gap-6 items-start">
                <div className="card p-3">
                  <h3 id="map-title" className="px-2 pt-2 font-medium">
                    Where to apply
                  </h3>
                  <p className="px-2 text-xs text-muted">Coloured areas = where each corrector goes, painted in its real shade.</p>
                  <div className="relative mt-3 overflow-hidden rounded-xl bg-sand aspect-[3/4]">
                    {mapImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mapImg}
                        alt={view === "dab" ? "Map of where to apply each corrector" : "Your photo"}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 skeleton" />
                    )}
                    {view !== "dab" && view !== "photo" && analysis.masks[view] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={analysis.masks[view]} alt={`${CONCERN_LABEL[view]} detected by YouCam`} className="absolute inset-0 h-full w-full object-cover" />
                    )}
                  </div>
                  {view === "dab" && (
                    <ul className="px-2 pt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label="Map key">
                      {plan.steps
                        .filter((st) => st.id !== "tint")
                        .map((st) => (
                          <li key={st.id} className="flex items-center gap-1.5">
                            <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: st.color }} aria-hidden />
                            <span>
                              <span className="font-medium">{t(st.colorName)}</span> <span className="text-muted">– {st.id === "green" ? "redness areas" : "dark circles & spots"}</span>
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                  <div className="p-2 pt-3" role="group" aria-label="Choose what to show">
                    <div className="flex flex-wrap gap-2">
                      {(["dab", "photo", ...Object.keys(analysis.masks)] as View[]).map((v) => (
                        <button
                          key={v}
                          onClick={() => setView(v)}
                          aria-pressed={view === v}
                          className={`chip !py-1.5 ${view === v ? "!bg-ink !text-cream !border-ink" : "hover:bg-sand"}`}
                        >
                          {v === "dab" ? "Where to apply" : v === "photo" ? "Original photo" : `AI view: ${CONCERN_LABEL[v]}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-serif text-2xl">Your step-by-step routine</h3>
                  {plan.steps.map((s, i) => (
                    <article key={s.id} className="card p-5">
                      <div className="flex items-start gap-4">
                        <div className="shrink-0 text-center">
                          <span className="block h-14 w-14 rounded-2xl border border-black/10" style={{ background: s.color }} aria-hidden />
                          <span className="mt-1 block text-[0.625rem] font-mono text-muted">{s.color}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-rose">STEP {i + 1}</p>
                          <h4 className="font-medium text-lg leading-snug">{t(s.title)}</h4>
                          <p className="text-sm text-muted">{t(s.colorName)}</p>
                          <p className="mt-3 text-[0.9375rem] leading-relaxed">
                            <span className="font-medium">Where: </span>
                            {t(s.where)}
                          </p>
                          <details className="mt-2 group">
                            <summary className="cursor-pointer text-sm text-rose-dark font-medium list-none flex items-center gap-1">
                              <span className="group-open:rotate-90 transition-transform" aria-hidden>
                                ›
                              </span>{" "}
                              Why this shade?
                            </summary>
                            <p className="mt-2 text-sm text-muted leading-relaxed">{t(s.why)}</p>
                          </details>
                        </div>
                      </div>
                    </article>
                  ))}
                  {phase === "analyzed" && (
                    <button className="btn-primary w-full !py-3.5 text-base" onClick={runRenders}>
                      See this routine on my face →
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* ───────────── 3. Try it on ───────────── */}
            {(phase === "rendering" || phase === "done") && (
              <section id="tryon" className="mx-auto max-w-6xl px-5 pb-14 scroll-mt-32 md:scroll-mt-24">
                <SectionHeader n={3} title="Try it on: the usual fix vs. the CORRECT fix" sub="Both applied to your photo by YouCam’s virtual makeup try-on. No beauty filter, skin texture is kept." />
                {phase === "rendering" && (
                  <p className="mb-4 text-sm text-muted" aria-live="polite">
                    Applying makeup layer by layer… ({steps.filter(Boolean).length} of {plan.steps.length} layers done)
                  </p>
                )}
                {error && (
                  <p role="alert" className="mb-4 rounded-xl bg-rose-soft text-rose-dark px-4 py-3 text-sm">
                    {error}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <Panel label="Before" sub="Bare skin" img={photo} />
                  <Panel label="The usual fix" sub={`Full-coverage foundation (${plan.heavyCoverage}%)`} img={heavy} />
                  <Panel label="The CORRECT fix" sub={`Corrector + sheer tint (${plan.correctedCoverage}%)`} img={finalImg} accent />
                </div>

                <div className="mt-5 card p-4">
                  <p className="eyebrow mb-3">How the CORRECT look is built, layer by layer</p>
                  <ol className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Thumb label="Bare skin" img={photo} />
                    {plan.steps.map((s, i) => (
                      <Thumb key={s.id} label={`+ ${s.title}`} img={steps[i]} swatch={s.color} />
                    ))}
                  </ol>
                </div>

                {phase === "done" && finalImg && (
                  <div className="mt-6 grid md:grid-cols-2 gap-6 items-start">
                    <CompareSlider before={photo} after={finalImg} beforeLabel="Before" afterLabel="CORRECT" />
                    <div className="space-y-4">
                      <MetricsCard metrics={metrics} plan={plan} />
                      <button className="btn-ghost w-full !py-3" onClick={() => askCoach("Explain my before/after results in simple words.")}>
                        <CoachAvatar size={20} /> Ask the coach to explain these results
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ───────────── 4. Kit ───────────── */}
            <section id="kit" className="mx-auto max-w-6xl px-5 pb-24 scroll-mt-32 md:scroll-mt-24">
              <SectionHeader n={4} title="Your kit" sub="The closest shades in the store, matched to your target colours." />
              <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
                <div className="card p-5">
                  <ul className="divide-y divide-line">
                    {kit.map(({ step, product, dE }, i) => (
                      <li key={product.sku} className="py-4 flex items-center gap-4">
                        <span className="h-14 w-14 rounded-xl border border-black/10 shrink-0" style={{ background: product.hex }} aria-hidden />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted">Step {i + 1} · {step.title}</p>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted">
                            Shade {product.shade} · {product.size}
                          </p>
                          <MatchBadge dE={dE} />
                          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="text-muted">Find similar:</span>
                            {STORES.map((st) => (
                              <a
                                key={st.id}
                                href={st.url(searchQuery(step, plan!.profile.depthLabel, plan!.profile.undertone))}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="rounded-full border border-line bg-white px-2 py-0.5 hover:bg-sand hover:border-ink"
                                aria-label={`Search ${st.name} for ${searchQuery(step, plan!.profile.depthLabel, plan!.profile.undertone)} (opens in a new tab)`}
                              >
                                {st.name} ↗
                              </a>
                            ))}
                          </p>
                        </div>
                        <span className="font-medium text-lg">${product.price}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 pt-4 border-t border-line flex items-center justify-between gap-4">
                    <p className="text-sm">
                      <span className="text-muted">{kit.length} items · </span>
                      <span className="font-medium">${kit.reduce((a, k) => a + k.product.price, 0)}</span>
                    </p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button className="btn-ghost !py-3" onClick={() => window.print()} title="Print or save as PDF – a one-page sheet for you or your makeup artist">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z" />
                        </svg>
                        Print sheet
                      </button>
                      <button className="btn-ghost !py-3" onClick={shareCard} disabled={sharing === "busy"} aria-live="polite">
                        {sharing === "busy" ? "Creating…" : sharing === "done" ? "Saved ✓" : "Save routine card"}
                      </button>
                      <button className="btn-primary !py-3" onClick={addToBag} aria-live="polite">
                        {bagged ? "Added to bag ✓" : "Add kit to bag"}
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Demo catalogue (fictional brand) – a store would plug in its own products. “Find similar” links are plain store searches for the same product type and shade family: not sponsored, no
                    affiliate tags.
                  </p>
                </div>

                <div className="rounded-2xl bg-ink text-cream p-6 shadow-card">
                  <CoachAvatar size={48} />
                  <h3 className="mt-4 font-serif text-2xl">Not sure how to use it?</h3>
                  <p className="mt-2 text-cream/80 text-[0.9375rem] leading-relaxed">
                    Your coach already knows your scan and your shades. Ask how much to use, which brush, or how to adapt it for an event.
                  </p>
                  <button onClick={openCoach} className="mt-5 btn w-full !py-3 bg-cream text-ink hover:bg-white focus-visible:ring-4 focus-visible:ring-white/40">
                    Chat with the coach
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {!embed && <footer className="border-t border-line py-8 px-5 text-center text-xs text-muted">
        CORRECT · built on Perfect Corp YouCam APIs (Skin Analysis, Skin Tone, Fitzpatrick, Photo Enhance, Makeup VTO) and Gemini ·{" "}
        <a href="/store-demo" className="underline underline-offset-2">
          for stores: embed widget
        </a>{" "}
        · cosmetic guidance only, not medical advice
      </footer>}

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(b) => {
          setCameraOpen(false);
          runAnalysis(b);
        }}
      />
      {plan && photo && <PrintSheet plan={plan} photo={photo} map={dab} after={finalImg} kit={kit} summary={summary} t={t} />}
      {handoffOpen && <PhoneHandoffDialog onClose={() => setHandoffOpen(false)} />}
      {!coachOpen && !cameraOpen && <CoachLauncher onOpen={openCoach} hasPlan={!!plan} unread={!!summary && !coachSeen} />}
      <CoachDrawer open={coachOpen} onClose={() => setCoachOpen(false)} coach={coach} hasPlan={!!plan} summary={summary || null} />
    </>
  );
}

function describePrep(info: PrepInfo, server?: { upscale: string; enhanceScale: number | null; width: number; height: number }) {
  const parts: string[] = [];
  if (info.cropped) parts.push("framed around your face");
  if (server?.upscale === "ai-enhance") parts.push(`sharpened ${server.enhanceScale}× with YouCam AI Photo Enhance (your photo was low-resolution)`);
  else if (server?.upscale === "resample") parts.push("upscaled to the resolution the skin scan needs");
  if (info.faces > 1) parts.push(`${info.faces} faces found – we used the largest`);
  if (!parts.length) return null;
  const s = parts.join("; ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

function Logo() {
  return (
    <span aria-hidden className="relative h-6 w-8">
      <span className="absolute left-0 top-0 h-6 w-6 rounded-full bg-rose/80" />
      <span className="absolute left-2.5 top-0 h-6 w-6 rounded-full bg-sage mix-blend-multiply" />
    </span>
  );
}

function SectionHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-6 flex items-start gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-cream font-serif text-lg" aria-hidden>
        {n}
      </span>
      <div>
        <h2 className="font-serif text-2xl md:text-3xl leading-tight">{title}</h2>
        <p className="text-[0.9375rem] text-muted mt-1">{sub}</p>
      </div>
    </div>
  );
}

function MatchBadge({ dE }: { dE: number }) {
  const [txt, cls] = dE < 3 ? ["Excellent match", "bg-sage-soft text-[#3F6B39]"] : dE < 6 ? ["Close match", "bg-apricot-soft text-[#8A4A1C]"] : ["Nearest available", "bg-sand text-muted"];
  return (
    <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${cls}`} title={`Colour difference ΔE2000 = ${dE.toFixed(1)}`}>
      {txt} · ΔE {dE.toFixed(1)}
    </span>
  );
}

function Panel({ label, sub, img, accent }: { label: string; sub: string; img: string | null; accent?: boolean }) {
  return (
    <figure className={`card p-1 sm:p-2 ${accent ? "ring-2 ring-sage" : ""}`}>
      <div className="relative overflow-hidden rounded-xl bg-sand aspect-[3/4]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={`${label}: ${sub}`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 skeleton grid place-items-center text-sm text-muted">Applying…</div>
        )}
        {accent && <span className="absolute left-1.5 top-1.5 sm:left-3 sm:top-3 rounded-full bg-sage px-2 sm:px-2.5 py-0.5 sm:py-1 text-[0.5625rem] sm:text-[0.6875rem] font-medium text-white">Recommended</span>}
      </div>
      <figcaption className="px-1 sm:px-2 py-2 sm:py-2.5">
        <span className={`block text-xs sm:text-base font-medium leading-tight ${accent ? "text-ink" : ""}`}>{label}</span>
        <span className="block text-[0.625rem] sm:text-sm text-muted leading-tight mt-0.5">{sub}</span>
      </figcaption>
    </figure>
  );
}

function Thumb({ label, img, swatch }: { label: string; img: string | null; swatch?: string }) {
  return (
    <li>
      <div className="relative overflow-hidden rounded-lg bg-sand aspect-[3/4]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={label} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 skeleton" />
        )}
      </div>
      <p className="mt-1.5 text-xs flex items-center gap-1.5">
        {swatch && <span className="h-3 w-3 rounded-full border border-line shrink-0" style={{ background: swatch }} aria-hidden />}
        {label}
      </p>
    </li>
  );
}

const ZONE_CONCERNS: Record<string, string[]> = { redness: ["hd_redness"], darkCircle: ["hd_dark_circle"], spots: ["hd_age_spot", "hd_acne"] };
const ZONE_LABEL: Record<string, string> = { redness: "Redness", darkCircle: "Dark circles", spots: "Spots & marks" };

function MetricsCard({ metrics, plan }: { metrics: { bare: Metrics; heavy: Metrics; correct: Metrics } | null; plan: NonNullable<Analysis["plan"]> }) {
  if (!metrics) return <div className="card p-5 skeleton h-48" aria-label="Measuring results" />;
  const active = (zone: string) => plan.concerns.some((c) => ZONE_CONCERNS[zone].includes(c.key) && c.severity !== "none");
  const TIE = 0.3; // ΔE below ~0.3 is imperceptible – count as a tie
  type Row = { key: string; label: string; bare?: number; heavy?: number; correct?: number };
  const rows: Row[] = [];
  for (const zone of ["redness", "darkCircle", "spots"] as const) {
    // Skip zones that are barely visible on bare skin (ΔE < 2.5) – measuring "improvement" there is just noise.
    const bareVis = metrics.bare.visibility[zone];
    if (!active(zone) || bareVis === undefined || bareVis < 2.5) continue;
    rows.push({ key: zone, label: ZONE_LABEL[zone], bare: bareVis, heavy: metrics.heavy.visibility[zone], correct: metrics.correct.visibility[zone] });
  }
  const wins = rows.filter((r) => r.correct !== undefined && r.heavy !== undefined && r.correct <= r.heavy + TIE).length;
  const reduction = (b?: number, x?: number) => (b === undefined || x === undefined || b === 0 ? 0 : Math.round(((b - x) / b) * 100));
  return (
    <div className="card p-5">
      <p className="eyebrow">Measured on your photo</p>
      <p className="mt-2 font-medium text-lg leading-snug">
        {rows.length ? (
          <>
            CORRECT did as well or better on {wins} of {rows.length} {rows.length === 1 ? "concern" : "concerns"}, with {plan.correctedCoverage * 2 <= plan.heavyCoverage ? "less than half the" : "much less"} coverage ({plan.correctedCoverage}% vs {plan.heavyCoverage}%).
          </>
        ) : (
          <>Nothing strongly visible to compare. Your skin looks even already.</>
        )}
      </p>
      <p className="mt-1 text-sm text-muted">How much less visible each concern became (higher bar = better):</p>
      <div className="mt-4 space-y-5">
        {rows.map((r) => {
          const h = reduction(r.bare, r.heavy);
          const c = reduction(r.bare, r.correct);
          const diff = (r.correct ?? 99) - (r.heavy ?? 99);
          const verdict = Math.abs(diff) <= TIE ? "About the same" : diff < 0 ? "CORRECT does better" : "Foundation does better";
          return (
            <div key={r.key}>
              <p className="text-sm font-medium flex items-center justify-between">
                {r.label}
                <span className={`text-xs font-normal ${diff < -TIE ? "text-[#3F6B39]" : "text-muted"}`}>{verdict}</span>
              </p>
              <Bar label={`Foundation ${plan.heavyCoverage}%`} value={h} tone="muted" />
              <Bar label={`CORRECT ${plan.correctedCoverage}%`} value={c} tone="accent" />
            </div>
          );
        })}
      </div>
      <details className="mt-5 group text-sm">
        <summary className="cursor-pointer font-medium text-rose-dark list-none flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform" aria-hidden>
            ›
          </span>{" "}
          How is this measured?
        </summary>
        <div className="mt-2 space-y-2 text-muted leading-relaxed">
          <p>
            For every area YouCam flagged, we compare its colour with the skin right around it (CIELAB ΔE). The smaller the difference, the less you notice it. The bar shows how much that difference
            shrank compared with your bare skin.
          </p>
          <div className="overflow-x-auto"><table className="w-full min-w-[320px] text-xs mt-2">
            <thead>
              <tr className="text-left">
                <th className="font-medium py-1">Concern (ΔE, lower = better)</th>
                <th className="font-medium">Bare</th>
                <th className="font-medium">Foundation</th>
                <th className="font-medium">CORRECT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td className="py-1">{r.label}</td>
                  <td>{r.bare?.toFixed(1)}</td>
                  <td>{r.heavy?.toFixed(1)}</td>
                  <td>{r.correct?.toFixed(1)}</td>
                </tr>
              ))}
              {metrics.bare.rednessA !== undefined && active("redness") && (
                <tr className="border-t border-line">
                  <td className="py-1">Redness level (a*)</td>
                  <td>{metrics.bare.rednessA.toFixed(1)}</td>
                  <td>{metrics.heavy.rednessA?.toFixed(1)}</td>
                  <td>{metrics.correct.rednessA?.toFixed(1)}</td>
                </tr>
              )}
            </tbody>
          </table></div>
          <p>Differences under {TIE} ΔE are invisible, so they count as a tie. We show the result honestly either way.</p>
        </div>
      </details>
    </div>
  );
}

function Bar({ label, value, tone }: { label: string; value: number; tone: "muted" | "accent" }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-2 flex items-center gap-3 text-xs">
      <span className="w-28 shrink-0 text-muted">{label}</span>
      <span className="relative h-3 flex-1 rounded-full bg-sand overflow-hidden" role="img" aria-label={`${label}: ${value}% less visible`}>
        <span className={`absolute inset-y-0 left-0 rounded-full ${tone === "accent" ? "bg-sage" : "bg-ink/35"}`} style={{ width: `${v}%` }} />
      </span>
      <span className={`w-12 text-right font-medium ${tone === "accent" ? "text-ink" : "text-muted"}`}>{value > 0 ? `−${value}%` : `${-value}%`}</span>
    </div>
  );
}
