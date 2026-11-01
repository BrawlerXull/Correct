// Demo retailer catalogue (fictional house brand "Hue Theory"). In production a store would map its own SKUs.
import { hexToLab, Lab, mix, rgbToHex, hexToRgb } from "./color";

export type Product = {
  sku: string;
  name: string;
  kind: "green-corrector" | "warm-corrector" | "skin-tint" | "full-coverage";
  shade: string;
  hex: string;
  price: number;
  size: string;
};

const greens: Product[] = [
  { sku: "HT-GC-01", name: "Calm Down Green Primer", kind: "green-corrector", shade: "01 Mint", hex: "#B9D9A9", price: 22, size: "30 ml" },
  { sku: "HT-GC-02", name: "Calm Down Green Primer", kind: "green-corrector", shade: "02 Sage", hex: "#9CB585", price: 22, size: "30 ml" },
  { sku: "HT-GC-03", name: "Calm Down Green Primer", kind: "green-corrector", shade: "03 Olive", hex: "#7F8452", price: 22, size: "30 ml" },
];
const warms: Product[] = [
  ["01 Bisque", "#F2C4B4"],
  ["02 Peach", "#EEB497"],
  ["03 Apricot", "#E3A070"],
  ["04 Tangerine", "#D3864E"],
  ["05 Paprika", "#B8633A"],
  ["06 Brick", "#94442A"],
].map(([shade, hex], i) => ({
  sku: `HT-WC-0${i + 1}`,
  name: "Lights On Colour Corrector",
  kind: "warm-corrector" as const,
  shade,
  hex,
  price: 14,
  size: "4 ml",
}));

// Sheer skin-tint range spanning fair -> rich, each depth in neutral / warm / cool.
const ANCHORS = ["#F6DCC9", "#EBC5A9", "#DDAD8A", "#C9946E", "#B07A55", "#8F5E3E", "#6E4329", "#4E2E1C", "#3A2216", "#2A1911"];
const tints: Product[] = [];
let n = 1;
const grey = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  const m = (r + g + b) / 3;
  return rgbToHex([m, m, m]);
};
for (let i = 0; i < ANCHORS.length - 1; i++) {
  for (const t of [0, 0.5]) {
    const base = mix(ANCHORS[i], ANCHORS[i + 1], t);
    // Each depth comes in Neutral (muted), Warm (golden) and Cool (rosy) – like a real 50+ shade range.
    const variants: [string, string][] = [
      ["N", mix(base, grey(base), 0.32)],
      ["W", mix(base, "#E0B060", 0.08)],
      ["C", mix(mix(base, grey(base), 0.15), "#D08C9C", 0.08)],
    ];
    for (const [fam, hex] of variants) {
      tints.push({ sku: `HT-ST-${String(n).padStart(2, "0")}${fam}`, name: "Barely Skin Tint", kind: "skin-tint", shade: `${String(n).padStart(2, "0")}${fam}`, hex, price: 24, size: "30 ml" });
    }
    n++;
  }
}
tints.push({ sku: `HT-ST-${n}N`, name: "Barely Skin Tint", kind: "skin-tint", shade: `${n}N`, hex: ANCHORS[ANCHORS.length - 1], price: 24, size: "30 ml" });

export const CATALOG: Product[] = [...greens, ...warms, ...tints];
export const FULL_COVERAGE_PRICE = 42; // typical full-coverage foundation the shopper would otherwise buy

// CIEDE2000 colour difference.
export function deltaE2000(l1: Lab, l2: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(l1.a, l1.b), C2 = Math.hypot(l2.a, l2.b);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1 = (1 + G) * l1.a, a2 = (1 + G) * l2.a;
  const c1 = Math.hypot(a1, l1.b), c2 = Math.hypot(a2, l2.b);
  const h = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const v = Math.atan2(b, a) / rad;
    return v < 0 ? v + 360 : v;
  };
  const h1 = h(a1, l1.b), h2 = h(a2, l2.b);
  const dL = l2.L - l1.L, dC = c2 - c1;
  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * rad);
  const Lb = (l1.L + l2.L) / 2, cb = (c1 + c2) / 2;
  let hb = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hb = (h1 + h2) / 2;
    else hb = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(cb ** 7 / (cb ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * cb, Sh = 1 + 0.015 * cb * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

export function closest(kind: Product["kind"], hex: string) {
  const target = hexToLab(hex);
  return CATALOG.filter((p) => p.kind === kind)
    .map((p) => ({ product: p, dE: deltaE2000(target, hexToLab(p.hex)) }))
    .sort((a, b) => a.dE - b.dE)[0];
}
