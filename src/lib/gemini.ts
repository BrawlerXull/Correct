// Gemini client with round-robin key rotation + failover (rate limits / quota / transient errors).
import "server-only";

const KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash";

let cursor = 0;

export const geminiConfigured = () => KEYS.length > 0;

/** Generate text. Rotates the starting key on every call and fails over to the next key on 429/403/5xx. */
export async function generate(prompt: string, opts: { json?: boolean; system?: string } = {}): Promise<string> {
  if (!KEYS.length) throw new Error("No Gemini key configured");
  const start = cursor++ % KEYS.length;
  let lastErr = "";
  for (const model of [MODEL, FALLBACK_MODEL]) {
    for (let i = 0; i < KEYS.length; i++) {
      const key = KEYS[(start + i) % KEYS.length];
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        const text = (j.candidates?.[0]?.content?.parts || [])
          .map((p: { text?: string }) => p.text || "")
          .join("")
          .trim();
        if (text) return text;
        lastErr = "empty response";
        continue;
      }
      lastErr = `${model} ${res.status}`;
      // 404 = model unavailable for this key -> try the fallback model; others -> rotate key.
      if (res.status === 404) break;
      if (![429, 403, 500, 502, 503, 504].includes(res.status)) break;
    }
  }
  throw new Error(`Gemini failed: ${lastErr}`);
}
