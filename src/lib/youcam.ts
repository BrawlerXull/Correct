// Server-only YouCam API client (v2, API-key bearer auth).
/* eslint-disable @typescript-eslint/no-explicit-any -- YouCam responses are loosely typed JSON */
// Every AI feature is: (optional) upload file -> start task -> poll until success/error.
import "server-only";

const BASE = process.env.YOUCAM_BASE_URL || "https://yce-api-01.makeupar.com";

function key() {
  const k = process.env.YOUCAM_API_KEY;
  if (!k) throw new Error("YOUCAM_API_KEY is not set");
  return k;
}

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`YouCam ${path} returned non-JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`YouCam ${path} failed (${res.status}): ${json.error_code || json.error || text.slice(0, 200)}`);
  }
  return json as T;
}

/** Upload raw bytes for a feature and return the file_id. */
export async function uploadFile(feature: string, bytes: Buffer, contentType = "image/jpeg"): Promise<string> {
  const r = await call("POST", `/s2s/v2.0/file/${feature}`, {
    files: [{ content_type: contentType, file_name: `upload.${contentType.split("/")[1]}`, file_size: bytes.length }],
  });
  const f = r.data.files[0];
  const up = f.requests[0];
  const put = await fetch(up.url, { method: up.method, headers: up.headers, body: new Uint8Array(bytes) });
  if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`);
  return f.file_id as string;
}

export type TaskResult = { task_status: "success" | "error"; results?: any; error?: string; error_message?: string };

/** Start a task and poll until it finishes. Polling must continue or YouCam times the task out (credits still spent). */
export async function runTask(feature: string, body: Record<string, unknown>, timeoutMs = 55_000): Promise<TaskResult> {
  const start = await call("POST", `/s2s/v2.0/task/${feature}`, body);
  const taskId = start.data.task_id as string;
  const t0 = Date.now();
  let wait = 1200;
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(wait + 300, 2500);
    const s = await call("GET", `/s2s/v2.0/task/${feature}/${taskId}`);
    const d = s.data;
    if (d.task_status === "success") return d;
    if (d.task_status === "error") {
      throw new Error(`YouCam ${feature} error: ${d.error || "unknown"}${d.error_message ? " – " + d.error_message : ""}`);
    }
  }
  throw new Error(`YouCam ${feature} timed out`);
}

/** Download a (2-hour signed) result URL into a data URL so the browser never depends on expiring links. */
export async function toDataUrl(url: string): Promise<string> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  const ct = r.headers.get("content-type") || (url.split("?")[0].endsWith(".png") ? "image/png" : "image/jpeg");
  const buf = Buffer.from(await r.arrayBuffer());
  return `data:${ct};base64,${buf.toString("base64")}`;
}

export const CONCERNS = ["hd_redness", "hd_dark_circle", "hd_age_spot", "hd_acne"] as const;
export type Concern = (typeof CONCERNS)[number];

export async function skinAnalysis(bytes: Buffer) {
  const fileId = await uploadFile("skin-analysis", bytes);
  const r = await runTask("skin-analysis", {
    src_file_id: fileId,
    dst_actions: CONCERNS,
    format: "json",
    miniserver_args: { enable_mask_overlay: false },
  });
  return r.results.output as Array<{ type: string; ui_score?: number; raw_score?: number; score?: number; mask_urls?: string[] }>;
}

export async function skinTone(bytes: Buffer) {
  const fileId = await uploadFile("skin-tone-analysis", bytes);
  const r = await runTask("skin-tone-analysis", { src_file_id: fileId });
  return r.results as {
    color: { skin_color: string; eye_color: string; lip_color: string; eyebrow_color: string };
    face_quality?: Record<string, string | boolean>;
  };
}

/** Makeup VTO. `src` is either raw bytes (first pass) or a previous result URL (chained pass). */
export async function makeupVto(src: Buffer | string, effects: unknown[]) {
  const source = typeof src === "string" ? { src_file_url: src } : { src_file_id: await uploadFile("makeup-vto", src) };
  const r = await runTask("makeup-vto", { ...source, version: "1.0", effects });
  return r.results.url as string;
}
