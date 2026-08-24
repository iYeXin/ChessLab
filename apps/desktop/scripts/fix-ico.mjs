import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const pngPath = join(here, 'app-icon.png');
const icoPath = join(here, '..', 'src-tauri', 'icons', 'icon.ico');
let png = readFileSync(pngPath);
// ICO with single PNG entry (256x256). If source is 1024, use it as-is with w/h=0 (means 256) — Windows will scale.
const count = 1;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type ico
header.writeUInt16LE(count, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; // width 0 means 256 (we keep source 1024, will be scaled)
entry[1] = 0; // height
entry[2] = 0; // colors
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16 * count, 12);
const ico = Buffer.concat([header, entry, png]);
writeFileSync(icoPath, ico);
console.log('wrote', icoPath, ico.length, 'bytes (PNG', png.length, ')');
