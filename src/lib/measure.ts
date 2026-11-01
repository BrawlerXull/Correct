// Browser-side measurement: read YouCam Skin Analysis masks to find the flagged zones, then
// measure colour inside those zones on the bare photo and on each render.
import { rgbToLab, hexToRgb } from "./color";

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image load failed"));
    img.src = src;
  });
}

function pixels(img: HTMLImageElement, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

export type Zones = { w: number; h: number; redness?: Uint8Array; darkCircle?: Uint8Array; spots?: Uint8Array };

/** Decode YouCam masks: grey (61,61,61) = dimmed background; coloured pixels = flagged; dark-circle mask is alpha-only. */
export async function zonesFromMasks(masks: Record<string, string>): Promise<Zones | null> {
  const any = Object.values(masks)[0];
  if (!any) return null;
  const first = await loadImage(any);
  const w = first.naturalWidth, h = first.naturalHeight;
  const z: Zones = { w, h };
  const colored = (d: Uint8ClampedArray, i: number) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 50 && d[i + 3] > 0;
  for (const [key, url] of Object.entries(masks)) {
    const d = pixels(await loadImage(url), w, h);
    const m = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      if (key === "hd_dark_circle") m[p] = d[i + 3] > 14 ? Math.min(255, d[i + 3] * 2) : 0;
      else m[p] = colored(d, i) ? 255 : 0;
    }
    if (key === "hd_redness") z.redness = m;
    if (key === "hd_dark_circle") z.darkCircle = m;
    if (key === "hd_age_spot") {
      z.spots = m;
    }
    if (key === "hd_acne" && z.spots) for (let p = 0; p < m.length; p++) z.spots[p] = Math.max(z.spots[p], m[p]);
    if (key === "hd_acne" && !z.spots) z.spots = m;
  }
  return z;
}

export type ZoneKey = "redness" | "darkCircle" | "spots";
export type Metrics = {
  rednessA?: number; // mean CIELAB a* inside the redness zone
  visibility: Partial<Record<ZoneKey, number>>; // ΔE between the zone and the skin ring around it – lower = less visible
};

/** Box-dilate a binary mask by r px using an integral image (fast, O(w*h)). */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const I = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x] ? 1 : 0;
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      out[y * w + x] = s > 0 ? 1 : 0;
    }
  }
  return out;
}

type Ring = { zone: Uint8Array; ring: Uint8Array };
const ringCache = new WeakMap<Zones, Partial<Record<ZoneKey, Ring>>>();

/** For each zone: the zone itself (binary) and a ring of skin ~3% of face width around it, excluding every flagged zone. */
function rings(z: Zones) {
  const hit = ringCache.get(z);
  if (hit) return hit;
  const n = z.w * z.h;
  const bin = (m?: Uint8Array, thr = 0) => {
    if (!m) return undefined;
    const b = new Uint8Array(n);
    for (let p = 0; p < n; p++) b[p] = m[p] > thr ? 1 : 0;
    return b;
  };
  const zones: Partial<Record<ZoneKey, Uint8Array>> = { redness: bin(z.redness), darkCircle: bin(z.darkCircle, 60), spots: bin(z.spots) };
  const all = new Uint8Array(n);
  for (const m of Object.values(zones)) if (m) for (let p = 0; p < n; p++) all[p] |= m[p];
  const allD = dilate(all, z.w, z.h, 3);
  const r = Math.max(8, Math.round(z.w * 0.03));
  const out: Partial<Record<ZoneKey, Ring>> = {};
  for (const [k, m] of Object.entries(zones) as [ZoneKey, Uint8Array | undefined][]) {
    if (!m) continue;
    let count = 0;
    for (let p = 0; p < n; p++) count += m[p];
    if (count < 300) continue;
    const d = dilate(m, z.w, z.h, r);
    const ring = new Uint8Array(n);
    for (let p = 0; p < n; p++) ring[p] = d[p] && !allD[p] ? 1 : 0;
    out[k] = { zone: m, ring };
  }
  ringCache.set(z, out);
  return out;
}

export async function measure(src: string, z: Zones): Promise<Metrics> {
  const d = pixels(await loadImage(src), z.w, z.h);
  const n = z.w * z.h;
  // Lab for every pixel once.
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const lab = rgbToLab([d[i], d[i + 1], d[i + 2]]);
    L[p] = lab.L;
    A[p] = lab.a;
    B[p] = lab.b;
  }
  const mean = (m: Uint8Array) => {
    let l = 0, a = 0, b = 0, c = 0;
    for (let p = 0; p < n; p++)
      if (m[p]) {
        l += L[p];
        a += A[p];
        b += B[p];
        c++;
      }
    return c ? { L: l / c, a: a / c, b: b / c, c } : null;
  };
  const vis: Metrics["visibility"] = {};
  for (const [k, r] of Object.entries(rings(z)) as [ZoneKey, Ring][]) {
    const zm = mean(r.zone), rm = mean(r.ring);
    if (zm && rm && rm.c > 300) vis[k] = Math.hypot(zm.L - rm.L, zm.a - rm.a, zm.b - rm.b);
  }
  const red = z.redness ? mean(z.redness) : null;
  return { rednessA: red && red.c > 300 ? red.a : undefined, visibility: vis };
}

/** Paint the corrector colours exactly where YouCam flagged each concern – the "dab map". */
export async function dabMap(photo: string, z: Zones, colors: { green?: string; warm?: string }): Promise<string> {
  const img = await loadImage(photo);
  const c = document.createElement("canvas");
  c.width = z.w;
  c.height = z.h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, z.w, z.h);
  const id = ctx.getImageData(0, 0, z.w, z.h);
  const d = id.data;
  const paint = (mask: Uint8Array | undefined, hex: string | undefined, alpha: number) => {
    if (!mask || !hex) return;
    const [r, g, b] = hexToRgb(hex);
    for (let p = 0; p < mask.length; p++) {
      if (!mask[p]) continue;
      const a = (mask[p] / 255) * alpha;
      const i = p * 4;
      d[i] = d[i] * (1 - a) + r * a;
      d[i + 1] = d[i + 1] * (1 - a) + g * a;
      d[i + 2] = d[i + 2] * (1 - a) + b * a;
    }
  };
  // dim everything slightly so the map pops
  for (let i = 0; i < d.length; i += 4) {
    d[i] *= 0.82;
    d[i + 1] *= 0.82;
    d[i + 2] *= 0.82;
  }
  paint(z.redness, colors.green, 0.62);
  paint(z.darkCircle, colors.warm, 0.85);
  paint(z.spots, colors.warm, 0.9);
  ctx.putImageData(id, 0, 0);
  return c.toDataURL("image/jpeg", 0.9);
}

/** Resize a user photo to <=1472px long side JPEG (keeps YouCam happy and uploads small). */
export async function normalisePhoto(file: File | Blob): Promise<{ dataUrl: string; blob: Blob }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, 1472 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round((img.naturalWidth * scale) / 2) * 2, h = Math.round((img.naturalHeight * scale) / 2) * 2;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const dataUrl = c.toDataURL("image/jpeg", 0.92);
    const blob = await (await fetch(dataUrl)).blob();
    return { dataUrl, blob };
  } finally {
    URL.revokeObjectURL(url);
  }
}
