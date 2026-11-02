// Pre-records the guided-selfie tips with Gemini TTS (natural voice) -> public/voice/*.mp3 (needs ffmpeg).
// Run: node scripts/make-voice.mjs
import fs from "fs";
import { execFileSync } from "child_process";

const env = fs.readFileSync(".env.local", "utf8");
const keys = env.match(/^GEMINI_API_KEYS=(.*)$/m)[1].replace(/"/g, "").split(",").map((k) => k.trim());
export const TIPS = {
  "no-face": "Look at the camera, so I can see your face.",
  "many-faces": "Just one person in the frame, please.",
  closer: "Move a little closer.",
  back: "Move back a little, and keep your whole face in the oval.",
  centre: "Centre your face in the oval.",
  level: "Keep your head straight. Don't tilt.",
  dark: "It's a bit dark. Try facing a window or a lamp.",
  bright: "Too bright. Step out of direct light.",
  hold: "Perfect. Hold still.",
  captured: "Got it! Analysing your skin now.",
};
for (const [id, text] of Object.entries(TIPS)) {
  let ok = false;
  for (const model of ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]) {
    for (const key of keys) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }], // text only – this TTS model reads any style instruction aloud
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } },
        }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const d = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!d) continue;
      fs.writeFileSync(`/tmp/voice-${id}.wav`, Buffer.from(d.data, "base64"));
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", `/tmp/voice-${id}.wav`, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-codec:a", "libmp3lame", "-b:a", "64k", `public/voice/${id}.mp3`]);
      console.log("ok", id, model);
      ok = true;
      break;
    }
    if (ok) break;
  }
  if (!ok) console.log("FAILED", id);
}
