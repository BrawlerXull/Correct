import { NextResponse } from "next/server";
import { fitzpatrick, skinAnalysis, skinTone, toDataUrl } from "@/lib/youcam";
import { buildPlan, Scores } from "@/lib/rules";
import { cached, hash } from "@/lib/cache";
import { ensureHdSize } from "@/lib/imageprep";
import { checkLimit, takeDailyScan } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

// YouCam error codes -> advice a shopper can act on.
const FRIENDLY: [RegExp, string][] = [
  [/error_no_face/, "We couldn't find a face. Use a front-facing photo with your whole face visible."],
  [/error_pose|faceangle|error_face_angle/, "Please face the camera straight on (head not tilted or turned) and try again."],
  [/error_src_face_too_small|face_position_too_small/, "Your face is too small in the photo. Move closer to the camera, or crop the photo around your face."],
  [/error_src_face_out_of_bound|out_of_boundary/, "Part of your face is cut off. Make sure your whole face, forehead to chin, is in the photo."],
  [/below_min_image_size/, "That photo's resolution is too low, even after enhancing. Please try a sharper photo."],
  [/exceed_max/, "That photo is too large. Please try a smaller one (under 10 MB)."],
  [/error_lighting|lighting/, "The lighting is too dark or uneven. Try facing a window in daylight."],
  [/nsfw/, "That photo couldn't be processed. Please use a simple selfie."],
];

export async function POST(req: Request) {
  try {
    const limited = checkLimit("analyze", req);
    if (limited) return NextResponse.json({ error: limited }, { status: 429 });
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    if (file.size > 9_500_000) return NextResponse.json({ error: "That photo is too large (max ~9 MB)." }, { status: 400 });
    const original = Buffer.from(await file.arrayBuffer());

    const result = await cached("analyze3-" + hash(original), async () => {
      const capped = takeDailyScan(); // only uncached scans spend credits
      if (capped) throw new Error("DAILY_CAP: " + capped);
      // Guarantee YouCam HD size requirements (AI-enhance small photos).
      const prepared = await ensureHdSize(original);
      const bytes = prepared.bytes;
      // Three YouCam Skin APIs in parallel; Fitzpatrick is an optional cross-check, never blocks the scan.
      const [skin, tone, fitz] = await Promise.all([skinAnalysis(bytes), skinTone(bytes), fitzpatrick(bytes).catch(() => null)]);
      const scores: Scores = {};
      const masks: Record<string, string> = {};
      await Promise.all(
        skin.map(async (o) => {
          if (o.type.startsWith("hd_") && typeof o.ui_score === "number") {
            scores[o.type as keyof Scores] = o.ui_score;
            if (o.mask_urls?.[0]) masks[o.type] = await toDataUrl(o.mask_urls[0]);
          }
        })
      );
      return {
        scores,
        masks,
        tone: tone.color,
        fitzpatrick: fitz,
        quality: tone.face_quality ?? null,
        overall: skin.find((o) => o.type === "all")?.score,
        skinAge: skin.find((o) => o.type === "skin_age")?.score,
        // The exact image that was analysed – the client uses it for masks, renders and measurement.
        photo: `data:image/jpeg;base64,${bytes.toString("base64")}`,
        prep: { width: prepared.width, height: prepared.height, upscale: prepared.upscale, enhanceScale: prepared.enhanceScale ?? null },
      };
    });

    const plan = buildPlan(result.tone.skin_color, result.scores, (result as { fitzpatrick?: string | null }).fitzpatrick);
    return NextResponse.json({ ...result, plan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("DAILY_CAP: ")) return NextResponse.json({ error: msg.slice(11) }, { status: 429 });
    const friendly = FRIENDLY.find(([re]) => re.test(msg))?.[1];
    console.error("[analyze]", msg);
    return NextResponse.json({ error: friendly || "Something went wrong analysing that photo. Please try another one.", detail: msg }, { status: 500 });
  }
}
