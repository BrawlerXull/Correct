// Copies MediaPipe's WASM runtime into /public so face detection is self-hosted (works offline in the PWA).
import { cpSync, mkdirSync, existsSync } from "fs";
const src = "node_modules/@mediapipe/tasks-vision/wasm";
const dst = "public/mediapipe/wasm";
if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
    cpSync(`${src}/${f}`, `${dst}/${f}`);
  }
  console.log("mediapipe wasm copied to", dst);
}
