// Tiny disk cache (os.tmpdir) so re-running the same photo / same render never re-spends YouCam credits.
import "server-only";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const DIR = path.join(os.tmpdir(), "correct-cache");

export const hash = (...parts: (string | Buffer)[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 32);
};

export async function cached<T>(key: string, fn: () => Promise<T>, maxAgeMs = Infinity): Promise<T> {
  const file = path.join(DIR, key + ".json");
  try {
    const st = await fs.stat(file);
    if (Date.now() - st.mtimeMs < maxAgeMs) return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    /* miss */
  }
  const v = await fn();
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(v));
  } catch {
    /* read-only FS – fine */
  }
  return v;
}
