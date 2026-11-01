// On-device photo preparation (runs in the browser, before anything is uploaded).
//
// YouCam HD Skin Analysis needs: short side >= 1080 px, long side <= 4096 px, and the face must be wider
// than 60% of the image. Real-world uploads (landscape phone shots, webcam grabs, cropped screenshots)
// often break one of those. So we:
//   1. find the face on-device with MediaPipe BlazeFace (free, private, ~20 ms),
//   2. crop a 3:4 portrait around it so the face fills ~70% of the width,
//   3. send that crop to the server, which upscales it to >= 1080 px if needed (YouCam AI Photo Enhance).
import type { FaceDetector } from "@mediapipe/tasks-vision";
import { loadImage } from "./measure";

let detectorP: Promise<FaceDetector> | null = null;

function getDetector() {
  if (!detectorP) {
    detectorP = (async () => {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite", delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    })().catch((e) => {
      detectorP = null; // allow retry
      throw e;
    });
  }
  return detectorP;
}

/** Warm the detector up in the background (called when the page loads). */
export function preloadFaceDetector() {
  getDetector().catch(() => {});
}

export type PrepInfo = {
  originalW: number;
  originalH: number;
  cropped: boolean;
  faceFound: boolean | null; // null = detector unavailable, fell back to centre crop
  faces: number;
  cropW: number;
  cropH: number;
};

export class PrepError extends Error {}

const FACE_FRACTION = 0.7; // target face width / crop width (YouCam requires > 0.6)
const MAX_OUT_W = 1536; // larger adds upload time without improving analysis

export async function preparePhoto(file: File | Blob): Promise<{ blob: Blob; dataUrl: string; info: PrepInfo }> {
  const url = URL.createObjectURL(file);
  try {
    let img: HTMLImageElement;
    try {
      img = await loadImage(url); // browsers apply EXIF orientation automatically
    } catch {
      throw new PrepError("We couldn't read that file. Please use a JPG or PNG photo.");
    }
    const W = img.naturalWidth, H = img.naturalHeight;
    if (W < 160 || H < 160) throw new PrepError("That photo is too small. Please use a photo at least 400 pixels wide.");

    // --- 1. find the face (on a downscaled copy for speed) ---
    let face: { x: number; y: number; w: number; h: number } | null = null;
    let faces = 0;
    let faceFound: boolean | null = null;
    try {
      const det = await getDetector();
      const s = Math.min(1, 1024 / Math.max(W, H));
      const c = document.createElement("canvas");
      c.width = Math.round(W * s);
      c.height = Math.round(H * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const res = det.detect(c);
      const boxes = res.detections.map((d) => d.boundingBox!).filter(Boolean);
      faces = boxes.length;
      faceFound = faces > 0;
      if (faces) {
        const b = boxes.sort((a, b2) => b2.width * b2.height - a.width * a.height)[0]; // largest face
        face = { x: b.originX / s, y: b.originY / s, w: b.width / s, h: b.height / s };
      }
    } catch {
      faceFound = null; // detector failed to load (old browser) – fall back to a centre crop
    }
    if (faceFound === false) throw new PrepError("We couldn't find a face. Please use a clear, front-facing photo with your whole face visible.");

    // --- 2. 3:4 portrait crop around the face ---
    let cw: number, ch: number, cx: number, cy: number;
    if (face) {
      cw = face.w / FACE_FRACTION;
      ch = (cw * 4) / 3;
      cx = face.x + face.w / 2;
      cy = face.y + face.h * 0.45; // keep forehead + chin comfortably inside
    } else {
      cw = Math.min(W, (H * 3) / 4);
      ch = (cw * 4) / 3;
      cx = W / 2;
      cy = H / 2;
    }
    // Shrink to fit the image while keeping 3:4 (this only makes the face fraction larger, which is fine).
    if (cw > W) {
      cw = W;
      ch = (cw * 4) / 3;
    }
    if (ch > H) {
      ch = H;
      cw = Math.min(W, (ch * 3) / 4);
    }
    let x = Math.round(Math.max(0, Math.min(W - cw, cx - cw / 2)));
    let y = Math.round(Math.max(0, Math.min(H - ch, cy - ch / 2)));
    cw = Math.round(cw);
    ch = Math.round(ch);
    x = Math.max(0, Math.min(x, W - cw));
    y = Math.max(0, Math.min(y, H - ch));

    // --- 3. draw the crop (downscale big crops; upscaling is done server-side with AI enhance) ---
    const scale = Math.min(1, MAX_OUT_W / cw);
    const ow = Math.round((cw * scale) / 2) * 2, oh = Math.round((ch * scale) / 2) * 2;
    const out = document.createElement("canvas");
    out.width = ow;
    out.height = oh;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, cw, ch, 0, 0, ow, oh);
    const dataUrl = out.toDataURL("image/jpeg", 0.93);
    const blob = await (await fetch(dataUrl)).blob();
    return {
      blob,
      dataUrl,
      info: { originalW: W, originalH: H, cropped: cw < W || ch < H, faceFound, faces, cropW: ow, cropH: oh },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
