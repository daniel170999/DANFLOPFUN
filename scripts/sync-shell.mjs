#!/usr/bin/env node
/* Push the canonical shell from the front page onto every other page.
 *
 * The site's original problem was three pages carrying three different
 * navigations. check-site.mjs now asserts they are byte-identical, which
 * catches drift but does not fix it — this does. Run it after any change to
 * the header or footer credit in index.html.
 *
 *   node scripts/sync-shell.mjs          report only
 *   node scripts/sync-shell.mjs --write  apply
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");

const home = await readFile(join(root, "index.html"), "utf8");
const HEADER = /<header class="nav">[\s\S]*?<\/header>/u;
const CREDIT = /<p class="credit">[\s\S]*?<\/p>/u;
// Secondary destinations live in the footer rather than the nav, which is
// deliberately capped at five. They are part of the shell, so they travel with it.
const FOOTER_LINKS = /<p class="footer-links[^"]*"[^>]*>[\s\S]*?<\/p>/u;

const canonicalHeader = home.match(HEADER)?.[0];
const canonicalCredit = home.match(CREDIT)?.[0];
const canonicalLinks = home.match(FOOTER_LINKS)?.[0];
if (!canonicalHeader || !canonicalCredit || !canonicalLinks) throw new Error("index.html is missing part of the shell: header, credit line or footer links");

const pages = [
  { file: "proof/index.html", route: "/proof/" },
  { file: "data/index.html", route: "/data/" },
  { file: "agents/index.html", route: "/agents/" },
  { file: "relay-field/index.html", route: "/relay-field/" },
  { file: "relay/index.html", route: "/relay/" },
  { file: "technocore/index.html", route: "/technocore/" },
];

const report = [];
for (const page of pages) {
  const path = join(root, page.file);
  const before = await readFile(path, "utf8");

  const header = canonicalHeader
    .replace(' aria-current="page"', "")
    .replace(`<a class="nav-link" href="${page.route}">`, `<a class="nav-link" href="${page.route}" aria-current="page">`);

  let after = before;
  if (HEADER.test(after)) after = after.replace(HEADER, header);
  else throw new Error(`${page.file} has no shell header to replace`);
  if (CREDIT.test(after)) after = after.replace(CREDIT, canonicalCredit);
  else throw new Error(`${page.file} has no credit line to replace`);
  if (FOOTER_LINKS.test(after)) after = after.replace(FOOTER_LINKS, canonicalLinks);
  else after = after.replace(CREDIT, `${canonicalLinks}
    ${canonicalCredit}`);

  const changed = after !== before;
  report.push({ file: page.file, changed });
  if (changed && write) await writeFile(path, after);
}

console.log(JSON.stringify({
  mode: write ? "write" : "check",
  changed: report.filter((entry) => entry.changed).map((entry) => entry.file),
  inSync: report.every((entry) => !entry.changed),
}, null, 0));

if (!write && report.some((entry) => entry.changed)) {
  console.error("shell drift: run `node scripts/sync-shell.mjs --write`");
  process.exitCode = 1;
}
