#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const includeHistory = process.argv.includes("--history");
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".svg", ".toml", ".txt", ".yaml", ".yml"]);
const checks = [
  { kind: "private Windows path", severity: "sensitive", pattern: new RegExp("C:" + "\\\\" + "Users" + "\\\\|Desktop" + "\\\\" + "FLOP AIRDROP", "iu") },
  { kind: "private local file", severity: "sensitive", pattern: new RegExp("(?:flop-" + "identity\\.dpapi|LLM" + " API\\.txt)", "iu") },
  { kind: "private provider choice", severity: "privacy-history", pattern: new RegExp("(?:api\\." + "vilao\\.ai|MiniMax-" + "M2\\.7)", "iu") },
  { kind: "credential-shaped literal", severity: "sensitive", pattern: /\b(?:sk-|ghp_|github_pat_|vercel_)[A-Za-z0-9_-]{20,}\b/iu },
  { kind: "literal bearer credential", severity: "sensitive", pattern: /Authorization\s*:\s*["']?Bearer\s+[A-Za-z0-9._-]{20,}/iu },
];

function inspectText(text, location, findings) {
  for (const check of checks) {
    if (check.pattern.test(text)) findings.push({ kind: check.kind, severity: check.severity, location });
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

const commits = includeHistory
  ? execFileSync("git", ["rev-list", "--all"], { cwd: root, encoding: "utf8" }).trim().split(/\s+/u).filter(Boolean)
  : [];
if (includeHistory) {
  for (const commit of commits) {
    const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", commit], { cwd: root, encoding: "utf8" }).split(/\r?\n/u).filter(Boolean);
    for (const path of paths) {
      if (!textExtensions.has(extname(path).toLowerCase())) continue;
      const text = execFileSync("git", ["show", `${commit}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      inspectText(text, `${commit.slice(0, 12)}:${path}`, findings);
    }
  }
}

const sensitiveFindings = findings.filter((finding) => finding.severity === "sensitive");
const privacyHistory = findings.filter((finding) => finding.severity === "privacy-history");
if (sensitiveFindings.length) {
  console.error(JSON.stringify({ status: "failed", sensitiveFindings, privacyHistory }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: privacyHistory.length ? "credentials-clean-with-history-notice" : "clean",
    currentFiles: (await currentFiles(root)).length,
    scannedCommits: commits.length,
    privacyHistory,
  }, null, 2));
}
