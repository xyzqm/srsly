#!/usr/bin/env node
/**
 * The raster icons, from the one hand-drawn source.
 *
 *   node scripts/build-icons.mjs
 *
 * `public/icon.svg` is the only authored artwork. Everything else here is DERIVED, so it
 * belongs to a script rather than to whoever last opened a design tool — the rule this repo
 * already applies to every dictionary and level table: generated data is generated, never
 * hand-edited.
 *
 *   app/favicon.ico            16/32/48   Safari before 16.4, and a long tail of tools
 *   public/icon-192.png        192        the web manifest's small icon
 *   public/icon-512.png        512        the manifest's large one; splash screens use it
 *   public/apple-touch-icon.png 180       iOS home screen, at ITS canonical size
 *   public/icon-maskable-512.png 512      Android adaptive icons — see below
 *
 * ⚠ `apple-touch-icon` AT 180, NOT 192, AND THE DIFFERENCE IS NOT COSMETIC. iOS has asked for
 * 180x180 since the iPhone 6 Plus and rescales anything else — which on a mark built from thin
 * curves is where the softness comes from. It was pointed at the 192 because that file already
 * existed, which is a reason to reuse a file and not a reason to serve the wrong size.
 *
 * ⚠ THE MASKABLE ICON IS DIFFERENT ARTWORK, NOT THE SAME PNG RELABELLED. Android crops an
 * adaptive icon to whatever shape the launcher wants — circle, squircle, teardrop — and
 * guarantees only the central 80% circle survives. Declaring the ordinary icon `maskable` is
 * the common mistake and it cuts the corners off a mark that was drawn to fill a rounded
 * square. So this one drops the `rx` (the launcher supplies the shape) and scales the glyph to
 * 80% about the centre so it sits inside the safe zone. It is built from the SAME path as
 * `icon.svg` by re-wrapping it, rather than being a second drawing that can drift.
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
import { readFileSync, writeFileSync } from 'node:fs';
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

/**
 * The maskable variant, re-wrapped from `icon.svg`'s own marks.
 *
 * Pulling the shapes out with a regex rather than re-authoring them is the point: two drawings
 * of one logo drift, and the drift is invisible because nobody looks at an Android icon on a
 * Mac. If the source ever stops being a flat list of `<path>`/`<circle>` this throws rather
 * than silently emitting a bare red square.
 */
function maskableSvg() {
  const src = readFileSync(SRC, 'utf8');
  const ground = src.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{3,8})"[^>]*\/>/);
  const marks = src.match(/<(?:path|circle)\b[^>]*\/>/g);
  if (!ground || !marks || marks.length === 0) {
    throw new Error('icon.svg is not the shape this script expects — check it before shipping an icon');
  }
  // scale(0.8) about the centre of a 64 box: translate by 32 * (1 - 0.8).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">`
    + `<rect width="64" height="64" fill="${ground[1]}"/>`
    + `<g transform="translate(6.4 6.4) scale(0.8)">${marks.join('')}</g></svg>`;
}

const renderBuf = (buf, size) =>
  sharp(Buffer.from(buf), { density: 1200 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const icoSizes = [16, 32, 48];
const images = [];
for (const size of icoSizes) images.push({ size, data: await render(size) });

writeFileSync(resolve(root, 'app/favicon.ico'), ico(images));
writeFileSync(resolve(root, 'public/icon-192.png'), await render(192));
writeFileSync(resolve(root, 'public/icon-512.png'), await render(512));
writeFileSync(resolve(root, 'public/apple-touch-icon.png'), await render(180));
writeFileSync(resolve(root, 'public/icon-maskable-512.png'), await renderBuf(maskableSvg(), 512));

console.log(`app/favicon.ico              ${icoSizes.join('/')} px, PNG payloads`);
console.log('public/icon-192.png          192 px');
console.log('public/icon-512.png          512 px');
console.log('public/apple-touch-icon.png  180 px  (iOS home screen)');
console.log('public/icon-maskable-512.png 512 px  (Android adaptive, 80% safe zone)');
