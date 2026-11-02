import { NextResponse } from "next/server";
import { transcribe, geminiConfigured } from "@/lib/gemini";
import { checkLimit } from "@/lib/ratelimit";
import { LANGUAGE_NAMES } from "@/lib/langnames";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Voice questions: the browser records a short clip, Gemini transcribes it. Works in Brave/Firefox/Safari too. */
export async function POST(req: Request) {
  try {
    const limited = checkLimit("voice", req);
    if (limited) return NextResponse.json({ error: limited }, { status: 429 });
    if (!geminiConfigured()) return NextResponse.json({ error: "Voice input unavailable" }, { status: 503 });
    const fd = await req.formData();
    const audio = fd.get("audio");
    const lang = String(fd.get("lang") || "en");
    if (!(audio instanceof Blob) || audio.size < 800) return NextResponse.json({ text: "" });
    if (audio.size > 4_000_000) return NextResponse.json({ error: "Recording too long – please keep it under 30 seconds." }, { status: 400 });
    const mime = (audio.type || "audio/webm").split(";")[0];
    const b64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const text = await transcribe(b64, mime, LANGUAGE_NAMES[lang] || "English");
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
