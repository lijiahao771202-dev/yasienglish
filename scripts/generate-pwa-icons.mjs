// Rasterize the brand SVG icons into the PNG sizes a PWA needs.
// Uses Sharp (already in node_modules) — no system deps required.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'public');

const iconSvg = fs.readFileSync(path.join(pub, 'icon.svg'));
const maskSvg = fs.readFileSync(path.join(pub, 'icon-maskable.svg'));

async function render(svg, size, outName) {
  const out = path.join(pub, outName);
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log('->', outName);
}

const tasks = [
  // Standard square icons
  [iconSvg, 192, 'icon-192.png'],
  [iconSvg, 256, 'icon-256.png'],
  [iconSvg, 384, 'icon-384.png'],
  [iconSvg, 512, 'icon-512.png'],
  // Maskable
  [maskSvg, 192, 'icon-maskable-192.png'],
  [maskSvg, 512, 'icon-maskable-512.png'],
  // Apple touch icon (rounded corners are added by iOS itself, our squircle is fine too)
  [iconSvg, 180, 'apple-touch-icon.png'],
  // Smaller favicons
  [iconSvg, 32, 'favicon-32.png'],
  [iconSvg, 16, 'favicon-16.png'],
];

for (const [svg, size, name] of tasks) {
  await render(svg, size, name);
}

// Build a multi-resolution favicon.ico from 16/32/48
const ico16 = await sharp(iconSvg, { density: 384 }).resize(16, 16).png().toBuffer();
const ico32 = await sharp(iconSvg, { density: 384 }).resize(32, 32).png().toBuffer();
const ico48 = await sharp(iconSvg, { density: 384 }).resize(48, 48).png().toBuffer();

// Minimal ICO encoder (Windows ICONDIR with PNG payloads).
function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // reserved
  header.writeUInt16LE(1, 2);          // type: 1 = icon
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;
  for (const buf of pngs) {
    const size = buf.length;
    // Decode PNG width/height from the IHDR chunk (bytes 16..23).
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(w >= 256 ? 0 : w, 0);
    entry.writeUInt8(h >= 256 ? 0 : h, 1);
    entry.writeUInt8(0, 2);                 // color count
    entry.writeUInt8(0, 3);                 // reserved
    entry.writeUInt16LE(1, 4);              // color planes
    entry.writeUInt16LE(32, 6);             // bpp
    entry.writeUInt32LE(size, 8);           // data size
    entry.writeUInt32LE(offset, 12);        // data offset
    dirEntries.push(entry);
    offset += size;
  }
  return Buffer.concat([header, ...dirEntries, ...pngs]);
}

fs.writeFileSync(path.join(pub, 'favicon.ico'), buildIco([ico16, ico32, ico48]));
console.log('-> favicon.ico');

// Replace the legacy app/favicon.ico used by Next's automatic metadata.
try {
  const legacy = path.join(root, 'src', 'app', 'favicon.ico');
  if (fs.existsSync(legacy)) {
    fs.copyFileSync(path.join(pub, 'favicon.ico'), legacy);
    console.log('-> src/app/favicon.ico');
  }
} catch (e) {
  console.warn('skip src/app/favicon.ico', e.message);
}

console.log('done.');
