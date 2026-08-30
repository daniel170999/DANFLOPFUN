import assert from "node:assert/strict";
import test from "node:test";

import { appendReceipts, parseReceiptJsonl, proofReceipts, receiptJsonl } from "./receipts-core.mjs";
import { updateReceiptText } from "./update-receipts.mjs";
import { verifyReceipt, verifyReceiptFile, verifyReceiptRows } from "./verify-receipts.mjs";

const VALID = {
  did: "did:key:z6MkvYvgdk7s98SZNRUd41J6JLxStTQDw3tKvrY2TiuSshnp",
  fingerprint: "cb5086098af63486",
  room: "signing-messages",
  sequence: 4525,
  timestamp: "2026-08-29T02:41:37.487476Z",
  nonce: "1787971297219",
  signature: "_YEaXf0SerhB_3bFYNZaWG9fTSVJiHpS-Ot_UetWBO3QutrI6v9GzZfpxuVpubjXUaExFMrm-Fp1aB3Snq25Bw",
  text: "signed Technocore messages accept Ed25519 did:key; a valid signature proves key possession, not human identity or honesty. The current manual defines no rotation/delegation convention.",
};

const VALID_TWO = {
  did: VALID.did,
  fingerprint: VALID.fingerprint,
  room: "did-key-method",
  sequence: 3068,
  timestamp: "2026-08-29T03:20:59.369121Z",
  nonce: "1787973659100",
  signature: "N5rhvzNIlORwuWcB7s6ML_yEjm2BoAVAtfgYZXiXN45MLRd5C4tP4gx5MOX7YQac4XAh_Jmw7HvO1zMSNPz1Cg",
  text: "signed Technocore messages accept Ed25519 did:key; a valid signature proves key possession, not human identity or honesty. The current manual defines no rotation/delegation convention.",
};

test("the published fixture verifies offline from the did:key", () => {
  const result = verifyReceipt(VALID);
  assert.equal(result.ok, true);
  assert.equal(verifyReceiptFile(`${JSON.stringify(VALID)}\n`).ok, true);
});

test("text, signature and DID mutations fail closed", () => {
  assert.equal(verifyReceipt({ ...VALID, text: `${VALID.text} changed` }).ok, false);
  assert.equal(verifyReceipt({ ...VALID, signature: `${VALID.signature.slice(0, -1)}A` }).ok, false);
  assert.equal(verifyReceipt({ ...VALID, did: "did:key:z6MknDn3CH7vumHw5rXREhdQN5KjsSp2RWi4aUHusBDRVoRz" }).ok, false);
  assert.equal(verifyReceipt({ ...VALID, text: `${VALID.text}\nextra` }).reason, "receipt text is not in canonical swept form");
});

test("JSONL parser accepts one final newline but rejects blank records", () => {
  assert.equal(parseReceiptJsonl(`${JSON.stringify(VALID)}\n`).length, 1);
  assert.throws(() => parseReceiptJsonl(`${JSON.stringify(VALID)}\n\n${JSON.stringify(VALID)}`), /blank/u);
  assert.throws(() => parseReceiptJsonl(`${JSON.stringify(VALID)}\n\n`), /blank/u);
});

test("append is idempotent and never silently changes an existing receipt", () => {
  const first = appendReceipts([], [VALID]);
  assert.equal(first.added, 1);
  const again = appendReceipts(first.rows, [VALID]);
  assert.equal(again.added, 0);
  assert.throws(() => appendReceipts(first.rows, [{ ...VALID, text: "changed" }]), /receipt changed/u);
  assert.equal(verifyReceiptRows(first.rows).ok, true);
  assert.equal(receiptJsonl(first.rows), `${JSON.stringify(VALID)}\n`);
});

test("proof extraction keeps only exact verified room receipts", () => {
  const proof = {
    did: VALID.did,
    fingerprint: VALID.fingerprint,
    actions: [
      { room: VALID.room, nonce: VALID.nonce, signature: VALID.signature, text: VALID.text, receipt: { ...VALID, verified: true } },
      { room: "kibble", nonce: "2", signature: VALID.signature, text: "not committed", receipt: null },
    ],
  };
  const rows = proofReceipts(proof);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sequence, VALID.sequence);
});

test("receipt updater appends without rewriting existing JSONL bytes", () => {
  const legacy = `{"text":${JSON.stringify(VALID.text)},"signature":${JSON.stringify(VALID.signature)},"did":${JSON.stringify(VALID.did)},"fingerprint":${JSON.stringify(VALID.fingerprint)},"room":${JSON.stringify(VALID.room)},"sequence":${VALID.sequence},"timestamp":${JSON.stringify(VALID.timestamp)},"nonce":${JSON.stringify(VALID.nonce)}}\r\n`;
  const proof = {
    did: VALID.did,
    fingerprint: VALID.fingerprint,
    actions: [
      { kind: "room", room: VALID.room, nonce: VALID.nonce, signature: VALID.signature, text: VALID.text, receipt: { sequence: VALID.sequence, timestamp: VALID.timestamp, verified: true } },
      { kind: "room", room: VALID_TWO.room, nonce: VALID_TWO.nonce, signature: VALID_TWO.signature, text: VALID_TWO.text, receipt: { sequence: VALID_TWO.sequence, timestamp: VALID_TWO.timestamp, verified: true } },
    ],
  };
  const result = updateReceiptText(legacy, proof);
  assert.equal(result.added, 1);
  assert.equal(result.text.slice(0, legacy.length), legacy);
  assert.equal(result.text.endsWith(`${JSON.stringify(VALID_TWO)}\r\n`), true);
  assert.equal(updateReceiptText(result.text, proof).added, 0);
});
