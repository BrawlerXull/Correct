import { NextResponse } from "next/server";
import { makeupVto, toDataUrl } from "@/lib/youcam";
import { cached, hash } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One Makeup VTO pass. Body: { image?: dataURL (first pass), srcUrl?: string (chain on a previous result), effects, key }
 * `key` identifies the chain position so cached results are reused across sessions.
 */
export async function POST(req: Request) {
  try {
    const { image, srcUrl, effects, key } = await req.json();
    if (!Array.isArray(effects)) return NextResponse.json({ error: "effects required" }, { status: 400 });
    let src: Buffer | string;
    if (typeof srcUrl === "string" && srcUrl.startsWith("https://")) src = srcUrl;
    else if (typeof image === "string" && image.startsWith("data:")) src = Buffer.from(image.split(",")[1], "base64");
    else return NextResponse.json({ error: "image or srcUrl required" }, { status: 400 });

    const cacheKey = "render-" + hash(String(key || ""), typeof src === "string" ? "" : src, JSON.stringify(effects));
    const out = await cached(
      cacheKey,
      async () => {
        const url = await makeupVto(src, effects);
        return { url, dataUrl: await toDataUrl(url) };
      },
      100 * 60 * 1000 // result URLs expire after 2h; re-render so chained passes always get a live URL
    );
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
