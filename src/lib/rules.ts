// The colour-correction rule engine: concern x depth x undertone -> corrector shade + layering plan.
// Colour theory: complementary hues cancel. Green cancels red; peach/orange/red cancels blue-violet
// (dark circles) and brown-grey (hyperpigmentation). The deeper the skin, the deeper and warmer
// the corrector has to be, or it turns ashy.
import { Depth, Undertone, mix, skinProfile, DEPTH_LABEL } from "./color";

export type Scores = Partial<Record<"hd_redness" | "hd_dark_circle" | "hd_age_spot" | "hd_acne", number>>; // ui_score, higher = healthier

export type Severity = "none" | "mild" | "moderate" | "strong";
export function severity(ui?: number): Severity {
  if (ui === undefined) return "none";
  if (ui >= 85) return "none";
  if (ui >= 75) return "mild";
  if (ui >= 62) return "moderate";
  return "strong";
}
const SEV_W: Record<Severity, number> = { none: 0, mild: 0.45, moderate: 0.7, strong: 1 };

const GREEN: Record<Depth, string> = {
  fair: "#B9D9A9",
  light: "#AACB98",
  medium: "#9CB585",
  tan: "#8EA06E",
  deep: "#7F8452",
  rich: "#6E6C42",
};
const ORANGE: Record<Depth, string> = {
  fair: "#F2C4B4", // pink-bisque
  light: "#EEB497", // peach
  medium: "#E3A070", // apricot
  tan: "#D3864E", // orange
  deep: "#B8633A", // red-orange
  rich: "#94442A", // brick red
};
const ORANGE_NAME: Record<Depth, string> = {
  fair: "pink-bisque",
  light: "peach",
  medium: "apricot",
  tan: "orange",
  deep: "red-orange",
  rich: "brick-red",
};

function undertoneShift(hex: string, u: Undertone) {
  if (u === "warm" || u === "olive") return mix(hex, "#F0D27A", 0.12); // a touch more yellow
  if (u === "cool") return mix(hex, "#E8A6B4", 0.1); // a touch more pink
  return hex;
}

// YouCam applies skin smoothing (50) by default on every Makeup VTO call; across a 3-pass chain that
// compounds into an airbrushed face. We turn it off everywhere so all renders keep real skin texture.
const NO_SMOOTH = { category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 };

export type Step = {
  id: string;
  title: string;
  why: string;
  where: string;
  color: string;
  colorName: string;
  matchHex: string; // shade used to pick the catalogue product
  effects: unknown[];
};

export type Plan = {
  profile: ReturnType<typeof skinProfile> & {
    skinHex: string;
    depthLabel: string;
    itaDepth: Depth;
    fitzpatrick: string | null;
    depthAgreement: "agree" | "close" | "override" | "unavailable";
  };
  concerns: { key: string; label: string; ui: number; severity: Severity }[];
  foundationHex: string;
  steps: Step[]; // chained, in order; each step renders on top of the previous one
  heavyEffects: unknown[]; // what most people do: full-coverage foundation only
  correctedCoverage: number;
  heavyCoverage: number;
};

const LABEL: Record<string, string> = {
  hd_redness: "Redness",
  hd_dark_circle: "Dark circles",
  hd_age_spot: "Dark spots",
  hd_acne: "Blemishes",
};

const DEPTHS: Depth[] = ["fair", "light", "medium", "tan", "deep", "rich"];
const FITZ_INDEX: Record<string, number> = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5 };

/**
 * Two independent depth signals: our ITA° colorimetry (precise but lighting-sensitive) and YouCam's
 * Fitzpatrick model (robust to lighting, coarser). If they agree within one band we trust ITA°;
 * if they disagree by 2+ bands the photo's lighting probably skewed the colour, so Fitzpatrick wins.
 */
export function reconcileDepth(itaDepth: Depth, fitz?: string | null) {
  const fi = fitz ? FITZ_INDEX[fitz] : undefined;
  if (fi === undefined) return { depth: itaDepth, agreement: "unavailable" as const };
  const ii = DEPTHS.indexOf(itaDepth);
  const gap = Math.abs(ii - fi);
  if (gap === 0) return { depth: itaDepth, agreement: "agree" as const };
  if (gap === 1) return { depth: itaDepth, agreement: "close" as const };
  return { depth: DEPTHS[fi], agreement: "override" as const };
}

export function buildPlan(skinHex: string, scores: Scores, fitz?: string | null): Plan {
  const measured = skinProfile(skinHex);
  const rec = reconcileDepth(measured.depth, fitz);
  const p = { ...measured, depth: rec.depth, itaDepth: measured.depth, fitzpatrick: fitz ?? null, depthAgreement: rec.agreement };
  const concerns = (Object.keys(LABEL) as (keyof Scores)[])
    .filter((k) => scores[k] !== undefined)
    .map((k) => ({ key: k, label: LABEL[k], ui: scores[k]!, severity: severity(scores[k]) }));
  const sev = (k: keyof Scores) => severity(scores[k]);

  // Foundation: matched to measured skin, lifted ~6% (camera skin samples read slightly dark).
  const foundationHex = mix(skinHex, "#FFFFFF", 0.06);
  const steps: Step[] = [];

  const red = SEV_W[sev("hd_redness")];
  const acne = SEV_W[sev("hd_acne")];
  const deepSkin = p.depth === "deep" || p.depth === "rich";
  // On deep skin, blemishes read as dark marks rather than red, so green would turn ashy – only use it for real redness.
  if (red > 0 || (acne > 0.6 && !deepSkin)) {
    // Real green primers are green-tinted beige, not pure green – blend toward the skin shade.
    const pure = undertoneShift(GREEN[p.depth], p.undertone);
    const c = mix(pure, mix(skinHex, "#FFFFFF", 0.06), 0.4);
    const w = Math.max(red, acne * 0.8);
    steps.push({
      id: "green",
      title: "Green primer where you flush",
      why: `Green sits opposite red on the colour wheel, so a sheer green-tinted primer cancels flushing instead of burying it under foundation. For ${DEPTH_LABEL[p.depth].toLowerCase()} skin a ${p.depth === "deep" || p.depth === "rich" ? "muted olive" : "soft mint"} green avoids a grey cast.`,
      where: "A thin veil of green-tinted primer only where the redness map is lit – cheeks, around the nose, chin. Tap, don’t rub.",
      color: c,
      colorName: p.depth === "deep" || p.depth === "rich" ? "olive-green primer" : "green-beige primer",
      matchHex: pure,
      effects: [
        NO_SMOOTH,
        {
          // A sheer green primer laid over the whole face neutralises diffuse redness; YouCam's concealer
          // effect only dabs detected spots, so we use the foundation layer with a green-beige primer shade.
          category: "foundation",
          palettes: [{ color: c, colorIntensity: Math.round(30 + 15 * w), glowIntensity: 0, coverageIntensity: Math.round(25 + 12 * w) }],
        },
      ],
    });
  }

  const dc = SEV_W[sev("hd_dark_circle")];
  // Warm spot-correction targets hyperpigmentation, which shows most on medium-to-deep skin; on fair/light skin
  // a peach dab on a light spot reads as a pale dot, so spots there are left to the skin-shade concealer.
  const lighter = p.depth === "fair" || p.depth === "light";
  const spot = lighter ? 0 : Math.max(SEV_W[sev("hd_age_spot")], deepSkin ? SEV_W[sev("hd_acne")] * 0.8 : 0);
  if (dc > 0 || spot > 0) {
    const c = undertoneShift(ORANGE[p.depth], p.undertone);
    steps.push({
      id: "peach",
      title: dc >= spot ? "Cancel dark circles" : "Cancel dark spots",
      why: `Under-eye shadow and hyperpigmentation read blue-violet to grey-brown. Their opposite is ${ORANGE_NAME[p.depth]} – matched to your depth (ITA ${p.ita}°) so it brightens without turning ashy or orange.`,
      where: dc > 0 ? "Inner corner and the darkest half-moon under each eye, plus any dark spots. Press in with a ring finger." : "Only on the dark spots the map highlights.",
      color: c,
      colorName: ORANGE_NAME[p.depth],
      matchHex: c,
      effects: [
        NO_SMOOTH,
        {
          category: "concealer",
          palettes: [
            {
              color: c,
              colorIntensity: Math.round(spot > 0 ? 10 + 18 * spot : 0),
              colorUnderEyeIntensity: Math.round(dc > 0 ? 55 + 45 * dc : 0),
              coverageLevel: Math.round(55 + 40 * Math.max(dc, spot)),
            },
          ],
        },
      ],
    });
  }

  const worst = Math.max(red, dc, spot, acne);
  const correctedCoverage = Math.round(30 + 12 * worst); // sheer: 30-42%
  steps.push({
    id: "tint",
    title: "Sheer, matched base",
    why: `With the colour already cancelled you only need ${correctedCoverage}% coverage to even out tone – not a full-coverage mask.`,
    where: "One thin layer over everything, pressed (not swiped) over the corrected areas. Then a pin-point of concealer in your own shade on any spot still showing.",
    color: foundationHex,
    colorName: "your shade",
    matchHex: foundationHex,
    effects: [
      NO_SMOOTH,
      { category: "foundation", palettes: [{ color: foundationHex, colorIntensity: 55, glowIntensity: 15, coverageIntensity: correctedCoverage }] },
      // spot-conceal any remaining blemishes in the skin's own shade (concealer renders on top of foundation)
      { category: "concealer", palettes: [{ color: skinHex, colorIntensity: 30, colorUnderEyeIntensity: 0, coverageLevel: 45 }] },
    ],
  });

  const heavyCoverage = 95;
  return {
    profile: { ...p, skinHex, depthLabel: DEPTH_LABEL[p.depth] },
    concerns,
    foundationHex,
    steps,
    heavyEffects: [
      NO_SMOOTH,
      { category: "foundation", palettes: [{ color: foundationHex, colorIntensity: 90, glowIntensity: 0, coverageIntensity: heavyCoverage }] },
    ],
    correctedCoverage,
    heavyCoverage,
  };
}
