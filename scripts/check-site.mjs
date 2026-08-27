#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "index.html"), "utf8");
const technocoreHtml = await readFile(join(root, "technocore", "index.html"), "utf8");
const workflow = await readFile(join(root, ".github", "workflows", "agent-pulse.yml"), "utf8");
const vercel = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));

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

assert(Array.isArray(vercel.rewrites) && vercel.rewrites.length > 0, "vercel.json must define fixed rewrites");
const sources = vercel.rewrites.map((rewrite) => rewrite.source);
assert.equal(new Set(sources).size, sources.length, "vercel.json contains duplicate rewrite sources");
for (const rewrite of vercel.rewrites) {
  assert.match(rewrite.destination, /^https:\/\//u, `${rewrite.source} must target HTTPS`);
}

assert(!/^\s*schedule\s*:/mu.test(workflow), "the public workflow must remain manual-only");
assert.match(workflow, /^\s*workflow_dispatch\s*:/mu, "the public workflow needs a manual dispatch trigger");
assert.match(workflow, /inputs:\s*[\s\S]*use_llm:/u, "the workflow needs an explicit model-call opt-in");
assert(html.includes('var resultPrefix = "RESULT v1 | " + action.jobId + " | ";'), "the public verifier must recognise canonical RESULT v1 lines");
assert(html.includes('var attestPrefix = "ATTEST v1 | " + action.jobId + " | ";'), "the public verifier must recognise canonical ATTEST v1 lines");

const technocoreAssets = [
  "technocore-mark-primary.svg", "technocore-mark-512.png", "technocore-mark-print.svg",
  "technocore-mark-256.png", "technocore-mark-product.svg", "technocore-mark-128.png",
  "technocore-mark-onecolor-ice.svg", "technocore-mark-64.png", "technocore-mark-onecolor-base.svg",
  "technocore-mark-32.png", "technocore-favicon.svg", "technocore-social-card.png",
  "technocore-appicon-light.svg", "technocore-avatar.svg", "brand.json",
  "src/technocore.js", "src/build.mjs", "src/tokens.css",
];
for (const asset of technocoreAssets) await access(join(root, "technocore", asset));
await access(join(root, "technocore", "technocore-brand-kit.zip"));
assert(technocoreHtml.includes('<link rel="icon" href="/technocore/technocore-favicon.svg"'), "Technocore route must use its own favicon");
assert(!technocoreHtml.includes("#FF453A"), "Technocore page markup must not use Error Red");
assert(technocoreHtml.includes('href="/technocore/technocore-brand-kit.zip" download'), "Technocore route must provide the complete kit download");
const kitCheck = execFileSync(process.execPath, [join(root, "scripts", "build-technocore-kit.mjs"), "--check"], { cwd: root, encoding: "utf8" });
assert.match(kitCheck, /"files":18/u, "Technocore brand kit must retain all 18 public files");
let technocoreInlineCount = 0;
for (const match of technocoreHtml.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/giu)) {
  if (/\bsrc\s*=/iu.test(match[1])) continue;
  technocoreInlineCount += 1;
  new Script(match[2], { filename: `technocore.inline-${technocoreInlineCount}.js` });
}
assert.equal(technocoreInlineCount, 1, "Technocore route must keep its single inline interaction script");

console.log(JSON.stringify({ status: "ok", ids: ids.length, referencedIds: referencedIds.length, inlineScripts: inlineCount, technocoreAssets: technocoreAssets.length, technocoreBundle: true, rewrites: vercel.rewrites.length }));
