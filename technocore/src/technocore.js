/**
 * technocore.js — the whole identity as one dependency-free ES module.
 *
 * The approved shipped identity is the standalone mark. Import it into a
 * React/Vue/Svelte/vanilla site and call `mark()`; it returns a deterministic SVG
 * string. There is no runtime dependency and no font requirement for the mark.
 * The older logotype/application builders remain only as construction-era
 * experiments; build.mjs intentionally excludes them from the final kit.
 *
 * PROVENANCE. The family-grid constants below were measured out of FLOP
 * Network's own shipped studio files, not estimated from a screenshot. The
 * Technocore ring placement is an explicit product-mark proposal using that
 * measured language:
 *   · https://flop.finance/assets/flop-chip-favicon.svg   → the family reference
 *   · https://flop.finance/assets/flop-lockup-reverse.svg → the reference grid
 * Local copies of both sit in /research.
 *
 *   import { MARK_PATH, mark, COLOURWAYS } from './technocore.js'
 */

/* ─────────────────────────────────────────────── FLOP canonical palette ──── */
export const PALETTE = {
  base:  '#0A1128',   // Base            — deep-navy substrate, primary digital ground
  grey:  '#5C6670',   // Grey            — structural neutral, non-text on dark
  blue:  '#0466C8',   // FLOP Blue       — fills on dark, text on light
  cyan:  '#00B4D8',   // FLOP Cyan       — the parent accent, the Chip colour
  green: '#32D74B',   // Electric Green  — product/internal surfaces only
  ice:   '#F5F7FA',   // Ice White       — text on dark, light-theme substrate
  red:   '#FF453A',   // Error Red       — operational failure ONLY. Never decorative.
};

/* ──────────────────────────────────────────────── mark construction grid ──── */
/* Measured from the supplied FLOP Chip master. The Technocore mark uses the same 4×4
   field, module rhythm and 45° corner language; the official Chip itself must
   always be used from the supplied master, never rebuilt from these values. */
export const GRID = {
  block:   115.28,                    // straight run of one square
  gutter:  10.21,                     // space between adjacent blocks
  get pitch() { return this.block + this.gutter },        // 125.49
  get field() { return 4 * this.block + 3 * this.gutter },// 491.75 — the whole square
  bite:    76.46,                     // the quarter bitten out of each centre block
  radius:  28.65,                     // corner radius, apertures only
};

const B = GRID.block, G = GRID.gutter, P = GRID.pitch, S = GRID.field;

/* ──────────────────────────────────────────── logotype construction grid ──── */
/* Measured from flop-lockup-reverse.svg. FLOP's word mark is NOT a typeface —
   it is a bitmap of rounded square blocks. Each glyph is an 8×8 module box with
   a 2-module stroke, set on a 9-module advance. The Chip is the O, and it is
   exactly 8 modules square — which is why field ÷ 8 gives the module. */
export const TYPE = {
  get module()  { return S / 8 },                 // 61.469
  get block()   { return 0.9211 * this.module },  // 56.62
  get radius()  { return 0.197 * this.block },    // 11.15
  get advance() { return 9 * this.module },       // 553.22 — 8 box + 1 tracking
  get clear()   { return 4 * this.module },       // 245.88 — 4X clear space
};

const M = TYPE.module, LB = TYPE.block, LR = TYPE.radius, ADV = TYPE.advance;

/* ─────────────────────────────────────────────────────── path primitives ──── */
const n = v => Math.round(v * 100) / 100;
const col = i => i * P;

const rect = (x, y, w, h) => `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
const cellAt = (i, j) => rect(col(i), col(j), B, B);
const poly = pts => 'M' + pts.map(p => `${n(p[0])} ${n(p[1])}`).join('L') + 'Z';

function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}`
       + `V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}`
       + `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}`
       + `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}

/** 45° chamfers. Right angle sits on the inner corner; the hypotenuse cuts the outer. */
function chamfers(size, c) {
  return [
    poly([[c, 0],        [c, c],         [0, c]]),
    poly([[size - c, 0], [size, c],      [size - c, c]]),
    poly([[c, size - c], [c, size],      [0, size - c]]),
    poly([[size - c, size - c], [size, size - c], [size - c, size]]),
  ];
}

/* ══════════════════════════════════════════════════════════════ THE MARK ════
   A chamfered ring of eight parts with exactly one part absent.

   The absent part is the head: where the next write lands and the oldest write
   leaves. It is the only asymmetry in the drawing, and it echoes a chip-package
   orientation notch.

    Purely additive. No aperture path, no <mask>, no clip, no fill-rule, no
    transform, no filter. One <path> of eleven subpaths.
   ═════════════════════════════════════════════════════════════════════════ */
export const RING_SEGMENTS = [[1,0],[2,0],[0,1],[0,2],[3,1],[3,2],[2,3]];
export const HEAD_CELL = [1, 3];   // the omitted segment — bottom-left, where the ring rolls off

export const MARK_PATH = [
  ...chamfers(S, B),
  ...RING_SEGMENTS.map(c => cellAt(c[0], c[1])),
].join('');

/** An approximate grid reconstruction retained for construction experiments.
 *  It is not the official FLOP Chip and must never be used as lineage proof or
 *  shipped as parent artwork. Use research/flop_chip_official.svg instead. */
export const CHIP_PATH = [
  ...chamfers(S, B),
  ...[[1,0],[2,0],[0,1],[0,2],[3,1],[3,2],[1,3],[2,3],
      [1,1],[2,1],[1,2],[2,2]].map(c => cellAt(c[0], c[1])),
].join('');
export const CHIP_APERTURE = (() => {
  const x = P + B - GRID.bite, w = (2 * P + GRID.bite) - x;
  return rrect(x, x, w, w, GRID.radius);
})();

/* ═════════════════════════════════════════════════════════════ THE LOGOTYPE ══
   Cell codes:  #  full block
                q  top-left corner cut      w  top-right corner cut
                a  bottom-left corner cut   s  bottom-right corner cut
   ═════════════════════════════════════════════════════════════════════════ */
export const GLYPHS = {
  T: ['.q####w.','q######w','...##...','...##...','...##...','...##...','...##...','...##...'],
  E: ['.q######','q#######','##......','######..','######..','##......','a#######','.a######'],
  C: ['.q######','q#######','##......','##......','##......','##......','a#######','.a######'],
  H: ['##....##','##....##','##....##','########','########','##....##','##....##','##....##'],
  N: ['##....##','###...##','###...##','##.##.##','##.##.##','##...###','##...###','##....##'],
  O: ['.q####w.','q######w','##....##','##....##','##....##','##....##','a######s','.a####s.'],
  R: ['######w.','#######w','##....##','##....##','########','######s.','##..##..','##....##'],
};

function roundPoly(pts, r) {
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = [p1[0] + v1[0] / l1 * rr, p1[1] + v1[1] / l1 * rr];
    const b = [p1[0] + v2[0] / l2 * rr, p1[1] + v2[1] / l2 * rr];
    d += `${i ? 'L' : 'M'}${n(a[0])} ${n(a[1])}Q${n(p1[0])} ${n(p1[1])} ${n(b[0])} ${n(b[1])}`;
  }
  return d + 'Z';
}

function typeCell(code, x, y) {
  if (code === '#') return rrect(x, y, LB, LB, LR);
  const tri = {
    q: [[x + LB, y], [x + LB, y + LB], [x, y + LB]],
    w: [[x, y], [x + LB, y + LB], [x, y + LB]],
    a: [[x, y], [x + LB, y], [x + LB, y + LB]],
    s: [[x, y], [x + LB, y], [x, y + LB]],
  }[code];
  return tri ? roundPoly(tri, LR) : '';
}

function glyphPath(letter, ox) {
  const rows = GLYPHS[letter];
  if (!rows) return '';
  let d = '';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      d += typeCell(rows[r][c], ox + c * M, r * M);
  return d;
}

/**
 * Set a word in the logotype. '@' reserves a glyph slot for the mark.
 * @returns {{d:string, width:number, slots:number[]}}
 */
export function word(str) {
  let d = '';
  const slots = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '@') slots.push(i * ADV);
    else d += glyphPath(str[i], i * ADV);
  }
  return { d, width: (str.length - 1) * ADV + S, slots };
}

/* ═══════════════════════════════════════════════════════════════ BUILDERS ═══
   Every builder returns a complete <svg> string. Nothing is stateful, so the
   same call always produces byte-identical output.
   ═════════════════════════════════════════════════════════════════════════ */

const svgOpen = (w, h, label, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" `
  + `role="img" aria-label="${label}"${attrs ? ' ' + attrs : ''}>`;

/** The mark on its own — this is the shipped product mark. Minimum size: 24 px. */
export function mark(fill = PALETTE.cyan, attrs = '') {
  return svgOpen(S, S, 'Technocore', attrs)
       + `<title>Technocore</title><path d="${MARK_PATH}" fill="${fill}"/></svg>`;
}

/** The mark placed at (ox,oy) inside a bigger canvas. Always wrap in a <g>:
 *  a transform on the <path> itself would move the coordinate space a mask or
 *  clip resolves in. */
export function markGroup(fill, ox = 0, oy = 0) {
  return `<g transform="translate(${n(ox)} ${n(oy)})"><path d="${MARK_PATH}" fill="${fill}"/></g>`;
}

/**
 * Historical two-line lockup experiment. Not an approved or shipped asset.
 * Line 2 is inset by exactly one advance. That is half the two-glyph difference
 * between the lines, so the short line stays on the module grid and its columns
 * fall under line 1's: C under E, mark under C, R under H, E under N.
 * @param slot 'core' puts the mark in CORE's O (default); 'techno' uses the first O.
 */
export function stackedLockup({ type = PALETTE.ice, markFill = PALETTE.cyan,
                                slot = 'core', attrs = '' } = {}) {
  const [topStr, botStr] = slot === 'techno' ? ['TECHN@', 'CORE'] : ['TECHNO', 'C@RE'];
  const top = word(topStr), bot = word(botStr);
  const gap = 2 * M, off = ADV, height = 2 * S + gap;
  let body = `<g fill="${type}"><path d="${top.d}"/>`
           + `<g transform="translate(${n(off)} ${n(S + gap)})"><path d="${bot.d}"/></g></g>`;
  top.slots.forEach(ox => { body += markGroup(markFill, ox, 0); });
  bot.slots.forEach(ox => { body += markGroup(markFill, off + ox, S + gap); });
  return svgOpen(top.width, height, 'Technocore', attrs) + `<title>Technocore</title>` + body + '</svg>';
}

/**
 * Historical one-line lockup experiment. Not an approved or shipped asset.
 * @param slot 'core' → TECHNOC@RE (default) · 'techno' → TECHN@CORE
 */
export function horizontalLockup({ type = PALETTE.ice, markFill = PALETTE.cyan,
                                   slot = 'core', attrs = '' } = {}) {
  const w = word(slot === 'techno' ? 'TECHN@CORE' : 'TECHNOC@RE');
  let body = `<path d="${w.d}" fill="${type}"/>`;
  w.slots.forEach(ox => { body += markGroup(markFill, ox, 0); });
  return svgOpen(w.width, S, 'Technocore', attrs) + `<title>Technocore</title>` + body + '</svg>';
}

/** Historical favicon / app-icon experiment. Not included in the final kit. */
export function icon({ ground = PALETTE.base, fill = PALETTE.cyan, attrs = '' } = {}) {
  const box = S / 0.78, o = (box - S) / 2;
  const bg = ground ? `<rect width="${n(box)}" height="${n(box)}" fill="${ground}"/>` : '';
  return svgOpen(box, box, 'Technocore', attrs) + `<title>Technocore</title>`
       + bg + markGroup(fill, o, o) + '</svg>';
}

/** Construction overlay: the 4×4 grid, the chamfer diagonals, and the head cell. */
export function constructionOverlay({ stroke = PALETTE.cyan, opacity = 0.45,
                                      headStroke = PALETTE.ice } = {}) {
  let g = '';
  for (let i = 1; i < 4; i++) {
    for (const v of [col(i), col(i) - G]) {
      g += `<line x1="${n(v)}" y1="${n(-G * 3)}" x2="${n(v)}" y2="${n(S + G * 3)}"/>`
         + `<line x1="${n(-G * 3)}" y1="${n(v)}" x2="${n(S + G * 3)}" y2="${n(v)}"/>`;
    }
  }
  g += `<line x1="${n(B)}" y1="0" x2="0" y2="${n(B)}"/>`
     + `<line x1="${n(S - B)}" y1="0" x2="${n(S)}" y2="${n(B)}"/>`
     + `<line x1="${n(B)}" y1="${n(S)}" x2="0" y2="${n(S - B)}"/>`
     + `<line x1="${n(S - B)}" y1="${n(S)}" x2="${n(S)}" y2="${n(S - B)}"/>`;
  return `<g stroke="${stroke}" stroke-width="2" opacity="${opacity}" fill="none">${g}</g>`
       + `<g stroke="${headStroke}" stroke-width="4" fill="none">`
       + `<rect x="${n(col(HEAD_CELL[0]))}" y="${n(col(HEAD_CELL[1]))}" `
       + `width="${n(B)}" height="${n(B)}"/></g>`;
}

/* ══════════════════════════════════════════════════════════════ COLOURWAYS ══
   The word mark takes the neutral that contrasts the ground — Base on light,
   Ice White on dark — and no other colour, ever. The mark carries the colour.
   Never two accents in one lockup.
   ═════════════════════════════════════════════════════════════════════════ */
export const COLOURWAYS = [
  { id: 'primary',    name: 'Primary',          ground: PALETTE.ice,  type: PALETTE.base, mark: PALETTE.cyan,
    use: 'Default for outgoing work on Ice White and paper.' },
  { id: 'reverse',    name: 'Reverse',          ground: PALETTE.base, type: PALETTE.ice,  mark: PALETTE.cyan,
    use: 'Default on Base for digital and outgoing work.' },
  { id: 'print',      name: 'Print alternate',  ground: PALETTE.ice,  type: PALETTE.base, mark: PALETTE.blue,
    use: 'Single-pass print, where Cyan and Green shift.' },
  { id: 'product',    name: 'Product',           ground: PALETTE.ice,  type: PALETTE.base, mark: PALETTE.green,
    use: 'Product surfaces and internal tooling only; never outgoing or print.' },
  { id: 'mono-ice',   name: 'One-colour',       ground: PALETTE.base, type: PALETTE.ice,  mark: PALETTE.ice,
    use: 'Engrave, emboss, foil, and anything under 200 px.' },
  { id: 'mono-base',  name: 'One-colour light', ground: PALETTE.ice,  type: PALETTE.base, mark: PALETTE.base,
    use: 'Stamps, single-ink stationery, fax.' },
];

/* ═══════════════════════════════════════════════════════════════════ RULES ══ */
export const RULES = {
  clearSpace: TYPE.clear,       // 245.88 — 4X, X = one module, measured from artwork
  minStackedWidth: 159,         // px — keeps the embedded mark at or above 24 px
  minHorizontalWidth: 267,      // px — keeps the embedded mark at or above 24 px
  minMarkSize: 24,              // px — matches the Chip minimum
  oneColourBelow: 200,          // px — drop to one-colour under this
  aspectSwitch: 4,              // wider than 4:1 → horizontal lockup, else stacked
  approvedGrounds: [PALETTE.base, PALETTE.ice],
};
