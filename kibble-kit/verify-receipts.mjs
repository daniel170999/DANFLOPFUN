#!/usr/bin/env node
// Offline verifier for proof/receipts.jsonl.  It performs no network requests and does not
// resolve a DID: the Ed25519 public key is carried by the did:key itself.

import { createPublicKey, verify as verifySignature } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeReceipt, parseReceiptJsonl, receiptIdentity, sweepReceiptText } from "./receipts-core.mjs";

const BASE58BTC = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_MULTICODEC = Uint8Array.from([0xed, 0x01]);
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function base58btcToBytes(value) {
  let number = 0n;
  for (const char of String(value || "")) {
    const digit = BASE58BTC.indexOf(char);
    if (digit < 0) throw new Error("DID contains an invalid base58btc character");
    number = number * 58n + BigInt(digit);
  }
  const bytes = [];
  while (number > 0n) {
    bytes.push(Number(number & 255n));
    number >>= 8n;
  }
  const leading = String(value || "").match(/^1*/u)?.[0].length || 0;
  return Buffer.from([...Array(leading).fill(0), ...bytes.reverse()]);
}

function publicKeyForDid(did) {
  const text = String(did || "");
  if (!text.startsWith("did:key:z")) throw new Error("DID is not a base58btc did:key");
  const decoded = base58btcToBytes(text.slice("did:key:z".length));
  if (decoded.length !== 34 || decoded[0] !== ED25519_MULTICODEC[0] || decoded[1] !== ED25519_MULTICODEC[1]) {
    throw new Error("DID does not contain an Ed25519 multicodec key");
  }
  return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, decoded.subarray(2)]), format: "der", type: "spki" });
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replace(/-/gu, "+").replace(/_/gu, "/");
  return Buffer.from(`${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`, "base64");
}

export function verifyReceipt(row) {
  try {
    const normalized = normalizeReceipt(row);
    const key = publicKeyForDid(normalized.did);
    const signature = base64UrlToBytes(normalized.signature);
    if (signature.length !== 64) return { ok: false, reason: "signature_length", row: normalized };
    const payload = Buffer.from(`${normalized.room}|${normalized.nonce}|${sweepReceiptText(normalized.text)}`, "utf8");
    const ok = verifySignature(null, payload, key, signature);
    return { ok, reason: ok ? null : "signature_mismatch", row: normalized, identity: receiptIdentity(normalized) };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
}

export function verifyReceiptRows(rows) {
  const results = (Array.isArray(rows) ? rows : []).map((row, index) => ({ line: index + 1, ...verifyReceipt(row) }));
  const identities = new Set();
  const sequenceKeys = new Set();
  for (const result of results) {
    if (!result.ok || !result.row) continue;
    if (identities.has(result.identity)) {
      result.ok = false;
      result.reason = "duplicate_receipt_identity";
    }
    identities.add(result.identity);
    const sequenceKey = `${result.row.room}|${result.row.sequence}`;
    if (sequenceKeys.has(sequenceKey)) {
      result.ok = false;
      result.reason = "duplicate_room_sequence";
    }
    sequenceKeys.add(sequenceKey);
  }
  return {
    ok: results.every((result) => result.ok),
    total: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}

export function verifyReceiptFile(source) {
  try {
    const rows = parseReceiptJsonl(source);
    return verifyReceiptRows(rows);
  } catch (error) {
    return { ok: false, total: 0, passed: 0, failed: 1, results: [{ line: null, ok: false, reason: String(error?.message || error) }] };
  }
}

async function main() {
  const path = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "proof/receipts.jsonl";
  const source = await readFile(path, "utf8");
  const report = verifyReceiptFile(source);
  console.log(JSON.stringify({ file: path, ...report }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
