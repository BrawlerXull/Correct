// Generates PWA icons (run once: node scripts/make-icons.mjs). Two overlapping circles = complementary colours cancelling.
import sharp from "sharp";
const svg = (size, pad) => {
  const r = size * (0.5 - pad) * 0.62;
  const cy = size / 2, cx1 = size / 2 - r * 0.45, cx2 = size / 2 + r * 0.45;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="#FBF7F2"/>
  <circle cx="${cx1}" cy="${cy}" r="${r}" fill="#B4505E" fill-opacity="0.85"/>
  <circle cx="${cx2}" cy="${cy}" r="${r}" fill="#6F9468" style="mix-blend-mode:multiply" fill-opacity="0.9"/>
</svg>`);
};
const out = [
  ["icon-192.png", 192, 0.08],
  ["icon-512.png", 512, 0.08],
  ["maskable-512.png", 512, 0.2],
  ["apple-touch-icon.png", 180, 0.1],
];
for (const [name, size, pad] of out) await sharp(svg(size, pad)).png().toFile(`public/icons/${name}`);
await sharp(svg(64, 0.04)).png().toFile("src/app/icon.png");
console.log("icons written");
