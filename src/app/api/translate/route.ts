import { NextResponse } from "next/server";
import { generate, geminiConfigured } from "@/lib/gemini";
import { checkLimit } from "@/lib/ratelimit";
import { cached, hash } from "@/lib/cache";
import { LANGUAGE_NAMES } from "@/lib/langnames";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Translate the short UI strings of a routine (step titles, "where", "why"). Body: { lang, strings: string[] } -> { strings } */
export async function POST(req: Request) {
  try {
    const { lang, strings } = await req.json();
    const language = LANGUAGE_NAMES[String(lang)];
    if (!language || lang === "en" || !Array.isArray(strings) || !strings.length) return NextResponse.json({ strings });
    if (strings.length > 40 || strings.some((s: unknown) => typeof s !== "string" || s.length > 800)) return NextResponse.json({ error: "too much text" }, { status: 400 });
    if (!geminiConfigured()) return NextResponse.json({ strings });
    const out = await cached(
      "tr-" + hash(String(lang), JSON.stringify(strings)),
      async () => {
        const limited = checkLimit("coach", req);
        if (limited) throw new Error(limited);
        const txt = await generate(
          `Translate each string in this JSON array into ${language} for a beauty shopper. Keep the same order and count, keep hex codes, numbers, "%" and the ° sign exactly, use simple everyday words. Return ONLY a JSON array of strings.\n\n${JSON.stringify(strings)}`,
          { json: true }
        );
        const arr = JSON.parse(txt);
        if (!Array.isArray(arr) || arr.length !== strings.length) throw new Error("bad translation");
        return arr.map(String);
      },
      7 * 24 * 3600 * 1000
    );
    return NextResponse.json({ strings: out });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}
