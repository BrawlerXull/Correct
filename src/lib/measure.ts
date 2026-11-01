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

export type Metrics = { rednessA?: number; underEyeL?: number; px: { redness: number; darkCircle: number } };

export async function measure(src: string, z: Zones): Promise<Metrics> {
  const d = pixels(await loadImage(src), z.w, z.h);
  let sa = 0, na = 0, sl = 0, nl = 0;
  // sample every 2nd pixel for speed
  for (let p = 0; p < z.w * z.h; p += 2) {
    const i = p * 4;
    if (z.redness && z.redness[p]) {
      sa += rgbToLab([d[i], d[i + 1], d[i + 2]]).a;
      na++;
    }
    if (z.darkCircle && z.darkCircle[p] > 60) {
      sl += rgbToLab([d[i], d[i + 1], d[i + 2]]).L;
      nl++;
    }
  }
  return {
    rednessA: na > 200 ? sa / na : undefined,
    underEyeL: nl > 200 ? sl / nl : undefined,
    px: { redness: na, darkCircle: nl },
  };
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
