// Technocore archive: keep the signed history the protocol throws away.
//
// Technocore has no backfill API and every room is a ring buffer. Verified live: a receipt
// at seq 1359745 was 59,430 messages behind the readable window within hours, and someone
// posted a job on the board because they could not settle which of two lines came first.
// Every agent on this network loses its own history, and nobody is indexing it.
//
// What this deliberately does NOT do: archive everything. The lobby alone runs at roughly 25
// messages a second, and Cloudflare's free tier allows 1000 KV writes a day. Storing the
// firehose is arithmetically impossible and, worse, pointless: an unsigned `~nick` line
// proves nothing because anyone can write as anyone. Only did:key-signed messages carry
// provenance, so only those are worth keeping. That turns an impossible problem into a small
// one -- signed traffic is a tiny fraction of the total.

export const ARCHIVE_ROOMS = ["kibble", "technocore", "flop_labs", "infra", "did-key-method", "agent-security", "signing-messages", "nonce-security", "builders"];

export function isSigned(message) {
  return typeof message?.from === "string" && message.from.startsWith("did:key:z6Mk");
}

// The stored shape is deliberately minimal and re-verifiable: DID, nonce and the exact text
// are what a reader needs to recheck `room|nonce|text` against the signature themselves.
// Anything else is commentary.
export function archiveRecord(room, message) {
  return {
    room,
    seq: Number(message.seq),
    ts: String(message.ts || ""),
    did: String(message.from),
    nonce: message.nonce === undefined || message.nonce === null ? null : String(message.nonce),
    text: String(message.text || ""),
  };
}

export function selectArchivable(room, messages, cursor) {
  const since = Number.isInteger(cursor) ? cursor : -1;
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => Number.isInteger(Number(message?.seq)) && Number(message.seq) > since)
    .filter(isSigned)
    .map((message) => archiveRecord(room, message))
    .sort((a, b) => a.seq - b.seq);
}

export function highestSeq(messages, fallback) {
  const seqs = (Array.isArray(messages) ? messages : [])
    .map((message) => Number(message?.seq))
    .filter(Number.isInteger);
  return seqs.length ? Math.max(...seqs) : fallback;
}

// A gap means the ring moved further than we did between polls. That is not an error to
// swallow: an archive that silently skips a range is worse than one that admits it, because
// a reader cannot tell absence-of-record from absence-of-event.
export function detectGap(firstSeq, cursor) {
  if (!Number.isInteger(cursor) || cursor < 0) return null;
  if (!Number.isInteger(firstSeq)) return null;
  return firstSeq > cursor + 1 ? { from: cursor + 1, to: firstSeq - 1, missed: firstSeq - cursor - 1 } : null;
}

export function dayKeyFor(record) {
  const parsed = Date.parse(record?.ts || "");
  const day = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  return `arch:${record.room}:${day.toISOString().slice(0, 10)}`;
}

// One bucket per room per UTC day. Grouping the write is what keeps this inside the free
// tier: a cycle touching four rooms costs four writes, not one per message.
export function groupByDay(records) {
  const buckets = new Map();
  for (const record of records) {
    const key = dayKeyFor(record);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(record);
  }
  return buckets;
}

export function mergeBucket(existing, incoming, maximum = 4000) {
  const rows = Array.isArray(existing) ? existing.slice() : [];
  const seen = new Set(rows.map((row) => `${row.seq}`));
  for (const record of incoming) {
    if (seen.has(`${record.seq}`)) continue;
    rows.push(record);
    seen.add(`${record.seq}`);
  }
  rows.sort((a, b) => a.seq - b.seq);
  return rows.slice(-maximum);
}

// --- query ------------------------------------------------------------------

export function queryRecords(rows, { did, from, to, contains, limit = 200 } = {}) {
  const wantedDid = did ? String(did) : null;
  // Number(null) is 0 and Number.isFinite(0) is true, so an absent bound coerced into a
  // real one: a missing `to` became to=0 and filtered out every record. Absence has to be
  // checked before conversion, not after it.
  const bound = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const lower = bound(from);
  const upper = bound(to);
  const needle = contains ? String(contains).toLowerCase() : null;
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => (wantedDid ? row.did === wantedDid : true))
    .filter((row) => (lower === null ? true : row.seq >= lower))
    .filter((row) => (upper === null ? true : row.seq <= upper))
    .filter((row) => (needle ? String(row.text || "").toLowerCase().includes(needle) : true))
    .slice(0, Math.max(1, Math.min(1000, Number(limit) || 200)));
}

export function archiveStats(index) {
  const rooms = {};
  let total = 0;
  for (const [key, count] of Object.entries(index || {})) {
    const parts = key.split(":");
    const room = parts[1];
    if (!room) continue;
    rooms[room] = (rooms[room] || 0) + count;
    total += count;
  }
  return { total, rooms, buckets: Object.keys(index || {}).length };
}
