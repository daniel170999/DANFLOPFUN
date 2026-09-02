// Read-only measurement of the tclk-offers room.
// Reads the whole retained ring via /export, verifies every signature
// against did:key, and classifies each tclk1 frame. Writes nothing anywhere.
//
//   node tclk/tclk-measure.mjs [--room tclk-offers] [--out tclk-<ts>.json]

const BASE = "https://technocore.chat";
const BASE58BTC = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const FRAME_PREFIX = "tclk1 ";
const KNOWN_TYPES = new Set(["offer", "accept", "lock", "reveal", "refund", "cancel"]);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function base58btcToBytes(value) {
  const text = String(value || "");
  if (!text) throw new Error("empty base58btc value");
  let number = 0n;
  for (const char of text) {
    const digit = BASE58BTC.indexOf(char);
    if (digit < 0) throw new Error("invalid base58btc character");
    number = number * 58n + BigInt(digit);
  }
  const reversed = [];
  while (number > 0n) {
    reversed.push(Number(number & 255n));
    number >>= 8n;
  }
  const leadingZeros = text.match(/^1*/u)?.[0].length || 0;
  return Uint8Array.from([...Array(leadingZeros).fill(0), ...reversed.reverse()]);
}

async function publicKeyFromDid(did) {
  const prefix = "did:key:z";
  if (!String(did || "").startsWith(prefix)) throw new Error("unsupported DID");
  const decoded = base58btcToBytes(String(did).slice(prefix.length));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) throw new Error("not an Ed25519 did:key");
  return crypto.subtle.importKey("raw", decoded.slice(2), { name: "Ed25519" }, false, ["verify"]);
}

const keyCache = new Map();
function keyFor(did) {
  if (!keyCache.has(did)) keyCache.set(did, publicKeyFromDid(did).catch(() => null));
  return keyCache.get(did);
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;
  return Uint8Array.from(Buffer.from(padded, "base64"));
}

// The signature covers exactly `<room>|<nonce>|<text>` as UTF-8 (llms.txt SIGNING).
async function verifyRow(roomName, row) {
  const sig = row.sig ?? row.signature ?? null;
  if (sig === null || sig === undefined) return { signed: false, verified: null, sigReason: "no sig field" };
  const text = String(sig);
  if (!/^[A-Za-z0-9_-]{86}$/u.test(text)) return { signed: true, verified: false, sigReason: "malformed sig" };
  if (!"AQgw".includes(text[85])) return { signed: true, verified: false, sigReason: "non-canonical sig" };
  const key = await keyFor(row.from);
  if (!key) return { signed: true, verified: false, sigReason: "undecodable did" };
  const payload = new TextEncoder().encode(`${roomName}|${row.rawNonce}|${row.text}`);
  try {
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, base64UrlToBytes(text), payload);
    return { signed: true, verified: ok, sigReason: ok ? null : "signature does not verify" };
  } catch (error) {
    return { signed: true, verified: false, sigReason: String(error?.message || error) };
  }
}

const room = arg("room", "tclk-offers");
const readAt = new Date();
const now = readAt.getTime();

// /export is the byte-exact retained ring; ?limit= only ever shows a window.
// A 503 here once returned a body that parsed as one junk line and summarised
// as all-zeros, which reads like an empty room. Fail loudly instead.
async function fetchExport(attempts = 4) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/r/${room}/export`, { signal: AbortSignal.timeout(90000) });
      const body = await response.text();
      if (response.ok) return { body, generation: response.headers.get("X-Room-Generation"), attempt };
      last = `${response.status} ${response.statusText}: ${body.slice(0, 200)}`;
    } catch (error) {
      // A timeout or a dropped connection throws rather than returning a
      // response, so catching only bad statuses lets exactly those escape.
      last = String(error?.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
  throw new Error(`export failed after ${attempts} attempts — ${last}`);
}

const { body: jsonl, generation, attempt: exportAttempt } = await fetchExport();

const rows = [];
for (const line of jsonl.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  // Keep the nonce as exact digits: a >2^53 nonce rounds under JSON.parse and
  // then no good signature verifies (llms.txt EXPORT re-verifier caveat).
  const rawNonce = trimmed.match(/"nonce"\s*:\s*(\d{1,19})/u)?.[1] ?? null;
  try {
    const parsed = JSON.parse(trimmed);
    rows.push({ ...parsed, rawNonce: rawNonce ?? String(parsed.nonce ?? "") });
  } catch {
    rows.push({ __unparsable: trimmed.slice(0, 200) });
  }
}

const frames = [];
const nonFrames = [];
const offersById = new Map();

for (const row of rows) {
  if (row.__unparsable) continue;
  const text = String(row.text ?? "");
  if (!text.startsWith(FRAME_PREFIX)) { nonFrames.push(row); continue; }

  const signature = await verifyRow(room, row);
  const body = text.slice(FRAME_PREFIX.length);
  let frame = null;
  let parseError = null;
  try { frame = JSON.parse(body); } catch (error) { parseError = String(error?.message || error); }
  if (frame !== null && (typeof frame !== "object" || Array.isArray(frame))) {
    parseError = "frame body is not a JSON object";
    frame = null;
  }

  const entry = {
    seq: row.seq,
    ts: row.ts,
    from: row.from,
    ...signature,
    parsed: frame !== null,
    parseError,
    type: typeof frame?.type === "string" ? frame.type : null,
    id: typeof frame?.id === "string" ? frame.id : null,
    ref: typeof frame?.ref === "string" ? frame.ref : null,
    contract: typeof frame?.contract === "string" ? frame.contract : null,
    // A frame's own "from" is caller-chosen text; only row.from was signed for.
    fromMatchesSigner: typeof frame?.from === "string" ? frame.from === row.from : null,
    expiresMs: Number.isFinite(frame?.expiresMs) ? frame.expiresMs : null,
    claimByMs: Number.isFinite(frame?.claimByMs) ? frame.claimByMs : null,
    refundAfterMs: Number.isFinite(frame?.refundAfterMs) ? frame.refundAfterMs : null,
    asset: frame?.asset ?? null,
    amount: frame?.amount ?? null,
    rails: Array.isArray(frame?.rails) ? frame.rails : null,
  };
  entry.unknownType = entry.type !== null && !KNOWN_TYPES.has(entry.type);
  // Only a frame a reader must not drop counts as usable (spec: readers drop unsigned).
  entry.usable = entry.verified === true && entry.parsed === true && !entry.unknownType;
  if (entry.type === "offer") {
    entry.live = entry.expiresMs === null ? null : entry.expiresMs > now;
    // expires <= claimBy <= refundAfter is the ordering the spec timeline implies.
    entry.deadlinesOrdered = entry.expiresMs !== null && entry.claimByMs !== null && entry.refundAfterMs !== null
      ? entry.expiresMs <= entry.claimByMs && entry.claimByMs <= entry.refundAfterMs
      : null;
    if (entry.id) offersById.set(entry.id, entry);
  }
  frames.push(entry);
}

for (const entry of frames) {
  if (entry.type !== "accept" || !entry.ref) continue;
  const offer = offersById.get(entry.ref);
  entry.refResolves = Boolean(offer);
  entry.refOfferUsable = offer ? offer.usable : null;
  // An accept landing after the offer it names had already expired.
  entry.refOfferAlreadyExpired = offer && offer.expiresMs !== null && entry.ts
    ? Date.parse(entry.ts) > offer.expiresMs
    : null;
}

const count = (predicate) => frames.filter(predicate).length;
const byType = {};
for (const entry of frames) {
  const key = entry.type ?? (entry.parsed ? "(no type)" : "(unparsable)");
  byType[key] = (byType[key] || 0) + 1;
}

const offers = frames.filter((entry) => entry.type === "offer");
const usableOffers = offers.filter((entry) => entry.usable);
const accepts = frames.filter((entry) => entry.type === "accept");
const seqs = rows.filter((row) => Number.isFinite(row.seq)).map((row) => row.seq);

const summary = {
  room,
  readAt: readAt.toISOString(),
  source: `${BASE}/r/${room}/export`,
  generation,
  exportAttempt,
  ringMessages: rows.length,
  firstSeq: seqs.length ? Math.min(...seqs) : null,
  lastSeq: seqs.length ? Math.max(...seqs) : null,
  unparsableLines: rows.filter((row) => row.__unparsable).length,
  nonFrameMessages: nonFrames.length,
  frames: frames.length,
  signature: {
    signedAndVerified: count((entry) => entry.verified === true),
    signedButFailed: count((entry) => entry.signed && entry.verified === false),
    unsigned: count((entry) => entry.signed === false),
  },
  malformedJson: count((entry) => !entry.parsed),
  unknownType: count((entry) => entry.unknownType),
  usableFrames: count((entry) => entry.usable),
  fromFieldMismatch: count((entry) => entry.fromMatchesSigner === false),
  byType,
  // live/expired/noExpiry are counted over USABLE offers only, and so is the
  // page. An unsigned frame is one a reader must drop; calling it "expired" as
  // well puts the same row in two buckets and makes the two tools disagree on
  // one number, which is the exact failure this repository keeps finding.
  offers: {
    total: offers.length,
    usable: usableOffers.length,
    live: usableOffers.filter((entry) => entry.live === true).length,
    expired: usableOffers.filter((entry) => entry.live === false).length,
    noExpiry: usableOffers.filter((entry) => entry.live === null).length,
    droppedBeforeCounting: offers.length - usableOffers.length,
    deadlinesOutOfOrder: usableOffers.filter((entry) => entry.deadlinesOrdered === false).length,
  },
  accepts: {
    total: accepts.length,
    usable: accepts.filter((entry) => entry.usable).length,
    withRef: accepts.filter((entry) => entry.ref).length,
    refResolvesInRing: accepts.filter((entry) => entry.refResolves).length,
    refMissingFromRing: accepts.filter((entry) => entry.ref && !entry.refResolves).length,
    refOfferAlreadyExpired: accepts.filter((entry) => entry.refOfferAlreadyExpired === true).length,
  },
  distinctSigners: new Set(frames.filter((entry) => entry.verified === true).map((entry) => entry.from)).size,
};

const outPath = arg("out", null);
if (outPath) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outPath, JSON.stringify({ summary, frames }, null, 1));
}
console.log(JSON.stringify(summary, null, 1));
