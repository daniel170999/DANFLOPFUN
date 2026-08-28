#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "index.html"), "utf8");
const relayHtml = await readFile(join(root, "relay", "index.html"), "utf8");
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
assert(Array.isArray(vercel.redirects) && vercel.redirects.length > 0, "vercel.json must define the public landing redirect");
const homeRedirect = vercel.redirects.find((redirect) => redirect.source === "/");
assert.deepEqual(homeRedirect, { source: "/", destination: "/technocore/", permanent: false }, "the public home must redirect safely to the Technocore submission");
const legacyRelayRedirect = vercel.redirects.find((redirect) => redirect.source === "/index.html");
assert.deepEqual(legacyRelayRedirect, { source: "/index.html", destination: "/relay/", permanent: false }, "the legacy field-kit page must resolve to its named Relay route");
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
assert.equal(relayHtml.replaceAll("https://danflopfun.vercel.app/relay/", "https://danflopfun.vercel.app/"), html, "Relay must retain the complete field-kit implementation, apart from its canonical public route");
assert(relayHtml.includes('<link rel="canonical" href="https://danflopfun.vercel.app/relay/"'), "Relay must declare its own canonical URL");
for (const panel of ["guide", "signals", "briefing", "live-agent"]) {
  assert(relayHtml.includes(`data-tab="${panel}"`), `Relay must retain the ${panel} tab`);
  assert(relayHtml.includes(`data-panel="${panel}"`), `Relay must retain the ${panel} panel`);
}

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
assert(technocoreHtml.includes('href="#submission" aria-current="page">Submission</a>'), "Technocore route must make the competition submission its primary navigation item");
assert(technocoreHtml.includes('href="#delivery">Brand kit</a>'), "Technocore route must preserve a direct brand-kit destination");
assert(technocoreHtml.includes('href="/relay/">Relay tools</a>'), "Technocore route must retain a visible route back to the full FLOP Relay field kit");
assert.match(technocoreHtml, /<section id="delivery">\s*<p class="kicker">Delivery<\/p>/u, "the brand-kit destination must land on the Delivery section");
assert(!technocoreHtml.includes('href="/#guide"') && !technocoreHtml.includes('href="/#signals"') && !technocoreHtml.includes('href="/#live-agent"'), "Technocore navigation must not expose the retired field-kit sections");
assert(technocoreHtml.includes("@media(max-width:719px){.duo,.spec,.well{min-width:0}.duo .well{overflow-x:auto}}"), "Technocore narrow layouts must confine wide lockups to specimen-level scrolling");
const kitCheck = execFileSync(process.execPath, [join(root, "scripts", "build-technocore-kit.mjs"), "--check"], { cwd: root, encoding: "utf8" });
assert.match(kitCheck, /"files":18/u, "Technocore brand kit must retain all 18 public files");
let technocoreInlineCount = 0;
for (const match of technocoreHtml.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/giu)) {
  if (/\bsrc\s*=/iu.test(match[1])) continue;
  technocoreInlineCount += 1;
  new Script(match[2], { filename: `technocore.inline-${technocoreInlineCount}.js` });
}
assert.equal(technocoreInlineCount, 1, "Technocore route must keep its single inline interaction script");

console.log(JSON.stringify({ status: "ok", ids: ids.length, referencedIds: referencedIds.length, inlineScripts: inlineCount, relay: true, technocoreAssets: technocoreAssets.length, technocoreBundle: true, redirects: vercel.redirects.length, rewrites: vercel.rewrites.length }));
