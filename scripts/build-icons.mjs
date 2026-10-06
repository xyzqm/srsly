#!/usr/bin/env node
/**
 * The raster icons, from the one hand-drawn source.
 *
 *   node scripts/build-icons.mjs
 *
 * `public/icon.svg` is the only authored artwork. `public/icon-192.png` exists because iOS
 * home-screen icons do not take SVG, and `app/favicon.ico` because Safari before 16.4 and a
 * long tail of tools still ask for one. Both are DERIVED, so they belong to a script rather
 * than to whoever last opened a design tool — the rule this repo already applies to every
 * dictionary and level table: generated data is generated, never hand-edited.
 *
 * ⚠ IT EXISTS BECAUSE THE FAVICON WAS NEXT'S DEFAULT FOR THE WHOLE LIFE OF THE PROJECT.
 * `app/favicon.ico` was committed in the initial commit and never touched again, so every
 * browser tab showed the framework's logo — on a portfolio site, which is the one place the
 * tab strip is read by somebody being asked to form an opinion. It was invisible precisely
 * because a favicon is: nobody looks at their own tab.
 *
 * PNG-IN-ICO, NOT BMP. The ICO container predates PNG and its original payload is a headless
 * BMP with an AND mask, which is fiddly to emit and worse to debug. Every browser since IE11
 * reads a PNG payload instead, and the format allows it — the directory entry just points at
 * PNG bytes. Three sizes, because 16 is the tab, 32 is a retina tab and the bookmark bar, and
 * 48 is Windows' shortcut size.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'public/icon.svg');

/** Rendered at a high density first: librsvg rasterises at the SVG's own size otherwise, and
 *  downscaling from 512 is what keeps the curve edges clean at 16px. */
const render = (size) =>
  sharp(SRC, { density: 1200 }).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer();

/** ICONDIR + one ICONDIRENTRY per image, then the PNG payloads. */
function ico(images) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);              // reserved
  dir.writeUInt16LE(1, 2);              // 1 = icon
  dir.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);   // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);                        // palette size — 0 for truecolour
    e.writeUInt8(0, 3);                        // reserved
    e.writeUInt16LE(1, 4);                     // colour planes
    e.writeUInt16LE(32, 6);                    // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([dir, ...entries, ...images.map(i => i.data)]);
}

const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) images.push({ size, data: await render(size) });

writeFileSync(resolve(root, 'app/favicon.ico'), ico(images));
writeFileSync(resolve(root, 'public/icon-192.png'), await render(192));

console.log(`app/favicon.ico      ${sizes.join('/')} px, PNG payloads`);
console.log('public/icon-192.png  192 px');
