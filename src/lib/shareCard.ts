// Renders a shareable 1080×1350 "routine card" (Instagram portrait size) entirely in the browser.
import { loadImage } from "./measure";
import type { Plan } from "./rules";
import type { Product } from "./catalog";

type KitItem = { step: Plan["steps"][number]; product: Product };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawCover(ctx: CanvasRenderingContext2D, src: string, x: number, y: number, w: number, h: number, r = 24) {
  const img = await loadImage(src);
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dark = false) {
  ctx.font = "600 26px Inter, system-ui, sans-serif";
  const w = ctx.measureText(text).width + 32;
  roundRect(ctx, x, y, w, 46, 23);
  ctx.fillStyle = dark ? "#2A2320" : "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.fillStyle = dark ? "#FBF7F2" : "#2A2320";
  ctx.fillText(text, x + 16, y + 32);
}

export async function renderRoutineCard(opts: { before: string; after: string; afterLabel: string; plan: Plan; kit: KitItem[] }): Promise<Blob> {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  await document.fonts?.ready;
  ctx.fillStyle = "#FBF7F2";
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = "rgba(180,80,94,0.85)";
  ctx.beginPath();
  ctx.arc(84, 86, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(111,148,104,0.9)";
  ctx.beginPath();
  ctx.arc(110, 86, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2A2320";
  ctx.font = "500 44px Fraunces, Georgia, serif";
  ctx.fillText("correct", 150, 101);
  ctx.font = "400 26px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#7A6D64";
  ctx.textAlign = "right";
  ctx.fillText("My colour-correction routine", W - 60, 98);
  ctx.textAlign = "left";

  // Before / after
  const iy = 150, iw = 465, ih = 560;
  await drawCover(ctx, opts.before, 60, iy, iw, ih);
  await drawCover(ctx, opts.after, W - 60 - iw, iy, iw, ih);
  label(ctx, "Before", 80, iy + 20);
  label(ctx, opts.afterLabel, W - 60 - iw + 20, iy + 20, true);

  // Skin line
  const p = opts.plan.profile;
  let y = iy + ih + 70;
  ctx.fillStyle = p.skinHex;
  ctx.beginPath();
  ctx.arc(84, y - 12, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2A2320";
  ctx.font = "600 32px Inter, system-ui, sans-serif";
  ctx.fillText(`${p.depthLabel} skin${p.fitzpatrick ? ` · Fitzpatrick ${p.fitzpatrick}` : ""} · ${p.undertone} undertone`, 122, y);

  // Steps
  y += 50;
  for (let i = 0; i < opts.kit.length; i++) {
    const { step, product } = opts.kit[i];
    roundRect(ctx, 60, y, W - 120, 104, 24);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#E6DBCD";
    ctx.lineWidth = 2;
    ctx.stroke();
    roundRect(ctx, 80, y + 18, 68, 68, 18);
    ctx.fillStyle = step.color;
    ctx.fill();
    ctx.fillStyle = "#B4505E";
    ctx.font = "700 22px Inter, system-ui, sans-serif";
    ctx.fillText(`STEP ${i + 1}`, 172, y + 40);
    ctx.fillStyle = "#2A2320";
    ctx.font = "600 30px Inter, system-ui, sans-serif";
    ctx.fillText(step.title, 172, y + 76);
    ctx.textAlign = "right";
    ctx.font = "400 24px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#7A6D64";
    ctx.fillText(product.name, W - 84, y + 44);
    ctx.fillText(`Shade ${product.shade}`, W - 84, y + 78);
    ctx.textAlign = "left";
    y += 120;
  }

  // Footer
  ctx.fillStyle = "#7A6D64";
  ctx.font = "400 22px Inter, system-ui, sans-serif";
  ctx.fillText("correct-youcam.vercel.app  ·  made with YouCam Skin AI + Makeup VTO", 60, H - 46);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/png"));
}
