// Gemini client with round-robin key rotation + model failover.
// Free-tier quotas are per key AND per model, so we walk a chain of models and remember exhausted
// (key, model) pairs for a while instead of hammering them on every request.
import "server-only";

const KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim().replace(/^"|"$/g, ""))
  .filter(Boolean);
const PRIMARY = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const TEXT_MODELS = Array.from(
  new Set([PRIMARY, "gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash"])
);
const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"];

let cursor = 0;
const cooldown = new Map<string, number>(); // `${key}|${model}` -> retry-after timestamp

export const geminiConfigured = () => KEYS.length > 0;

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Low-level call that walks models x keys. Returns the first successful candidate parts. */
async function call(models: string[], parts: Part[], extra: Record<string, unknown> = {}, system?: string, timeoutMs = 45000) {
  if (!KEYS.length) throw new Error("No Gemini key configured");
  const start = cursor++ % KEYS.length;
  let lastErr = "";
  for (const model of models) {
    for (let i = 0; i < KEYS.length; i++) {
      const key = KEYS[(start + i) % KEYS.length];
      const ck = `${key}|${model}`;
      if ((cooldown.get(ck) || 0) > Date.now()) continue;
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents: [{ role: "user", parts }],
            ...extra,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        lastErr = `${model} ${e instanceof Error ? e.name : "network"}`;
        continue;
      }
      if (res.ok) {
        const j = await res.json();
        const out = j.candidates?.[0]?.content?.parts || [];
        if (out.length) return out as { text?: string; inlineData?: { mimeType: string; data: string } }[];
        lastErr = `${model} empty`;
        continue;
      }
      lastErr = `${model} ${res.status}`;
      if (res.status === 429) cooldown.set(ck, Date.now() + 15 * 60_000); // quota hit: skip this pair for 15 min
      if (res.status === 404) {
        cooldown.set(ck, Date.now() + 24 * 3600_000);
        break; // model unavailable – next model
      }
    }
  }
  throw new Error(`Gemini failed: ${lastErr}`);
}

/** Generate text. */
export async function generate(prompt: string, opts: { json?: boolean; system?: string } = {}): Promise<string> {
  const parts = await call(TEXT_MODELS, [{ text: prompt }], { generationConfig: { temperature: 0.5, ...(opts.json ? { responseMimeType: "application/json" } : {}) } }, opts.system);
  const text = parts.map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

/** Speech-to-text: works in every browser (Brave, Firefox, Safari) because recognition happens server-side. */
export async function transcribe(audioB64: string, mime: string, languageName: string): Promise<string> {
  const parts = await call(
    TEXT_MODELS,
    [
      { inline_data: { mime_type: mime, data: audioB64 } },
      {
        text: `Transcribe exactly what the speaker says (it is a question for a makeup / skincare assistant; the speaker most likely uses ${languageName}). Write it in the language actually spoken, with normal punctuation. Return ONLY the transcript. If there is no speech, return an empty string.`,
      },
    ],
    { generationConfig: { temperature: 0 } }
  );
  return parts
    .map((p) => p.text || "")
    .join("")
    .trim()
    .replace(/^"|"$/g, "");
}

/** Natural-sounding text-to-speech. Returns WAV bytes. */
export async function synthesize(text: string, opts: { voice?: string } = {}): Promise<Buffer> {
  // Send the text only: the Gemini TTS models read any "say this warmly" instruction out loud.
  const parts = await call(
    TTS_MODELS,
    [{ text }],
    { generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice || "Aoede" } } } } },
    undefined,
    60000
  );
  const audio = parts.find((p) => p.inlineData)?.inlineData;
  if (!audio) throw new Error("no audio returned");
  const bytes = Buffer.from(audio.data, "base64");
  if (audio.mimeType.includes("wav")) return bytes;
  // Older TTS models return raw 16-bit PCM (audio/L16;rate=24000) – wrap it in a WAV header.
  const rate = Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] || 24000);
  return pcmToWav(bytes, rate);
}

function pcmToWav(pcm: Buffer, rate: number) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
