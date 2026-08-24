// ChessLab — dual identity app icon
// 1024x1024 RGBA, rounded square + central 3D disc split chess/xiangqi
// Pure Node (zlib + CRC32), no deps. Design: parchment #F1EADC, brand #33291C,
// chess walnut #7A5230/#EDD6B0/#AE8658, xiangqi vermilion #A63A2B/#E7CD97/#4A3418
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SIZE = 1024;
const RADIUS = 180; // outer rounded square
const BORDER = 32;
const BG = [0xf1, 0xea, 0xdc, 0xff]; // parchment
const BRAND = [0x33, 0x29, 0x1c, 0xff]; // dark brown
const LIGHT = [0xed, 0xd6, 0xb0, 0xff];
const DARK = [0xae, 0x86, 0x58, 0xff];
const XQ_FACE = [0xe7, 0xcd, 0x97, 0xff];
const XQ_LINE = [0x4a, 0x34, 0x18, 0xff];
const PARCH = [0xf7, 0xf3, 0xea, 0xff];
const RED = [0xa6, 0x3a, 0x2b, 0xff];
const DARK_B = [0x33, 0x30, 0x2a, 0xff];

// Disc geometry
const CX = SIZE / 2;
const CY = SIZE / 2;
const DISC_R = 320;
const DISC_R2 = DISC_R * DISC_R;
const HIGHLIGHT_R = 110;
const EDGE = 14;

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
let o = 0;
for (let y = 0; y < SIZE; y++) {
  raw[o++] = 0;
  for (let x = 0; x < SIZE; x++) {
    // Rounded square mask for outer shape
    const rx = Math.min(x, SIZE - 1 - x);
    const ry = Math.min(y, SIZE - 1 - y);
    // Distance to corner circle
    let inOuter = true;
    let outerAlpha = 255;
    if (rx < RADIUS && ry < RADIUS) {
      const dx = RADIUS - rx - 1;
      const dy = RADIUS - ry - 1;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > RADIUS) inOuter = false;
      else if (d > RADIUS - 1.5) outerAlpha = Math.round(255 * (1 - (d - (RADIUS - 1.5)) / 1.5));
    }
    if (!inOuter) {
      raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; raw[o++] = 0;
      continue;
    }

    // Border
    const inBorder = x < BORDER || y < BORDER || x >= SIZE - BORDER || y >= SIZE - BORDER ||
      (rx < RADIUS && ry < RADIUS && Math.sqrt(Math.pow(RADIUS - rx - 1, 2) + Math.pow(RADIUS - ry - 1, 2)) > RADIUS - BORDER);
    if (inBorder) {
      const a = outerAlpha === 255 ? 255 : outerAlpha;
      raw[o++] = BRAND[0]; raw[o++] = BRAND[1]; raw[o++] = BRAND[2]; raw[o++] = a;
      continue;
    }

    // Background parchment inside
    let r = BG[0], g = BG[1], b = BG[2], a = outerAlpha;

    // Disc
    const dx = x - CX;
    const dy = y - CY;
    const d2 = dx * dx + dy * dy;
    const inDisc = d2 <= DISC_R2;
    const onEdge = inDisc && d2 > (DISC_R - EDGE) * (DISC_R - EDGE);
    const dist = Math.sqrt(d2);

    if (inDisc) {
      // Base disc face: split top (chess) / bottom (xiangqi)
      let base;
      if (dy < -12) {
        // Top: chess 8x8 but clipped to disc, 4x4 visible
        const cell = (DISC_R * 2) / 8;
        const gx = Math.floor((x - (CX - DISC_R)) / cell);
        const gy = Math.floor((y - (CY - DISC_R)) / cell);
        const isLight = (gx + gy) % 2 === 0;
        base = isLight ? LIGHT : DARK;
        // Only show where y < center -12, else fallback to xq face for lower part of top
        if (y > CY - 12) base = XQ_FACE;
      } else if (dy > 12) {
        // Bottom: xiangqi board tint
        base = XQ_FACE;
      } else {
        // Middle band: river
        base = [0xf3, 0xe5, 0xc8, 0xff];
      }
      r = base[0]; g = base[1]; b = base[2];

      // Xiangqi lines faint inside bottom half and middle
      if (dy > -40) {
        // Horizontal lines: 10 ranks inside disc
        const localY = y - (CY - DISC_R);
        const cellY = (DISC_R * 2) / 10;
        const modY = localY % cellY;
        const isHLine = modY < 1.2 || modY > cellY - 1.2;
        // Vertical lines only where disc interior and not over river gap
        const localX = x - (CX - DISC_R);
        const cellX = (DISC_R * 2) / 9;
        const modX = localX % cellX;
        const isVLine = modX < 1.2 || modX > cellX - 1.2;
        // River gap: rows 4-5 are river (no vertical except edges)
        const rank = Math.floor(localY / cellY);
        const isRiver = rank === 4 || rank === 5;
        const col = Math.floor(localX / cellX);
        const isEdgeCol = col === 0 || col === 8;
        if (isHLine) { r = XQ_LINE[0]; g = XQ_LINE[1]; b = XQ_LINE[2]; }
        else if (isVLine && (!isRiver || isEdgeCol)) { r = XQ_LINE[0]; g = XQ_LINE[1]; b = XQ_LINE[2]; }
        // Palace diagonals faint
        if ((rank === 0 || rank === 1 || rank === 7 || rank === 8) && (col >= 3 && col <= 5)) {
          const inPalaceY = (rank % 4 < 2);
          // diagonal approx: |dx| == |dy| within palace 2x2
          // Simplify: draw X
          if (Math.abs(modX - modY) < 1.5 || Math.abs(modX + modY - cellX) < 1.5) {
            // keep line
          }
        }
      }

      // Edge thickness (darker)
      if (onEdge) {
        const t = (dist - (DISC_R - EDGE)) / EDGE;
        r = lerp(r, edgeColor(r, g, b, pieceSide(x, y))[0], t * 0.9);
        g = lerp(g, edgeColor(r, g, b, pieceSide(x, y))[1], t * 0.9);
        b = lerp(b, edgeColor(r, g, b, pieceSide(x, y))[2], t * 0.9);
      }

      // Top highlight (specular) — small ellipse at upper left of disc
      const hx = CX - DISC_R * 0.28;
      const hy = CY - DISC_R * 0.42;
      const hdx = x - hx;
      const hdy = y - hy;
      const hd2 = (hdx * hdx) / (HIGHLIGHT_R * HIGHLIGHT_R * 1.6) + (hdy * hdy) / (HIGHLIGHT_R * HIGHLIGHT_R);
      if (hd2 < 1) {
        const t = 1 - hd2;
        const add = Math.round(t * 42);
        r = clamp(r + add, 0, 255);
        g = clamp(g + add, 0, 255);
        b = clamp(b + add, 0, 255);
      }

      // Central "弈" abstract: draw a simple geometric seal — square with cross
      // Instead of text, draw a dark square seal (96x96) with inner cross, centered
      const sealHalf = 52;
      if (Math.abs(dx) < sealHalf && Math.abs(dy) < sealHalf) {
        const isBorder = Math.abs(dx) > sealHalf - 6 || Math.abs(dy) > sealHalf - 6;
        if (isBorder) {
          r = BRAND[0]; g = BRAND[1]; b = BRAND[2];
        } else {
          // Inner parchment with subtle cross
          const isCross = Math.abs(dx) < 7 || Math.abs(dy) < 7;
          if (isCross) {
            r = BRAND[0]; g = BRAND[1]; b = BRAND[2];
          } else {
            r = PARCH[0]; g = PARCH[1]; b = PARCH[2];
          }
          // Add small corner dots like a seal
          const inCorner = (Math.abs(dx) > sealHalf - 18 && Math.abs(dy) > sealHalf - 18);
          if (inCorner && Math.abs(dx) < sealHalf - 10 && Math.abs(dy) < sealHalf - 10) {
            // keep
          }
        }
      }
    } else {
      // Outside disc but inside border: subtle parchment with very faint board watermark
      // Add faint diagonal watermark of board
      const v = (x + y) % 40 < 2 ? 6 : 0;
      r = clamp(r - v, 0, 255); g = clamp(g - v, 0, 255); b = clamp(b - v, 0, 255);
    }

    raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
  }
}

function pieceSide(x, y) {
  // helper to choose edge color per side (not critical)
  return 0;
}
function edgeColor(r, g, b, side) {
  // darker edge
  return [clamp(r - 38, 0, 255), clamp(g - 36, 0, 255), clamp(b - 32, 0, 255)];
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
ihdr[8] = 8;
ihdr[9] = 6;
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
