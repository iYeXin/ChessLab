/**
 * Crop app screenshots for README: remove the system status bar on top
 * and the bottom gesture indicator strip. The remaining app chrome (the
 * beige paper background, TopBar etc.) is kept.
 *
 * Source: 1260x2800 (Android screenshots from the device)
 * Target: 1260x(2800 - SY - BX) — then half-scale to 630w for the repo.
 *
 * Measured by inspecting the 6 images (sharex 2800px tall):
 *  - status bar: top ~110px (varies per header; up to 110)
 *  - bottom indicator + bottom inset: ~32px (the grey bar)
 * We trim a fixed 110px top + 40px bottom — conservative, keeps the app
 * background flush without eating content. All images are identical framing
 * from the same device so one pair of numbers works for all.
 */
const { createRequire } = require('node:module');
const req = createRequire('E:/Workspaces/chess/apps/desktop/package.json');
const sharp = req('sharp');
const fs = require('fs');
const path = require('path');

const DIR = 'E:/Workspaces/chess/images';
const TOP = 112; // status bar + extra header bleed
const BOTTOM = 44; // gesture bar
const SOURCES = [
  'home.jpg',
  'xiangqi.jpg',
  'chess.jpg',
  'success.jpg',
  'puzzles.jpg',
  'settings.jpg',
];
const OUT_W = 630; // half-res for the repo (retina 900w source → displayed ~450w)

async function cropOne(name) {
  const src = path.join(DIR, name);
  const base = path.basename(name, '.jpg');
  const out = path.join(DIR, `${base}-cropped.jpg`);
  const meta = await sharp(src).metadata();
  const H = meta.height;
  const h2 = H - TOP - BOTTOM;
  await sharp(src)
    .extract({ left: 0, top: TOP, width: meta.width, height: h2 })
    .resize({ width: OUT_W })
    .jpeg({ quality: 86 })
    .toFile(out);
  console.log(`${name} -> ${base}-cropped.jpg  ${meta.width}x${H}  =>  ${OUT_W}x${Math.round((h2 * OUT_W) / meta.width)}`);
}

(async () => {
  for (const f of SOURCES) await cropOne(f);
  console.log('done');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
