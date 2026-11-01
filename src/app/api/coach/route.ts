import { NextResponse } from "next/server";
import { generate, geminiConfigured } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are CORRECT, a professional makeup artist who specialises in colour correction for redness, rosacea-prone skin, dark circles and hyperpigmentation.
Rules:
- You are a cosmetic guide, not a doctor. Never diagnose. If someone describes pain, burning, spreading rash, bleeding or sudden changes, tell them to see a dermatologist.
- Ground every answer in the measured data you are given (YouCam skin scores, skin depth/undertone, the corrector shades already chosen). Do not invent new measurements.
- Be specific and practical: which shade, where, how much, which tool, in what order.
- Plain, warm language. No markdown headings. Keep answers under 120 words unless asked for more.`;

export async function POST(req: Request) {
  try {
    if (!geminiConfigured()) return NextResponse.json({ text: null, error: "Coach unavailable (no Gemini key)" });
    const { context, question, history } = await req.json();
    const convo = Array.isArray(history)
      ? history
          .slice(-6)
          .map((m: { role: string; text: string }) => `${m.role === "user" ? "Shopper" : "CORRECT"}: ${m.text}`)
          .join("\n")
      : "";
    const prompt = `MEASURED CONTEXT (from YouCam Skin Analysis + Skin Tone Analysis, and the plan the rule engine built):
${JSON.stringify(context, null, 1)}

${convo ? "CONVERSATION SO FAR:\n" + convo + "\n" : ""}
${
  question
    ? `Shopper asks: ${question}`
    : `Write a short personal summary (3 short sentences, max 70 words) for this shopper: what the scan found, why their specific corrector shades were picked for their depth/undertone, and the single most important application tip. Speak to them as "you".`
}`;
    const text = await generate(prompt, { system: SYSTEM });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ text: null, error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}
