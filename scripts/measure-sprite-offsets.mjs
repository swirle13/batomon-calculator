#!/usr/bin/env node
/**
 * Measures how far below its canvas centre each creature's artwork is drawn, and writes
 * `src/data/spriteOffsets.ts`. Run with `node scripts/measure-sprite-offsets.mjs`.
 *
 * ## What this is correcting
 *
 * The vendored sprites are GROUND-ANCHORED: the creature stands on the bottom edge of its 48x48
 * canvas and whatever is left over is transparent headroom. Across the 288 monster PNGs the median
 * is 6px of padding above the artwork against 1px below, and the spread is wide — `cobrex` is
 * centred exactly, `spinarai` has 24px of headroom. That is right for a board with a ground line
 * and wrong for a bordered square well that centres the canvas, which is what the detail card has:
 * the canvas is centred, so the creature inside it sits low by half the difference.
 *
 * It cannot be dialled out with one constant, which is why this is a table and not a token.
 *
 * ## Why the offset is a FRACTION of canvas height
 *
 * Two sprites are 44x44 rather than 48x48, and the same table is read at whatever size the call
 * site renders. A fraction is the only form that survives both; the consumer multiplies it by the
 * rendered box.
 *
 * ## Why the PNG is decoded here rather than with a library
 *
 * This repo ships no image dependency and the input is uniform — every sprite is 8-bit RGBA,
 * non-interlaced (colour type 6, bit depth 8), which is the one case worth ~40 lines. Anything
 * else is refused loudly rather than guessed at.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SPRITE_DIR = path.join(ROOT, "public", "sprites", "monster");
const OUT = path.join(ROOT, "src", "data", "spriteOffsets.ts");

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The IHDR fields this decoder depends on, plus the concatenated IDAT payload. */
function readChunks(buf, file) {
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) throw new Error(`${file}: not a PNG`);
  const idat = [];
  let header;
  for (let at = 8; at < buf.length; ) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += length + 12; // length + type + data + CRC
  }
  if (!header) throw new Error(`${file}: no IHDR`);
  if (header.depth !== 8 || header.colorType !== 6 || header.interlace !== 0) {
    throw new Error(
      `${file}: expected 8-bit RGBA non-interlaced, got depth ${header.depth} colour type ` +
        `${header.colorType} interlace ${header.interlace}`,
    );
  }
  return { ...header, data: inflateSync(Buffer.concat(idat)) };
}

/**
 * The first and last rows holding any non-transparent pixel.
 *
 * Only the alpha byte of each pixel is read, but the scanlines still have to be un-filtered in
 * full: PNG filters are defined over the raw bytes and refer to the pixel to the left and the row
 * above, so skipping the colour bytes would corrupt the alpha of everything downstream.
 */
function opaqueRowBounds({ width, height, data }) {
  const bpp = 4;
  const stride = width * bpp;
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  let top = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = data[start];
    data.copy(row, 0, start + 1, start + 1 + stride);

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0; // left
      const b = prev[i]; // above
      const c = i >= bpp ? prev[i - bpp] : 0; // upper-left
      switch (filter) {
        case 0:
          break;
        case 1:
          row[i] = (row[i] + a) & 0xff;
          break;
        case 2:
          row[i] = (row[i] + b) & 0xff;
          break;
        case 3:
          row[i] = (row[i] + ((a + b) >> 1)) & 0xff;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default:
          throw new Error(`unknown filter ${filter} on row ${y}`);
      }
    }

    for (let x = 3; x < stride; x += bpp) {
      if (row[x] !== 0) {
        if (top === -1) top = y;
        bottom = y;
        break;
      }
    }
    row.copy(prev);
  }
  return { top, bottom };
}

const files = readdirSync(SPRITE_DIR)
  .filter((f) => f.endsWith(".png"))
  .sort();

const offsets = [];
for (const file of files) {
  const png = readChunks(readFileSync(path.join(SPRITE_DIR, file)), file);
  const { top, bottom } = opaqueRowBounds(png);
  if (top === -1) {
    console.warn(`${file}: fully transparent, skipped`);
    continue;
  }
  // Positive = the artwork's centre sits BELOW the canvas centre, which is the direction every
  // ground-anchored sprite leans.
  const headroom = top;
  const underfoot = png.height - 1 - bottom;
  const offset = (headroom - underfoot) / 2 / png.height;
  if (offset !== 0) offsets.push([file, offset]);
}

const body = offsets.map(([file, offset]) => `  "${file}": ${offset.toFixed(6)},`).join("\n");

writeFileSync(
  OUT,
  `/**
 * How far below its canvas centre each creature's artwork is drawn, as a fraction of canvas
 * height. GENERATED — run \`node scripts/measure-sprite-offsets.mjs\` to regenerate; that script
 * carries the explanation of why the sprites lean this way.
 *
 * Positive means the artwork sits low, so a consumer centring it optically shifts UP by this much
 * times the rendered box. Sprites already centred are omitted, so a miss is a true zero.
 *
 * Measured from the PNGs in \`public/sprites/monster/\`: ${offsets.length} of ${files.length} lean.
 */
export const SPRITE_VERTICAL_OFFSETS: Record<string, number> = {
${body}
};

/** A sprite's lean, or 0 for one that is already centred (or that has no entry). */
export function spriteVerticalOffset(spriteFile: string | undefined): number {
  return (spriteFile && SPRITE_VERTICAL_OFFSETS[spriteFile]) || 0;
}
`,
  "utf8",
);

console.log(`${offsets.length} of ${files.length} sprites lean; wrote ${path.relative(ROOT, OUT)}`);
