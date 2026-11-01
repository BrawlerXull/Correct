// Favicons: tight-cropped logo (two overlapping circles) on a transparent background so it reads at 16px.
// Writes public/favicon-{16,32,48}.png, public/icons/icon.svg and public/favicon.ico (PNG-in-ICO, 16/32/48).
import sharp from "sharp";
import { writeFileSync } from "fs";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="23" cy="32" r="19" fill="#B4505E"/>
  <circle cx="41" cy="32" r="19" fill="#6F9468" fill-opacity="0.85"/>
  <path d="M32 16.2a19 19 0 0 1 0 31.6a19 19 0 0 1 0-31.6z" fill="#4A3A2C"/>
</svg>`;
writeFileSync("public/icons/icon.svg", svg);
const sizes = [16, 32, 48];
const pngs = [];
for (const s of sizes) {
  const buf = await sharp(Buffer.from(svg), { density: 384 }).resize(s, s).png().toBuffer();
  writeFileSync(`public/favicon-${s}.png`, buf);
  pngs.push(buf);
}
// ICO container with embedded PNGs
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
const dir = Buffer.alloc(16 * pngs.length);
let offset = 6 + dir.length;
pngs.forEach((p, i) => {
  const s = sizes[i];
  dir.writeUInt8(s === 256 ? 0 : s, i * 16);
  dir.writeUInt8(s === 256 ? 0 : s, i * 16 + 1);
  dir.writeUInt8(0, i * 16 + 2); dir.writeUInt8(0, i * 16 + 3);
  dir.writeUInt16LE(1, i * 16 + 4); dir.writeUInt16LE(32, i * 16 + 6);
  dir.writeUInt32LE(p.length, i * 16 + 8); dir.writeUInt32LE(offset, i * 16 + 12);
  offset += p.length;
});
writeFileSync("public/favicon.ico", Buffer.concat([header, dir, ...pngs]));
console.log("favicons written");
