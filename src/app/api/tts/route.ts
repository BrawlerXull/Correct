import { synthesize, geminiConfigured } from "@/lib/gemini";
import { checkLimit } from "@/lib/ratelimit";
import { hash } from "@/lib/cache";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

const DIR = path.join(os.tmpdir(), "correct-tts");

/** Natural voice for "Listen" (Gemini TTS). Body: { text }. Returns audio/wav. Same text is served from disk cache. */
export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) return new Response("text required", { status: 400 });
    if (text.length > 1500) return new Response("text too long", { status: 400 });
    if (!geminiConfigured()) return new Response("voice unavailable", { status: 503 });
    const file = path.join(DIR, hash("v1", text) + ".wav");
    let wav: Buffer | null = await fs.readFile(file).catch(() => null);
    if (!wav) {
      const limited = checkLimit("voice", req);
      if (limited) return new Response(limited, { status: 429 });
      wav = await synthesize(text);
      fs.mkdir(DIR, { recursive: true })
        .then(() => fs.writeFile(file, wav!))
        .catch(() => {});
    }
    return new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 502 });
  }
}
