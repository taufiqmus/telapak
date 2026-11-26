// Membuat icon-192.png dan icon-512.png (bat merah + bola oranye) tanpa dependensi: node tools/ikon.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
// warna per titik di koordinat 0..1; latar penuh supaya aman sebagai ikon "maskable"
function color(x, y) {
  const inC = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  if (inC(.7, .28, .1)) return [255, 154, 60];                              // bola
  if (x > .44 && x < .56 && y > .62 && y < .86) return [214, 167, 106];     // gagang
  if (inC(.47, .45, .26)) return [200, 16, 46];                             // bilah karet
  return [90, 26, 28];                                                       // lantai
}
function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size), SS = 4;
  for (let j = 0; j < size; j++) {
    raw[j * (size * 3 + 1)] = 0;
    for (let i = 0; i < size; i++) {
      const acc = [0, 0, 0];
      for (let a = 0; a < SS; a++) for (let b = 0; b < SS; b++) { const c = color((i + (a + .5) / SS) / size, (j + (b + .5) / SS) / size); acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; }
      for (let k = 0; k < 3; k++) raw[j * (size * 3 + 1) + 1 + i * 3 + k] = Math.round(acc[k] / SS / SS);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [192, 512]) fs.writeFileSync(new URL(`../icon-${s}.png`, import.meta.url), png(s));
