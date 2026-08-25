/**
 * Regenerate app icons from the vector source images/图片4.svg.
 *
 * Android adaptive-icon foreground: launchers crop layers to the central
 * ~61-67% of the 108dp canvas, so the ring is re-rendered at 38% of the
 * canvas on a TRANSPARENT background (→ ~57-62% of the visible icon,
 * matching the design). Cream backdrop comes from the background color
 * layer (values/ic_launcher_background.xml).
 *
 * Desktop source: the full SVG (cream square + ring) rendered at 1024 —
 * feed to `tauri icon` (sharper than upscaling the 749px bitmap).
 *
 * Usage (repo root): pnpm --filter desktop exec node ../../scripts/make-android-foreground.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire('E:/Workspaces/chess/apps/desktop/package.json');
const sharp = req('sharp');

const SRC_SVG = 'E:/Workspaces/chess/images/图片4.svg';
const OUT_1024 = 'E:/Workspaces/chess/images/icon-source-1024.png';
const RES = 'E:/Workspaces/chess/apps/desktop/src-tauri/gen/android/app/src/main/res';
const DENSITIES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
// 0.47 rendered ~73-77% of the visible icon on devices; 0.38 → ~57-62%,
// matching the design's proportions.
const RING_RATIO = 0.38;

(async () => {
  const svgSrc = fs.readFileSync(SRC_SVG, 'utf8');
  const pathEl = svgSrc.match(/<path[^>]*\/>/)?.[0];
  const transform = svgSrc.match(/transform="([^"]+)"/)?.[1];
  if (!pathEl || !transform) throw new Error('cannot find ring <path> / transform in source SVG');

  // ---- Desktop source: full design at 1024 (crisp vector render) ----------
  await sharp(Buffer.from(svgSrc), { density: (72 * 1024) / 749 })
    .resize(1024, 1024)
    .png()
    .toFile(OUT_1024);
  console.log('desktop source →', OUT_1024);

  // ---- Ring bbox: render the SVG once and detect the red ring --------------
  const W = 749;
  const { data, info } = await sharp(Buffer.from(svgSrc), { density: (72 * W) / 749 })
    .resize(W, W)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i] > data[i + 1] + 20 && data[i] > data[i + 2] + 25) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('no red ring found in rendered SVG');
  // +0.5 to keep the anti-aliased outline fully inside the viewBox
  const vb = `${minX - 0.5} ${minY - 0.5} ${maxX - minX + 2} ${maxY - minY + 2}`;

  // ---- Per-density foreground: ring path only, transparent background ------
  for (const [d, S] of Object.entries(DENSITIES)) {
    const ringSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="${vb}"><g transform="${transform}">${pathEl}</g></svg>`;
    await sharp(Buffer.from(ringSvg)).png().toFile(path.join(RES, `mipmap-${d}`, 'ic_launcher_foreground.png'));
    console.log(`mipmap-${d}: ${S}px canvas, ring ${Math.round(S * RING_RATIO)}px (viewBox "${vb}")`);
  }
  console.log('done — visible ratio after launcher crop ≈', Math.round((RING_RATIO / 0.667) * 100) + '%');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
