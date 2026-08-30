#!/usr/bin/env node
// Fetch the public Worker proof envelope and append newly read-back receipts.  The command is
// deliberately fail-closed: a malformed or cryptographically invalid row is never committed.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendReceipts, parseReceiptJsonl, proofReceipts, receiptIdentity } from "./receipts-core.mjs";
import { verifyReceiptRows } from "./verify-receipts.mjs";

export const DEFAULT_PROOF_URL = "https://daniel-sats-agent.danielsatsflopagent.workers.dev/proof?fresh=1";
export const DEFAULT_OUTPUT = "proof/receipts.jsonl";

export function updateReceiptText(existingText, proof) {
  const source = String(existingText ?? "");
  const existingRows = parseReceiptJsonl(source);
  const incomingRows = proofReceipts(proof);
  const incomingVerification = verifyReceiptRows(incomingRows);
  if (!incomingVerification.ok) throw new Error(`proof contains invalid receipt (${incomingVerification.failed} failed)`);
  const merged = appendReceipts(existingRows, incomingRows);
  const allVerification = verifyReceiptRows(merged.rows);
  if (!allVerification.ok) throw new Error(`receipt ledger failed verification (${allVerification.failed} failed)`);
  // Preserve every existing line byte-for-byte. The ledger contract is append-only: a new
  // proof may add lines, but it must never reserialise or reorder history that is already there.
  const existingIdentities = new Set(existingRows.map(receiptIdentity));
  const additions = incomingRows.filter((row) => !existingIdentities.has(receiptIdentity(row)));
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const body = source.replace(/\r?\n$/u, "");
  const appended = additions.map((row) => JSON.stringify(row)).join(newline);
  const nextText = additions.length === 0
    ? source
    : `${body ? `${body}${newline}` : ""}${appended}${newline}`;
  return { text: nextText, rows: merged.rows, added: merged.added, verification: allVerification };
}

export async function fetchProof(url = DEFAULT_PROOF_URL, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`proof endpoint returned HTTP ${response.status}`);
  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("proof endpoint returned a malformed envelope");
  return body;
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  return import("node:fs/promises").then(({ appendFile }) => appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`));
}

async function main() {
  const output = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length)
    || DEFAULT_OUTPUT;
  const proofUrl = process.argv.find((value) => value.startsWith("--proof-url="))?.slice("--proof-url=".length)
    || DEFAULT_PROOF_URL;
  let existingText = "";
  try { existingText = await readFile(output, "utf8"); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const proof = await fetchProof(proofUrl);
  const result = updateReceiptText(existingText, proof);
  if (result.added > 0) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, result.text, "utf8");
  }
  await setOutput("changed", result.added > 0 ? "true" : "false");
  await setOutput("added", String(result.added));
  console.log(JSON.stringify({ output, added: result.added, total: result.rows.length, verified: result.verification.passed }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
