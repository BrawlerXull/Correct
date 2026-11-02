// Credit guard: protects the shared YouCam credit balance on the public demo.
// Sliding-window limits per visitor IP plus a global daily cap on paid scans.
// (In-memory per server instance – simple, dependency-free, good enough for a demo deployment.)
import "server-only";

type Bucket = number[];
const buckets = new Map<string, Bucket>();
let day = new Date().toISOString().slice(0, 10);
let dailyScans = 0;

const LIMITS = {
  analyze: { max: 8, windowMs: 10 * 60_000 }, // 8 new photos / 10 min per visitor
  render: { max: 40, windowMs: 10 * 60_000 }, // ~8 sessions of 4-5 renders
  coach: { max: 40, windowMs: 10 * 60_000 },
  voice: { max: 60, windowMs: 10 * 60_000 }, // read-aloud + voice questions
} as const;
const DAILY_SCAN_CAP = Number(process.env.DAILY_SCAN_CAP || 150);

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns null if allowed, or a user-facing message if the request should be refused. */
export function checkLimit(kind: keyof typeof LIMITS, req: Request): string | null {
  const { max, windowMs } = LIMITS[kind];
  const key = `${kind}:${clientIp(req)}`;
  const now = Date.now();
  const b = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (b.length >= max) {
    buckets.set(key, b);
    const wait = Math.ceil((windowMs - (now - b[0])) / 60_000);
    return `You're going a little fast – please try again in about ${wait} minute${wait === 1 ? "" : "s"}. (Sample faces work any time.)`;
  }
  b.push(now);
  buckets.set(key, b);
  return null;
}

/** Count a paid (uncached) scan against the daily cap. */
export function takeDailyScan(): string | null {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dailyScans = 0;
  }
  if (dailyScans >= DAILY_SCAN_CAP) return "The live demo has reached today's scan limit. Please try a sample face, or run it locally with your own YouCam key.";
  dailyScans++;
  return null;
}
