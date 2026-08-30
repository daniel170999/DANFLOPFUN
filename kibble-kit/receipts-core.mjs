// Small, dependency-free helpers for the public receipt ledger.
//
// The ledger is intentionally narrower than the Worker's proof envelope: it contains only
// fields that were already public in a signed room write.  Keep this module free of network and
// filesystem access so an updater and a verifier can share the same append-only rules.

export const RECEIPT_FIELDS = Object.freeze([
  "did", "fingerprint", "room", "sequence", "timestamp", "nonce", "signature", "text",
]);

const ROOM_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/u;
const DID_PATTERN = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+$/u;
const FINGERPRINT_PATTERN = /^[0-9a-f]{16}$/u;
const NONCE_PATTERN = /^\d{1,24}$/u;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/u;
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;

export function sweepReceiptText(value, maximum = 4000) {
  const text = String(value ?? "").replace(INVISIBLE, " ").replace(/\s+/gu, " ").trim();
  if (!text || [...text].length > maximum) return null;
  return text;
}

function isIsoDate(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function normalizeReceipt(value, { lineNumber = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`receipt${lineNumber === null ? "" : ` line ${lineNumber}`} is not an object`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...RECEIPT_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`receipt${lineNumber === null ? "" : ` line ${lineNumber}`} has unexpected fields`);
  }
  const sequence = Number(value.sequence);
  const text = sweepReceiptText(value.text);
  if (!DID_PATTERN.test(String(value.did || ""))) throw new Error("receipt DID is invalid");
  if (!FINGERPRINT_PATTERN.test(String(value.fingerprint || ""))) throw new Error("receipt fingerprint is invalid");
  if (!ROOM_PATTERN.test(String(value.room || ""))) throw new Error("receipt room is invalid");
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error("receipt sequence is invalid");
  if (!isIsoDate(value.timestamp)) throw new Error("receipt timestamp is invalid");
  if (!NONCE_PATTERN.test(String(value.nonce || ""))) throw new Error("receipt nonce is invalid");
  if (!SIGNATURE_PATTERN.test(String(value.signature || ""))) throw new Error("receipt signature is invalid");
  if (!text || text !== String(value.text)) throw new Error("receipt text is not in canonical swept form");
  return {
    did: String(value.did),
    fingerprint: String(value.fingerprint),
    room: String(value.room),
    sequence,
    timestamp: String(value.timestamp),
    nonce: String(value.nonce),
    signature: String(value.signature),
    text,
  };
}

export function receiptIdentity(value) {
  const row = value || {};
  return `${row.room}|${row.nonce}|${row.signature}`;
}

export function receiptSequenceIdentity(value) {
  const row = value || {};
  return `${row.room}|${row.sequence}`;
}

export function parseReceiptJsonl(source) {
  const text = String(source ?? "");
  if (!text.trim()) return [];
  const rows = [];
  const lines = text.split(/\r?\n/u);
  // Exactly one final newline is the JSONL terminator. A second trailing newline is a
  // blank record and must fail closed rather than being silently discarded.
  if (lines.at(-1) === "") lines.pop();
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) throw new Error(`receipt line ${index + 1} is blank`);
    let value;
    try { value = JSON.parse(line); } catch { throw new Error(`receipt line ${index + 1} is not valid JSON`); }
    rows.push(normalizeReceipt(value, { lineNumber: index + 1 }));
  }
  return rows;
}

export function receiptJsonl(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => JSON.stringify(normalizeReceipt(row))).join("\n") + (rows?.length ? "\n" : "");
}

export function proofReceipts(proof) {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) throw new Error("proof envelope is not an object");
  const did = String(proof.did || "");
  const fingerprint = String(proof.fingerprint || "");
  const actions = Array.isArray(proof.actions) ? proof.actions : [];
  return actions
    .filter((action) => action && action.receipt && action.receipt.verified === true)
    .map((action) => normalizeReceipt({
      did,
      fingerprint,
      room: action.room,
      sequence: action.receipt.sequence,
      timestamp: action.receipt.timestamp,
      nonce: action.nonce,
      signature: action.signature,
      text: action.text,
    }));
}

export function appendReceipts(existingRows, incomingRows) {
  const rows = (Array.isArray(existingRows) ? existingRows : []).map((row) => normalizeReceipt(row));
  const byIdentity = new Map();
  const bySequence = new Map();
  for (const row of rows) {
    const identity = receiptIdentity(row);
    const sequence = receiptSequenceIdentity(row);
    if (byIdentity.has(identity) && JSON.stringify(byIdentity.get(identity)) !== JSON.stringify(row)) {
      throw new Error(`existing receipt changed for ${identity}`);
    }
    if (bySequence.has(sequence) && receiptIdentity(bySequence.get(sequence)) !== identity) {
      throw new Error(`duplicate room sequence ${sequence}`);
    }
    byIdentity.set(identity, row);
    bySequence.set(sequence, row);
  }
  let added = 0;
  for (const candidate of Array.isArray(incomingRows) ? incomingRows : []) {
    const row = normalizeReceipt(candidate);
    const identity = receiptIdentity(row);
    const sequence = receiptSequenceIdentity(row);
    const prior = byIdentity.get(identity);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(row)) throw new Error(`receipt changed for ${identity}`);
      continue;
    }
    const sequencePrior = bySequence.get(sequence);
    if (sequencePrior && receiptIdentity(sequencePrior) !== identity) throw new Error(`room sequence changed for ${sequence}`);
    rows.push(row);
    byIdentity.set(identity, row);
    bySequence.set(sequence, row);
    added += 1;
  }
  return { rows, added };
}
