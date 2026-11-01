import { describe, expect, it } from "vitest";
import { hexToLab, rgbToLab, skinProfile, mix } from "../src/lib/color";
import { deltaE2000, closest, CATALOG } from "../src/lib/catalog";
import { buildPlan, reconcileDepth, severity } from "../src/lib/rules";

describe("colour science", () => {
  it("converts sRGB to CIELAB (white, black, pure red)", () => {
    const w = rgbToLab([255, 255, 255]);
    expect(w.L).toBeCloseTo(100, 1);
    expect(Math.abs(w.a)).toBeLessThan(0.5);
    expect(rgbToLab([0, 0, 0]).L).toBeCloseTo(0, 1);
    const r = rgbToLab([255, 0, 0]);
    expect(r.L).toBeCloseTo(53.24, 0);
    expect(r.a).toBeCloseTo(80.09, 0);
  });

  it("CIEDE2000 matches Sharma et al. (2005) reference pairs", () => {
    // Test data from Sharma, Wu & Dalal, "The CIEDE2000 colour-difference formula".
    const pairs: [number[], number[], number][] = [
      [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
      [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
      [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
      [[50, 2.5, 0], [73, 25, -18], 27.1492],
      [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    ];
    for (const [a, b, want] of pairs) {
      const got = deltaE2000({ L: a[0], a: a[1], b: a[2] }, { L: b[0], a: b[1], b: b[2] });
      expect(got).toBeCloseTo(want, 3);
    }
  });

  it("classifies skin depth by ITA° from fair to rich", () => {
    expect(skinProfile("#E8C4AE").depth).toBe("fair");
    expect(skinProfile("#B7937C").depth).toBe("light");
    expect(skinProfile("#9F7658").depth).toBe("tan");
    expect(skinProfile("#3D2A20").depth).toBe("rich");
    // depth ordering is monotonic in lightness
    expect(skinProfile("#E8C4AE").ita).toBeGreaterThan(skinProfile("#3D2A20").ita);
  });

  it("mixes colours linearly", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });
});

describe("rule engine", () => {
  it("maps YouCam ui_score (higher = healthier) to severity", () => {
    expect(severity(95)).toBe("none");
    expect(severity(80)).toBe("mild");
    expect(severity(70)).toBe("moderate");
    expect(severity(50)).toBe("strong");
  });

  it("uses a green primer for redness and a warm corrector for dark circles", () => {
    const plan = buildPlan("#B7937C", { hd_redness: 55, hd_dark_circle: 70, hd_age_spot: 90, hd_acne: 90 });
    expect(plan.steps.map((s) => s.id)).toEqual(["green", "peach", "tint"]);
    const g = hexToLab(plan.steps[0].matchHex);
    expect(g.a).toBeLessThan(0); // green side of the a* axis
    const w = hexToLab(plan.steps[1].color);
    expect(w.a).toBeGreaterThan(5); // warm
  });

  it("never adds green to deep skin unless there is real redness", () => {
    const plan = buildPlan("#3D2A20", { hd_redness: 99, hd_acne: 60, hd_dark_circle: 60, hd_age_spot: 83 });
    expect(plan.steps.find((s) => s.id === "green")).toBeUndefined();
    expect(plan.steps[0].colorName).toBe("brick-red");
  });

  it("corrector shade deepens with skin depth", () => {
    const L = (hex: string) => buildPlan(hex, { hd_dark_circle: 60 }).steps[0].color;
    expect(hexToLab(L("#E8C4AE")).L).toBeGreaterThan(hexToLab(L("#3D2A20")).L);
  });

  it("uses far less coverage than the full-coverage baseline", () => {
    const plan = buildPlan("#B7937C", { hd_redness: 40 });
    expect(plan.correctedCoverage).toBeLessThanOrEqual(42);
    expect(plan.heavyCoverage).toBe(95);
  });

  it("disables YouCam's default skin smoothing on every pass", () => {
    const plan = buildPlan("#B7937C", { hd_redness: 40, hd_dark_circle: 60 });
    for (const effects of [plan.heavyEffects, ...plan.steps.map((s) => s.effects)]) {
      expect(effects).toContainEqual({ category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 });
    }
  });

  it("reconciles ITA° depth with YouCam Fitzpatrick type", () => {
    expect(reconcileDepth("light", "II")).toEqual({ depth: "light", agreement: "agree" });
    expect(reconcileDepth("light", "III")).toEqual({ depth: "light", agreement: "close" });
    expect(reconcileDepth("fair", "V")).toEqual({ depth: "deep", agreement: "override" });
    expect(reconcileDepth("tan", null).agreement).toBe("unavailable");
  });
});

describe("catalogue matching", () => {
  it("finds a tint within ΔE2000 3 for a wide range of skin tones", () => {
    for (const hex of ["#F1D3C0", "#E8C4AE", "#BB9984", "#B98563", "#8F5E3E", "#725748", "#3D2A20"]) {
      expect(closest("skin-tint", hex).dE).toBeLessThan(3);
    }
  });
  it("has a corrector for every depth", () => {
    expect(CATALOG.filter((p) => p.kind === "warm-corrector")).toHaveLength(6);
  });
});
