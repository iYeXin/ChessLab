/**
 * Regenerate Android adaptive-icon foregrounds.
 *
 * Problem: `tauri icon` scales the source into the full 108dp foreground
 * canvas, but launchers crop the visible area to the central ~66.7% —
 * a ring drawn at ~58% of the canvas ends up filling ~87% of the visible
 * icon (ugly, almost touching the mask edge).
 *
 * Fix: foreground = red ring only on a TRANSPARENT canvas at 47% of the
 * canvas (→ ~70% of the visible area after crop). The cream backdrop comes
 * from the background color layer (values/ic_launcher_background.xml).
 *
 * Usage (repo root): pnpm --filter desktop exec node ../../scripts/make-android-foreground.js
 * Source: images/12.png (red ring on cream).
 */
const path = require('node:path');
const { createRequire } = require('node:module');
// sharp lives in apps/desktop devDependencies — resolve from there.
const req = createRequire('E:/Workspaces/chess/apps/desktop/package.json');
const sharp = req('sharp');

const SRC = 'E:/Workspaces/chess/images/12.png';
const RES = 'E:/Workspaces/chess/apps/desktop/src-tauri/gen/android/app/src/main/res';
const DENSITIES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const RING_RATIO = 0.47; // ring outer diameter / canvas

(async () => {
  // 1. Extract the ring: keep red-ish pixels, make everything else transparent.
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const isRed = r > g + 20 && r > b + 25;
      if (!isRed) {
        px[i + 3] = 0; // transparent
      } else {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('no red ring found in source');

  // 2. Crop to the ring bounding box (anti-aliased edges preserved).
  const ringBuf = await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();

  // 3. Compose ring centered on a transparent canvas per density.
  for (const [d, S] of Object.entries(DENSITIES)) {
    const ringSize = Math.round(S * RING_RATIO);
    const ring = await sharp(ringBuf).resize(ringSize, ringSize).png().toBuffer();
    const pad = Math.round((S - ringSize) / 2);
    await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: ring, left: pad, top: pad }])
      .png()
      .toFile(path.join(RES, `mipmap-${d}`, 'ic_launcher_foreground.png'));
    console.log(`mipmap-${d}: ${S}px canvas, ring ${ringSize}px (${Math.round((ringSize / S) * 100)}%)`);
  }
  console.log('done — visible ratio after launcher crop ≈', Math.round((RING_RATIO / 0.667) * 100) + '%');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
