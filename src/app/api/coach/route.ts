import { NextResponse } from "next/server";
import { generate, geminiConfigured } from "@/lib/gemini";
import { checkLimit } from "@/lib/ratelimit";
import { LANGUAGE_NAMES } from "@/lib/langnames";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are the CORRECT coach: a friendly professional makeup artist who specialises in colour correction for redness, rosacea-prone skin, dark circles and dark spots / post-acne marks.

Safety:
- You are a cosmetic guide, not a doctor. Never diagnose. If someone mentions pain, burning, bleeding, a spreading rash or sudden changes, tell them kindly to see a dermatologist.

Grounding:
- If MEASURED CONTEXT is provided, base every answer on it (their YouCam scores, skin depth/undertone, the exact corrector shades already chosen). Never invent new measurements.
- If there is no scan yet, give general guidance and suggest they upload a selfie or try a sample for a personalised plan.

Formatting (very important – the answer is shown in a small chat panel):
- Start with ONE short sentence that directly answers the question.
- Then at most 4 bullet points, each starting with "- " and each under 20 words.
- Use **bold** only for product types, shade names or the key action.
- When you mention one of their shades, include its hex code (e.g. #AEBE93) so the app can show a swatch.
- No headings, no tables, no emojis, no closing pleasantries. Plain, warm, simple English (reading age ~12).`;


export async function POST(req: Request) {
  try {
    const limited = checkLimit("coach", req);
    if (limited) return NextResponse.json({ text: limited });
    if (!geminiConfigured()) return NextResponse.json({ text: null, error: "Coach unavailable (no Gemini key)" });
    const { context, question, history, lang } = await req.json();
    const language = LANGUAGE_NAMES[String(lang || "en")] || "English";
    const convo = Array.isArray(history)
      ? history
          .slice(-6)
          .map((m: { role: string; text: string }) => `${m.role === "user" ? "Shopper" : "Coach"}: ${m.text}`)
          .join("\n")
      : "";
    const ctx = context ? `MEASURED CONTEXT (from YouCam Skin Analysis + Skin Tone Analysis and the CORRECT rule engine):\n${JSON.stringify(context, null, 1)}\n` : "NO SCAN YET.\n";
    const ask = question
      ? `Shopper asks: ${question}`
      : `Write the shopper's personal summary. Format exactly:
One sentence on what the scan found (plain words, no numbers).
- **Step 1:** the first product + shade + where (with hex)
- **Step 2:** ... (one bullet per step in their plan, max 3)
- **Top tip:** the single most important application tip for them.`;
    const langRule = `\n\nLanguage: write the whole answer in ${language}${
      language === "English" ? " – unless the shopper's latest message is clearly written in another language, then answer in that language" : ""
    }. Keep hex codes, numbers and product/shade names exactly as given. Use simple everyday words (they may be read aloud).`;
    const text = await generate(`${ctx}\n${convo ? "CONVERSATION SO FAR:\n" + convo + "\n\n" : ""}${ask}`, { system: SYSTEM + langRule });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ text: null, error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}
