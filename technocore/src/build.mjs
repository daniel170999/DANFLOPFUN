/**
 * build.mjs — writes the approved standalone-mark masters from src/technocore.js.
 *
 *   node src/build.mjs
 *
 * One source of geometry. Exploratory custom lockups are intentionally excluded.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PALETTE, GRID, TYPE, RULES,
  mark,
} from './technocore.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(OUT, { recursive: true });

const P = PALETTE;
const HEADER = `<!-- Technocore — a product mark for the FLOP Network.
     Mark grid   : block ${GRID.block} · gutter ${GRID.gutter} · pitch ${GRID.pitch.toFixed(2)} · field ${GRID.field.toFixed(2)} (4x4) · 45° chamfers
     Clear space : ${TYPE.clear.toFixed(2)} (4X, X = one module) measured from the artwork, not the bounding box
     Minimums    : mark ${RULES.minMarkSize}px · one-colour below ${RULES.oneColourBelow}px
     Grid-derived Technocore artwork. Use the supplied FLOP masters byte-for-byte for parent-brand lineage. -->`;

/** Drop the provenance header in just after the opening tag. */
const stamp = svg => svg.replace(/^(<svg[^>]*>)/, `$1\n${HEADER}\n`);

const FILES = {
  /* ── the mark. This is the logo. Everything else is an application of it. ── */
  'technocore-mark-primary.svg':            mark(P.cyan),
  'technocore-mark-product.svg':         mark(P.green),
  'technocore-mark-print.svg':           mark(P.blue),
  'technocore-mark-onecolor-base.svg':   mark(P.base),
  'technocore-mark-onecolor-ice.svg':    mark(P.ice),
};

let bytes = 0;
for (const [name, body] of Object.entries(FILES)) {
  const out = stamp(body);
  writeFileSync(join(OUT, name), out, 'utf8');
  bytes += Buffer.byteLength(out);
  console.log(`  ${name.padEnd(38)} ${String(Buffer.byteLength(out)).padStart(6)} B`);
}

console.log(`\n${Object.keys(FILES).length} files · ${(bytes / 1024).toFixed(1)} KB → ${OUT}\n`);
console.log(`mark        ${GRID.field.toFixed(2)} square · 11 subpaths · no mask, no clip, no fill-rule`);
console.log(`clear space ${TYPE.clear.toFixed(2)} · mark minimum ${RULES.minMarkSize}px`);
