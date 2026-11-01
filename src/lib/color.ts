// Colour science helpers (shared by server + browser). sRGB D65 -> CIELAB.

export type RGB = [number, number, number];
export type Lab = { L: number; a: number; b: number };

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

const lin = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

export function rgbToLab([r, g, b]: RGB): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export const hexToLab = (hex: string) => rgbToLab(hexToRgb(hex));

/** Mix two hex colours (t = weight of b). */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export type Depth = "fair" | "light" | "medium" | "tan" | "deep" | "rich";
export type Undertone = "cool" | "neutral" | "warm" | "olive";

/** Depth from L*, using the Individual Typology Angle (ITA°) – the standard dermatology colorimetry measure. */
export function skinProfile(hex: string) {
  const lab = hexToLab(hex);
  const ita = (Math.atan2(lab.L - 50, lab.b) * 180) / Math.PI;
  // ITA° bands (Chardon et al.): >55 very light, 41-55 light, 28-41 intermediate, 10-28 tan, -30-10 brown, < -30 dark
  // Phone-camera skin samples skew darker than spectrophotometer readings, so bands are shifted ~8° down.
  let depth: Depth;
  if (ita > 47) depth = "fair";
  else if (ita > 33) depth = "light";
  else if (ita > 20) depth = "medium";
  else if (ita > 2) depth = "tan";
  else if (ita > -30) depth = "deep";
  else depth = "rich";
  // Undertone from hue angle in the a*/b* plane.
  const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  const chroma = Math.hypot(lab.a, lab.b);
  let undertone: Undertone;
  if (hue > 68 && chroma < 22) undertone = "olive";
  else if (hue > 60) undertone = "warm";
  else if (hue < 48) undertone = "cool";
  else undertone = "neutral";
  return { lab, ita: Math.round(ita * 10) / 10, hue: Math.round(hue), depth, undertone };
}

export const DEPTH_LABEL: Record<Depth, string> = {
  fair: "Fair",
  light: "Light",
  medium: "Medium",
  tan: "Tan",
  deep: "Deep",
  rich: "Rich deep",
};
