#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { parseReceiptJsonl } from "../kibble-kit/receipts-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// `html` is the FLOP Relay field kit. It used to live at the site root; the root is now a
// real front page, so the kit assertions below follow it to /relay/ rather than being rewritten.
const html = await readFile(join(root, "relay", "index.html"), "utf8");
const homeHtml = await readFile(join(root, "index.html"), "utf8");
const proofHtml = await readFile(join(root, "proof", "index.html"), "utf8");
const navCss = await readFile(join(root, "assets", "relay-nav.css"), "utf8");
const relayCss = await readFile(join(root, "assets", "relay.css"), "utf8");
const relayShellJs = await readFile(join(root, "assets", "relay.js"), "utf8");
const flopChip = await readFile(join(root, "assets", "brand", "flop-chip-favicon.svg"), "utf8");
const relayHtml = await readFile(join(root, "relay", "index.html"), "utf8");
const relayFieldHtml = await readFile(join(root, "relay-field", "index.html"), "utf8");
const relayFieldCss = await readFile(join(root, "relay-field", "relay-field.css"), "utf8");
const relayFieldJs = await readFile(join(root, "relay-field", "relay-field.js"), "utf8");
const technocoreHtml = await readFile(join(root, "technocore", "index.html"), "utf8");
const workflow = await readFile(join(root, ".github", "workflows", "agent-pulse.yml"), "utf8");
const receiptWorkflow = await readFile(join(root, ".github", "workflows", "proof-receipts.yml"), "utf8");
const receipts = await readFile(join(root, "proof", "receipts.jsonl"), "utf8");
const readme = await readFile(join(root, "README.md"), "utf8");
const vercel = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));

function inlineFunctionSource(source, name) {
  const match = source.match(new RegExp(`^ {8}function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^ {8}\\}`, "mu"));
  assert(match, `index.html must expose ${name} for release verification`);
  return match[0].trimStart();
}

const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "index.html contains duplicate element IDs");

const referencedIds = [...html.matchAll(/getElementById\("([^"]+)"\)/gu)].map((match) => match[1]);
for (const id of referencedIds) assert(ids.includes(id), `JavaScript references missing element #${id}`);

let inlineCount = 0;
for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/giu)) {
  if (/\bsrc\s*=/iu.test(match[1])) continue;
  inlineCount += 1;
  new Script(match[2], { filename: `index.inline-${inlineCount}.js` });
}
assert(inlineCount > 0, "no inline application script was found");

const liveDid = html.match(/var LIVE_AGENT_DID = "([^"]+)";/u)?.[1];
assert(liveDid, "the Live Agent DID must be present");
const kibbleParserContext = {};
new Script([
  `var LIVE_AGENT_DID = ${JSON.stringify(liveDid)};`,
  inlineFunctionSource(html, "noteValue"),
  inlineFunctionSource(html, "parseKibbleEnvelope"),
  inlineFunctionSource(html, "actionEvidenceState"),
  inlineFunctionSource(html, "boardMatchesAction"),
].join("\n")).runInNewContext(kibbleParserContext);
const kibbleEnvelope = {
  version: 1,
  agent: "Daniel_satsAgent",
  did: liveDid,
  room: "kibble",
  actions: Array.from({ length: 14 }, (_, index) => ({ nonce: String(index + 1) })),
};
const parsedKibbleEnvelope = kibbleParserContext.parseKibbleEnvelope(`UNTRUSTED PUBLIC NOTE\n\n${JSON.stringify(kibbleEnvelope)}`);
assert.equal(parsedKibbleEnvelope.actions.length, 14, "Relay must accept the Worker's current 14-action proof envelope");
assert.throws(
  () => kibbleParserContext.parseKibbleEnvelope(JSON.stringify({ ...kibbleEnvelope, actions: Array.from({ length: 41 }, () => ({})) })),
  /Kibble action list is invalid/u,
  "Relay must retain a bounded action-list parser",
);
const legacyAction = {
  kind: "attest",
  jobId: "k123456789a",
  nonce: "42",
  outcome: "legacy_room_readback",
  receipt: { sequence: 99, nonce: "42", verified: false },
};
assert.equal(kibbleParserContext.actionEvidenceState(legacyAction), "legacy", "legacy room read-back must never be presented as current verified proof");
assert.equal(
  kibbleParserContext.actionEvidenceState({ ...legacyAction, outcome: "room_verified" }),
  "invalid",
  "room_verified requires receipt.verified=true",
);
assert.equal(
  kibbleParserContext.actionEvidenceState({ ...legacyAction, outcome: "room_verified", receipt: { ...legacyAction.receipt, verified: true } }),
  "room_verified",
  "an exact verified room receipt remains current proof",
);
assert.equal(
  kibbleParserContext.actionEvidenceState({
    ...legacyAction,
    kind: "result",
    outcome: "board_verified",
    text: "RESULT v1 | k123456789a | artifact hash",
    board: { verification: "exact_job_card", resultHash: "0123456789abcdef" },
  }),
  "board_verified",
  "a signed RESULT with exact board evidence remains board proof",
);
const boardAction = {
  ...legacyAction,
  kind: "result",
  outcome: "board_verified",
  text: "RESULT v1 | k123456789a | artifact hash",
  board: { verification: "exact_job_card", resultHash: "0123456789abcdef" },
};
assert.equal(
  kibbleParserContext.boardMatchesAction(boardAction, {
    jobs: [{ job_id: boardAction.jobId, worker_did: liveDid, status: "delivered", result: "artifact hash", result_hash: "0123456789abcdef" }],
  }),
  true,
  "Relay must corroborate a board proof against the exact current card",
);
assert.equal(
  kibbleParserContext.boardMatchesAction(boardAction, {
    jobs: [{ job_id: boardAction.jobId, worker_did: "did:key:other", status: "delivered", result: "artifact hash", result_hash: "0123456789abcdef" }],
  }),
  false,
  "Relay must reject a board card owned by another DID",
);
assert.equal(kibbleParserContext.actionEvidenceState({ ...legacyAction, outcome: "accepted", receipt: null }), "pending", "an ACK remains pending rather than verified");
assert(!html.includes("signed room receipt"), "Relay must not collapse signature validity and receipt validity into one claim");
assert(html.includes("RECENT LOBBY LINE"), "Relay must label its bounded lobby read accurately");
assert(!html.includes("RECENT ROOM LINE"), "Relay must not present a lobby-only read as general room coverage");
assert(html.includes("not present in current lobby window"), "Relay must describe a missing lobby line without implying all rooms were checked");

assert(Array.isArray(vercel.rewrites) && vercel.rewrites.length > 0, "vercel.json must define fixed rewrites");
for (const source of ["/", "/index.html"]) {
  const swallowed = (vercel.redirects || []).find((redirect) => redirect.source === source);
  assert(!swallowed, `${source} must serve the front page, not redirect away from it`);
}
assert(homeHtml.includes("<title>"), "the front page must be a real document");
const sources = vercel.rewrites.map((rewrite) => rewrite.source);
assert.equal(new Set(sources).size, sources.length, "vercel.json contains duplicate rewrite sources");
for (const rewrite of vercel.rewrites) {
  assert.match(rewrite.destination, /^https:\/\//u, `${rewrite.source} must target HTTPS`);
}
assert.deepEqual(
  vercel.rewrites.find((rewrite) => rewrite.source === "/api/agent/graph"),
  { source: "/api/agent/graph", destination: "https://daniel-sats-agent.danielsatsflopagent.workers.dev/graph" },
  "Relay Field must use the fixed public Worker graph rewrite",
);

assert(!/^\s*schedule\s*:/mu.test(workflow), "the public workflow must remain manual-only");
assert.match(workflow, /^\s*workflow_dispatch\s*:/mu, "the public workflow needs a manual dispatch trigger");
assert.match(workflow, /inputs:\s*[\s\S]*use_llm:/u, "the workflow needs an explicit model-call opt-in");
assert(html.includes('var resultPrefix = "RESULT v1 | " + action.jobId + " | ";'), "the public verifier must recognise canonical RESULT v1 lines");
assert(html.includes('var attestPrefix = "ATTEST v1 | " + action.jobId + " | ";'), "the public verifier must recognise canonical ATTEST v1 lines");
// The old copy-parity check compared the site root with /relay/, because the root used to be a
// byte-near duplicate of the kit. The root is a real front page now, so that comparison would
// compare /relay/ with itself. What it actually guarded — that the kit is still whole — is
// covered by the inline-script, parser, tab and panel assertions around it.
assert(relayHtml.includes('<link rel="canonical" href="https://danflopfun.vercel.app/relay/"'), "Relay must declare its own canonical URL");
for (const panel of ["guide", "signals", "briefing", "live-agent"]) {
  assert(relayHtml.includes(`data-tab="${panel}"`), `Relay must retain the ${panel} tab`);
  assert(relayHtml.includes(`data-panel="${panel}"`), `Relay must retain the ${panel} panel`);
}

assert(relayFieldHtml.includes('<link rel="stylesheet" href="./relay-field.css"'), "Relay Field must keep styling replaceable from its data code");
assert(relayFieldHtml.includes('<script type="module" src="./relay-field.js"></script>'), "Relay Field must load its functional data layer");
assert(relayFieldHtml.includes('href="https://danflopfun.vercel.app/relay-field/"'), "Relay Field must declare its canonical URL");
// Guard the controls by the ids the data layer actually binds to, not by their button copy.
// The original form of this assertion pinned the visible labels ("Play 40s", "Jump busiest"),
// so a wording change during the UI pass failed the check while every control it protects was
// present and working. Ids are the real contract between markup and behaviour.
assert(relayFieldHtml.includes("Time scrubber"), "Relay Field must label the time scrubber");
for (const control of ["scrubber-range", "play", "busiest", "live"]) {
  assert(relayFieldHtml.includes(`id="${control}"`), `Relay Field must ship the ${control} control`);
  assert(relayFieldJs.includes(`getElementById("${control}")`), `Relay Field must bind the ${control} control`);
}
assert(relayFieldHtml.includes('id="density"'), "Relay Field must expose the archive density strip beside the scrubber");
assert(relayFieldJs.includes('const API_PATH = "/api/agent/graph"'), "Relay Field must read the Worker graph endpoint");
assert(!relayFieldJs.includes("/archive"), "Relay Field browser code must not walk the public archive");
assert(relayFieldJs.includes("scheduleLivePolling") && relayFieldJs.includes("30_000"), "Relay Field must refresh the live head through a bounded read-only poll");
assert(relayFieldJs.includes("partnerByDid"), "Relay Field rings must orient toward their latest visible collaborator");
new Script(relayFieldJs, { filename: "relay-field.js" });
// Same reasoning: the property is that the field sits on a module-grid substrate defined in
// CSS, not that the cell happens to be 2rem. Pinning the literal value made a legitimate
// spacing change look like a regression.
assert.match(relayFieldCss, /\.grid-substrate\s*\{[\s\S]*?background-image:[\s\S]*?linear-gradient/u, "Relay Field must expose a module-grid substrate");
assert.match(relayFieldCss, /\.grid-substrate\s*\{[\s\S]*?background-size:\s*[\d.]+px\s+[\d.]+px/u, "Relay Field module grid must set an explicit cell size");
// The map is only "better than a chart" if it actually behaves like one.
for (const control of ["zoom-in", "zoom-out", "zoom-reset", "find", "layer-traces", "layer-agents", "layer-chat", "layer-grid", "overview"]) {
  assert(relayFieldHtml.includes(`id="${control}"`), `Relay Field must ship the ${control} map control`);
  assert(relayFieldJs.includes(`"${control}"`), `Relay Field must bind the ${control} map control`);
}
assert(relayFieldJs.includes("pointerdown") && relayFieldJs.includes("wheel"), "Relay Field must support pan and zoom");
assert(!/#[0-9a-fA-F]{3,6}/u.test(relayFieldJs), "Relay Field data code must carry no colour literals");

assert.match(receiptWorkflow, /^\s*schedule:\s*$/mu, "receipt workflow must run on a daily schedule");
assert.match(receiptWorkflow, /permissions:\s*\n\s*contents:\s*write/u, "receipt workflow needs only repository contents write permission");
assert(receiptWorkflow.includes("proof/receipts.jsonl"), "receipt workflow must publish the append-only JSONL ledger");
const receiptRows = parseReceiptJsonl(receipts);
assert(receiptRows.length > 0, "the public receipt ledger must contain at least one seeded row");
for (const row of receiptRows) {
  assert.deepEqual(Object.keys(row).sort(), ["did", "fingerprint", "nonce", "room", "sequence", "signature", "text", "timestamp"].sort(), "receipt rows must contain only the eight public fields");
}
assert(readme.includes("@UfukDegen") && readme.includes("https://github.com/UfukNode/Technocore-Live-Workstream"), "README must credit the prior Relay Field work");
assert(readme.includes("shipped first") && readme.includes("crowd view is a good idea") && /time\s+half/u.test(readme), "README must state the complement plainly");

const technocoreAssets = [
  "technocore-mark-primary.svg", "technocore-mark-512.png", "technocore-mark-print.svg",
  "technocore-mark-256.png", "technocore-mark-product.svg", "technocore-mark-128.png",
  "technocore-mark-onecolor-ice.svg", "technocore-mark-64.png", "technocore-mark-onecolor-base.svg",
  "technocore-mark-32.png", "technocore-favicon.svg", "technocore-social-card.png",
  "technocore-appicon-light.svg", "technocore-avatar.svg", "brand.json",
  "src/technocore.js", "src/build.mjs", "src/tokens.css", "technocore-brand-kit.zip",
];
for (const asset of technocoreAssets) await access(join(root, "technocore", asset));
assert(technocoreHtml.includes('<link rel="icon" href="/technocore/technocore-favicon.svg"'), "Technocore route must use its own favicon");
assert(!technocoreHtml.includes("#FF453A"), "Technocore page markup must not use Error Red");
assert(technocoreHtml.includes('href="/technocore/technocore-brand-kit.zip" download'), "Technocore route must expose the Download all bundle");
assert(technocoreHtml.includes("Download all &middot; 18 files &middot; ZIP"), "Technocore route must label the complete bundle");
assert(technocoreHtml.includes(".btn.download::before"), "Technocore download controls must carry a download symbol");
assert(technocoreHtml.includes("class=\"btn ghost download\""), "Every generated file download must use the download control style");
assert(technocoreHtml.includes("class=\"agent-note\""), "Technocore route must document the right-facing agent reading");
assert(!technocoreHtml.includes('href="/technocore-favicon.svg"'), "Technocore copy snippet must use the route-scoped favicon");
// One shell, byte-identical on every page. This is what the per-page navigation assertions
// were reaching for individually, and what the site did not have: three pages carried three
// different lockups, three different link sets, and three names for the same destination.
const SHELL_PAGES = [
  ["/", homeHtml],
  ["/relay-field/", relayFieldHtml],
  ["/relay/", relayHtml],
  ["/proof/", proofHtml],
  ["/technocore/", technocoreHtml],
];
const shellOf = (source) => {
  const match = source.match(/<header class="nav">[\s\S]*?<\/header>/u);
  assert(match, "every page must carry the shared shell header");
  return match[0];
};
const canonicalShell = shellOf(homeHtml).replace(/ aria-current="page"/gu, "");
for (const [route, source] of SHELL_PAGES) {
  assert.equal(
    shellOf(source).replace(/ aria-current="page"/gu, ""),
    canonicalShell,
    `${route} must carry the identical shared shell`,
  );
  assert(
    shellOf(source).includes(`href="${route}" aria-current="page"`),
    `${route} must mark itself as the current destination`,
  );
  assert(source.includes('aria-label="FLOP Chip"'), `${route} must show the official FLOP Chip`);
  assert(source.includes('class="credit"'), `${route} must credit FLOP Labs for the Chip artwork`);
  // Pages that own their typography link the shell directly; the pages built on the full
  // design system get it through relay.css, which imports it.
  assert(
    source.includes("/assets/relay-nav.css") || source.includes("/assets/relay.css"),
    `${route} must load the shared shell stylesheet`,
  );
  assert(source.includes("/assets/relay.js"), `${route} must load the shared shell behaviour`);
}
for (const [, source] of SHELL_PAGES) {
  for (const route of ["/", "/relay-field/", "/relay/", "/proof/", "/technocore/"]) {
    assert(source.includes(`href="${route}"`), `every page must link ${route}`);
  }
}

// The Chip is FLOP Labs' artwork. It ships unmodified and the credit names them and the source.
assert(flopChip.includes('viewBox="179.91 181.41 637.18 637.18"'), "the FLOP Chip must keep its official viewBox");
const chipPath = flopChip.match(/ d="([^"]+)"/u)?.[1] || "";
assert(chipPath.length > 1200, "the FLOP Chip path must be the official geometry, not a redraw");
for (const [route, source] of SHELL_PAGES) {
  assert(source.includes(chipPath.slice(0, 120)), `${route} must render the official Chip path, not an approximation`);
  assert(source.includes("flop.finance/assets/flop-chip-favicon.svg"), `${route} must cite where the Chip came from`);
  assert(/FLOP Labs<\/strong>/u.test(source), `${route} must name FLOP Labs as the artwork's author`);
}

// Accessible hit areas and a visible current-page marker now live in one stylesheet.
assert(navCss.includes("min-height: 40px"), "shared navigation links need an explicit hit area");
assert(navCss.includes('.nav-link[aria-current="page"]::after'), "the shared shell must mark the current page visually");
assert(navCss.includes("min-height: 44px"), "navigation targets must reach 44px on a phone");
assert(!navCss.includes("body {"), "the shell stylesheet must not restyle pages that own their typography");
assert(relayShellJs.includes("prefers-reduced-motion"), "shared motion must honour reduced-motion");
assert(relayCss.includes("prefers-reduced-motion"), "the design system must honour reduced-motion");
assert(!homeHtml.includes("#FF453A") && !proofHtml.includes("#FF453A"), "Error Red stays semantic, never decorative");
assert.match(technocoreHtml, /<section id="delivery">\s*<p class="kicker">Delivery<\/p>/u, "the brand-kit destination must land on the Delivery section");
assert(technocoreHtml.includes("@media(max-width:719px){.duo,.spec,.well{min-width:0}.duo .well{overflow-x:auto}}"), "Technocore narrow layouts must confine wide lockups to specimen-level scrolling");
let technocoreInlineCount = 0;
for (const match of technocoreHtml.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/giu)) {
  if (/\bsrc\s*=/iu.test(match[1])) continue;
  technocoreInlineCount += 1;
  new Script(match[2], { filename: `technocore.inline-${technocoreInlineCount}.js` });
}
assert.equal(technocoreInlineCount, 1, "Technocore route must keep its single inline interaction script");

console.log(JSON.stringify({
  status: "ok",
  pages: SHELL_PAGES.length,
  shell: "identical",
  chip: "official FLOP Labs artwork, credited",
  kitIds: ids.length,
  kitReferencedIds: referencedIds.length,
  kitInlineScripts: inlineCount,
  receipts: parseReceiptJsonl(receipts).length,
  technocoreAssets: technocoreAssets.length,
  redirects: (vercel.redirects || []).length,
  rewrites: vercel.rewrites.length,
}));
