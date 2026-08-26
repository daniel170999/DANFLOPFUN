#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".svg", ".toml", ".txt", ".yaml", ".yml"]);
const checks = [
  ["private Windows path", new RegExp("C:" + "\\\\" + "Users" + "\\\\|Desktop" + "\\\\" + "FLOP AIRDROP", "iu")],
  ["private local file", new RegExp("(?:flop-" + "identity\\.dpapi|LLM" + " API\\.txt)", "iu")],
  ["private provider choice", new RegExp("(?:api\\." + "vilao\\.ai|MiniMax-" + "M2\\.7)", "iu")],
  ["credential-shaped literal", /\b(?:sk-|ghp_|github_pat_|vercel_)[A-Za-z0-9_-]{20,}\b/iu],
  ["literal bearer credential", /Authorization\s*:\s*["']?Bearer\s+[A-Za-z0-9._-]{20,}/iu],
];

function inspectText(text, location, findings) {
  for (const [kind, pattern] of checks) {
    if (pattern.test(text)) findings.push({ kind, location });
  }
}

async function currentFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await currentFiles(path));
    else if (textExtensions.has(extname(entry.name).toLowerCase())) output.push(path);
  }
  return output;
}

const findings = [];
for (const path of await currentFiles(root)) {
  inspectText(await readFile(path, "utf8"), `working-tree:${relative(root, path)}`, findings);
}

const commits = execFileSync("git", ["rev-list", "--all"], { cwd: root, encoding: "utf8" }).trim().split(/\s+/u).filter(Boolean);
for (const commit of commits) {
  const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", commit], { cwd: root, encoding: "utf8" }).split(/\r?\n/u).filter(Boolean);
  for (const path of paths) {
    if (!textExtensions.has(extname(path).toLowerCase())) continue;
    const text = execFileSync("git", ["show", `${commit}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    inspectText(text, `${commit.slice(0, 12)}:${path}`, findings);
  }
}

if (findings.length) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "clean", currentFiles: (await currentFiles(root)).length, commits: commits.length }));
}
