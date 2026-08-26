#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "index.html"), "utf8");
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

console.log(JSON.stringify({ status: "ok", ids: ids.length, referencedIds: referencedIds.length, inlineScripts: inlineCount, rewrites: vercel.rewrites.length }));
