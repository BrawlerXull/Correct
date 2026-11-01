import { NextResponse } from "next/server";
import { skinAnalysis, skinTone, toDataUrl } from "@/lib/youcam";
import { buildPlan, Scores } from "@/lib/rules";
import { cached, hash } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    if (file.size > 9_500_000) return NextResponse.json({ error: "Image too large (max ~9 MB)" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());

    const result = await cached("analyze-" + hash(bytes), async () => {
      const [skin, tone] = await Promise.all([skinAnalysis(bytes), skinTone(bytes)]);
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
      const overall = skin.find((o) => o.type === "all")?.score;
      const skinAge = skin.find((o) => o.type === "skin_age")?.score;
      return { scores, masks, tone: tone.color, quality: tone.face_quality ?? null, overall, skinAge };
    });

    const plan = buildPlan(result.tone.skin_color, result.scores);
    return NextResponse.json({ ...result, plan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = msg.includes("error_no_face")
      ? "We couldn't find a face. Use a front-facing photo with your whole face visible."
      : msg.includes("error_pose")
      ? "Please face the camera straight on (no tilted head) and try again."
      : msg;
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
