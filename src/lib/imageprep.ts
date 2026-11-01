// Server-side size guarantee for YouCam HD Skin Analysis (short side >= 1080, long side <= 4096).
// Small crops are upscaled with YouCam AI Photo Enhance (real super-resolution, 2 units) and fall back
// to a Lanczos resize if Enhance is unavailable.
import "server-only";
import sharp from "sharp";
import { runTask, uploadFile } from "./youcam";

export const HD_MIN_SHORT = 1080;
const TARGET_SHORT = 1200; // a little headroom above the minimum
const MAX_LONG = 4096;

export type Upscale = "none" | "ai-enhance" | "resample";

export async function ensureHdSize(input: Buffer): Promise<{ bytes: Buffer; width: number; height: number; upscale: Upscale; enhanceScale?: number }> {
  // Normalise: honour EXIF orientation, strip metadata, JPEG.
  let img = sharp(input, { failOn: "none" }).rotate();
  let { width = 0, height = 0 } = await img.metadata().then((m) => (m.orientation && m.orientation >= 5 ? { width: m.height, height: m.width } : m));
  let upscale: Upscale = "none";
  let enhanceScale: number | undefined;
  let buf = await img.jpeg({ quality: 93 }).toBuffer();

  const short = Math.min(width, height);
  if (short < HD_MIN_SHORT) {
    const scale = short * 2 >= HD_MIN_SHORT ? 2 : 4;
    try {
      const fileId = await uploadFile("enhance", buf);
      const r = await runTask("enhance", { src_file_id: fileId, scale });
      const res = await fetch(r.results.url as string, { cache: "no-store" });
      if (!res.ok) throw new Error("enhance download failed");
      buf = Buffer.from(await res.arrayBuffer());
      upscale = "ai-enhance";
      enhanceScale = scale;
    } catch {
      upscale = "resample";
    }
    img = sharp(buf);
    const m = await img.metadata();
    width = m.width || width * (upscale === "ai-enhance" ? scale : 1);
    height = m.height || height * (upscale === "ai-enhance" ? scale : 1);
  }

  // Final resize so the short side is ~TARGET_SHORT (never below the minimum) and long side <= 4096.
  const s = Math.min(TARGET_SHORT / Math.min(width, height), MAX_LONG / Math.max(width, height));
  const needsResize = Math.min(width, height) < HD_MIN_SHORT || Math.max(width, height) > MAX_LONG || upscale !== "none";
  if (needsResize) {
    const w = Math.round((width * s) / 2) * 2;
    const h = Math.round((height * s) / 2) * 2;
    buf = await sharp(buf).resize(w, h, { kernel: "lanczos3", fit: "fill" }).jpeg({ quality: 93 }).toBuffer();
    width = w;
    height = h;
  }
  return { bytes: buf, width, height, upscale, enhanceScale };
}
