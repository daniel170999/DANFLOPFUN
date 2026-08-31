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

const canonicalHeader = home.match(HEADER)?.[0];
const canonicalCredit = home.match(CREDIT)?.[0];
if (!canonicalHeader || !canonicalCredit) throw new Error("index.html is missing the shell header or the credit line");

const pages = [
  { file: "proof/index.html", route: "/proof/" },
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
