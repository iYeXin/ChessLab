// Generates assets/app-icon.png (1024x1024 RGBA) — a walnut/maple
// checkerboard used as the Phase W1 placeholder app icon.
// Pure Node (zlib + hand-rolled CRC32), no image deps.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SIZE = 1024;
const CELLS = 8;
const cell = SIZE / CELLS;

// Wood palette (theme/board): maple vs walnut, thin dark frame.
const LIGHT = [0xed, 0xd6, 0xb0, 0xff];
const DARK = [0xae, 0x86, 0x58, 0xff];
const FRAME = [0x3e, 0x2e, 0x21, 0xff];
const frameW = 48;

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
let o = 0;
for (let y = 0; y < SIZE; y++) {
  raw[o++] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const inFrame =
      x < frameW || y < frameW || x >= SIZE - frameW || y >= SIZE - frameW;
    let px;
    if (inFrame) {
      px = FRAME;
    } else {
      const cx = Math.floor((x - frameW) / ((SIZE - 2 * frameW) / CELLS));
      const cy = Math.floor((y - frameW) / ((SIZE - 2 * frameW) / CELLS));
      const isLight = (cx + cy) % 2 === 0;
      px = isLight ? LIGHT : DARK;
    }
    raw[o++] = px[0];
    raw[o++] = px[1];
    raw[o++] = px[2];
    raw[o++] = px[3];
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(here, 'app-icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log('written', out, png.length, 'bytes');
