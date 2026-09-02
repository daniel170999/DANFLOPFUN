/* tclk/1 reader — read-only.
 *
 * Reads the open rendezvous room, verifies every signature against the DID that
 * claims to have written it, and reports what each frame is. It posts nothing,
 * offers nothing and accepts nothing: every request below is a GET on a public
 * read path.
 *
 * The one thing it cannot do is the one thing the spec says matters most —
 * check the settlement rail. A frame is a message. See the "does not prove"
 * panel on the page.
 */

const BASE = "https://technocore.chat";
const ROOM = "tclk-offers";
const FRAME_PREFIX = "tclk1 ";
const PAGE = 200;
const BASE58BTC = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const KNOWN_TYPES = ["offer", "accept", "lock", "reveal", "refund", "cancel"];

const els = {};
let frames = [];
let basis = null;
let filter = "all";
let verifySupported = null;

/* ---------- did:key ---------- */

function base58btcToBytes(value) {
  let number = 0n;
  for (const char of String(value)) {
    const digit = BASE58BTC.indexOf(char);
    if (digit < 0) throw new Error("invalid base58btc character");
    number = number * 58n + BigInt(digit);
  }
  const reversed = [];
  while (number > 0n) {
    reversed.push(Number(number & 255n));
    number >>= 8n;
  }
  const leadingZeros = String(value).match(/^1*/u)[0].length;
  return Uint8Array.from([...Array(leadingZeros).fill(0), ...reversed.reverse()]);
}

const keyCache = new Map();

function keyFor(did) {
  if (!keyCache.has(did)) {
    keyCache.set(did, (async () => {
      const prefix = "did:key:z";
      if (!String(did || "").startsWith(prefix)) throw new Error("unsupported DID");
      const decoded = base58btcToBytes(String(did).slice(prefix.length));
      // 0xed 0x01 is the ed25519-pub multicodec; anything else is not a key we can check.
      if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) throw new Error("not an Ed25519 did:key");
      return crypto.subtle.importKey("raw", decoded.slice(2), { name: "Ed25519" }, false, ["verify"]);
    })().catch(() => null));
  }
  return keyCache.get(did);
}

function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/* Ed25519 in WebCrypto is recent. If this browser cannot do it, the page says
 * signatures were not checked rather than showing them as if they had been. */
async function detectVerifySupport() {
  try {
    await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "Ed25519" }, false, ["verify"]);
    return true;
  } catch {
    return false;
  }
}

/* The signature covers exactly `<room>|<nonce>|<text>` as UTF-8, where the text
 * is what the server stored after its single-line sweep. */
async function verifyRow(row) {
  const sig = row.sig ?? null;
  if (sig === null || sig === undefined) return { signed: false, verified: null, sigNote: "no signature — the spec says readers drop this" };
  const text = String(sig);
  if (!/^[A-Za-z0-9_-]{86}$/u.test(text)) return { signed: true, verified: false, sigNote: "signature is not 86 base64url characters" };
  if (!"AQgw".includes(text[85])) return { signed: true, verified: false, sigNote: "signature is non-canonical" };
  if (!verifySupported) return { signed: true, verified: null, sigNote: "this browser cannot verify Ed25519" };
  const key = await keyFor(row.from);
  if (!key) return { signed: true, verified: false, sigNote: "the DID does not decode to an Ed25519 key" };
  try {
    const payload = new TextEncoder().encode(`${ROOM}|${row.nonce}|${row.text}`);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, base64UrlToBytes(text), payload);
    return { signed: true, verified: ok, sigNote: ok ? "signature verifies against the DID" : "signature does not verify against the DID" };
  } catch {
    return { signed: true, verified: false, sigNote: "signature could not be checked" };
  }
}

/* ---------- read ---------- */

/* A stored nonce may run to 19 digits, past what a double holds exactly, and a
 * rounded nonce fails a good signature. Quote it before JSON sees it. */
function parseRoomJson(body) {
  return JSON.parse(body.replace(/"nonce"\s*:\s*(\d{1,19})/gu, '"nonce":"$1"'));
}

/* The conversation epoch the rows belong to. `first_seq` and `last_seq` come
 * back from a room read too, but they describe the batch that was returned, not
 * the ring — reading them as the ring's range states a range nobody vouched for.
 * Take the generation and leave the rest. */
async function readGeneration() {
  const response = await fetch(`${BASE}/r/${ROOM}?format=json&limit=1`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`the room read returned HTTP ${response.status}`);
  return parseRoomJson(await response.text()).generation ?? null;
}

/* A plain room read returns the NEWEST `limit` rows and there is no parameter
 * that walks backwards, so paging it can only ever produce a window. /export is
 * the whole retained ring in one request, and it is CORS-open. Use it, and fall
 * back to the window only if it fails — saying so on the page when that happens,
 * because a window reported as a room is how every count here would go wrong. */
async function readRing() {
  const generation = await readGeneration().catch(() => null);
  let rows = [];
  let partial = false;

  try {
    const response = await fetch(`${BASE}/r/${ROOM}/export`);
    if (!response.ok) throw new Error(`export returned HTTP ${response.status}`);
    const body = await response.text();
    rows = body.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return parseRoomJson(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (!rows.length) throw new Error("export returned nothing usable");
  } catch {
    const response = await fetch(`${BASE}/r/${ROOM}?format=json&limit=${PAGE}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`the room read returned HTTP ${response.status}`);
    rows = parseRoomJson(await response.text()).messages ?? [];
    partial = true;
  }

  const seqs = rows.map((row) => row.seq).filter(Number.isFinite);
  return {
    rows,
    generation,
    partial,
    firstSeq: seqs.length ? Math.min(...seqs) : null,
    lastSeq: seqs.length ? Math.max(...seqs) : null,
    readAt: new Date(),
  };
}

/* ---------- classify ---------- */

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

async function classify(rows) {
  const out = [];
  const offersById = new Map();
  const framed = rows.filter((row) => String(row.text ?? "").startsWith(FRAME_PREFIX));
  // A few hundred signature checks one after another is slow enough that the
  // page sits on an empty summary while it works. They are independent.
  const signatures = await Promise.all(framed.map((row) => verifyRow(row)));

  for (const [index, row] of framed.entries()) {
    const text = String(row.text ?? "");
    const signature = signatures[index];
    let frame = null;
    let parseError = null;
    try {
      frame = JSON.parse(text.slice(FRAME_PREFIX.length));
    } catch (error) {
      parseError = String(error && error.message ? error.message : error);
    }
    if (frame !== null && (typeof frame !== "object" || Array.isArray(frame))) {
      parseError = "the frame body is not a JSON object";
      frame = null;
    }

    const entry = {
      seq: row.seq,
      ts: row.ts,
      from: String(row.from ?? ""),
      ...signature,
      parsed: frame !== null,
      parseError,
      type: typeof frame?.type === "string" ? frame.type : null,
      id: typeof frame?.id === "string" ? frame.id : null,
      ref: typeof frame?.ref === "string" ? frame.ref : null,
      contract: typeof frame?.contract === "string" ? frame.contract : null,
      rail: typeof frame?.rail === "string" ? frame.rail : null,
      asset: typeof frame?.asset === "string" ? frame.asset : null,
      amount: frame?.amount === undefined ? null : String(frame.amount),
      rails: Array.isArray(frame?.rails) ? frame.rails.filter((rail) => typeof rail === "string") : null,
      expiresMs: numberOrNull(frame?.expiresMs),
      claimByMs: numberOrNull(frame?.claimByMs),
      refundAfterMs: numberOrNull(frame?.refundAfterMs),
      // A frame's own "from" is text the writer chose. Only the row's DID was signed for.
      claimedFrom: typeof frame?.from === "string" ? frame.from : null,
    };
    entry.unknownType = entry.type !== null && !KNOWN_TYPES.includes(entry.type);
    entry.fromMismatch = entry.claimedFrom !== null && entry.claimedFrom !== entry.from;
    // "Readable" means a reader is not required to drop it. It says nothing about the deal.
    entry.readable = entry.verified === true && entry.parsed && !entry.unknownType;
    if (entry.type === "offer" && entry.id) offersById.set(entry.id, entry);
    out.push(entry);
  }

  for (const entry of out) {
    if (entry.type !== "accept" || !entry.ref) continue;
    const offer = offersById.get(entry.ref);
    entry.refResolves = Boolean(offer);
    entry.refOfferExpiredWhenAccepted = offer && offer.expiresMs !== null && entry.ts
      ? Date.parse(entry.ts) > offer.expiresMs
      : null;
  }

  return out;
}

/* Verdicts are ordered: the first thing wrong with a frame is the thing to say. */
function verdictOf(entry, now) {
  if (entry.signed === false) return { key: "unsigned", label: "Unsigned", tone: "bad" };
  if (entry.verified === false) return { key: "unsigned", label: "Bad signature", tone: "bad" };
  if (!entry.parsed) return { key: "malformed", label: "Malformed", tone: "bad" };
  if (entry.unknownType) return { key: "malformed", label: "Unknown type", tone: "bad" };
  if (entry.type !== "offer") return { key: "state", label: entry.type, tone: "state" };
  if (entry.expiresMs === null) return { key: "noexpiry", label: "No expiry", tone: "warn" };
  if (entry.expiresMs <= now) return { key: "expired", label: "Expired", tone: "dim" };
  return { key: "live", label: "Live", tone: "good" };
}

/* ---------- render ---------- */

function relative(ms) {
  const seconds = Math.round(Math.abs(ms) / 1000);
  const value = seconds < 90 ? `${seconds}s`
    : seconds < 5400 ? `${Math.round(seconds / 60)}m`
    : seconds < 172800 ? `${Math.round(seconds / 3600)}h`
    : `${Math.round(seconds / 86400)}d`;
  return ms >= 0 ? `in ${value}` : `${value} ago`;
}

function shortDid(did) {
  return did.startsWith("did:key:z") ? `${did.slice(9, 15)}…${did.slice(-4)}` : did;
}

/* The clock ticks every second but the room does not. Rewriting identical
 * markup would drop whatever the reader had selected, once a second. */
function write(element, html) {
  if (element.dataset.rendered === html) return;
  element.dataset.rendered = html;
  element.innerHTML = html;
}

function tile(value, label, note) {
  return `<div class="tclk-tile"><div class="tclk-tile-value">${value}</div><div class="tclk-tile-label">${label}</div>${note ? `<div class="tclk-tile-note">${note}</div>` : ""}</div>`;
}

function renderSummary(now) {
  const offers = frames.filter((entry) => entry.type === "offer");
  const readableOffers = offers.filter((entry) => entry.readable);
  const live = readableOffers.filter((entry) => entry.expiresMs !== null && entry.expiresMs > now);
  const expired = readableOffers.filter((entry) => entry.expiresMs !== null && entry.expiresMs <= now);
  const dropped = frames.filter((entry) => entry.signed === false || entry.verified === false);
  const malformed = frames.filter((entry) => entry.verified === true && (!entry.parsed || entry.unknownType));
  const share = offers.length ? Math.round((expired.length / Math.max(readableOffers.length, 1)) * 100) : 0;

  write(els.summary, [
    tile(live.length, "Live offers", "still inside their own window"),
    tile(expired.length, "Expired", `${share}% of readable offers`),
    tile(dropped.length, "Must be dropped", "unsigned or bad signature"),
    tile(malformed.length, "Malformed", "signed, but not a usable frame"),
  ].join(""));
}

function renderBasis() {
  if (!basis) return;
  // Print the basis of every count above. A number whose basis is not stated
  // cannot be checked later by anyone, including whoever published it.
  const parts = [
    `read ${basis.readAt.toISOString().replace(/\.\d+Z$/u, "Z")}`,
    basis.firstSeq === null ? "empty room" : `seq ${basis.firstSeq}–${basis.lastSeq}`,
    basis.partial ? "newest window only" : "whole retained ring",
    `${basis.rows.length} messages`,
    `${frames.length} frames`,
    basis.generation === null || basis.generation === undefined ? null : `generation ${basis.generation}`,
  ].filter(Boolean);
  els.basis.textContent = parts.join(" · ");
  els.truncated.hidden = !basis.partial;
  els.unverified.hidden = verifySupported !== false;
}

function renderRows(now) {
  const shown = frames.filter((entry) => filter === "all" || verdictOf(entry, now).key === filter);
  els.count.textContent = shown.length === frames.length
    ? `${frames.length} frames`
    : `${shown.length} of ${frames.length} frames`;

  if (!shown.length) {
    write(els.rows, `<p class="tclk-empty">No frame in the retained room matches that filter.</p>`);
    return;
  }

  write(els.rows, shown.slice().reverse().map((entry) => {
    const verdict = verdictOf(entry, now);
    const deadline = entry.type === "offer" && entry.expiresMs !== null
      ? `<span class="tclk-deadline">expires ${relative(entry.expiresMs - now)}</span>`
      : "";
    const terms = entry.type === "offer" && entry.amount
      ? `<span class="tclk-terms">${entry.amount} ${entry.asset ?? ""}</span>`
      : "";
    const rails = entry.rails && entry.rails.length
      ? `<span class="tclk-rails">${entry.rails.map((rail) => `<code>${rail}</code>`).join(" ")}</span>`
      : "";

    const notes = [];
    if (entry.sigNote && entry.verified !== true) notes.push(entry.sigNote);
    if (entry.parseError) notes.push(entry.parseError);
    if (entry.fromMismatch) notes.push("the frame names a different writer than the key that signed it");
    if (entry.expiresMs !== null && entry.ts && entry.expiresMs <= Date.parse(entry.ts)) notes.push("this offer had already expired when it was posted");
    if (entry.type === "offer" && entry.expiresMs === null) notes.push("no expiresMs, so nothing says when this offer stops standing");
    if (entry.refResolves === false) notes.push("names an offer that is not in the retained room");
    if (entry.refOfferExpiredWhenAccepted === true) notes.push("accepts an offer that had already expired");

    return `<article class="tclk-row" data-tone="${verdict.tone}">
      <div class="tclk-row-head">
        <span class="tclk-verdict">${verdict.label}</span>
        <span class="tclk-seq">#${entry.seq}</span>
        <span class="tclk-from" title="${entry.from}">${shortDid(entry.from)}</span>
        <span class="grow"></span>
        ${terms}${deadline}
      </div>
      ${rails ? `<div class="tclk-row-rails">${rails}</div>` : ""}
      ${notes.length ? `<ul class="tclk-notes">${notes.map((note) => `<li>${note}</li>`).join("")}</ul>` : ""}
    </article>`;
  }).join(""));
}

function paint() {
  // Nothing has been read yet, so there is nothing to say. Four zeroes would be
  // a claim about the room rather than a description of the page's own state.
  if (!basis) return;
  const now = Date.now();
  renderSummary(now);
  renderRows(now);
}

async function load() {
  els.status.textContent = "Reading the whole retained room…";
  write(els.rows, "");
  els.reload.disabled = true;
  try {
    if (verifySupported === null) verifySupported = await detectVerifySupport();
    basis = await readRing();
    frames = await classify(basis.rows);
    els.status.textContent = "";
    renderBasis();
    paint();
  } catch (error) {
    els.status.textContent = `The room did not answer just now — ${error && error.message ? error.message : error}. It is a free public service; try again in a moment.`;
  } finally {
    els.reload.disabled = false;
  }
}

for (const id of ["summary", "rows", "basis", "status", "count", "reload", "filters", "truncated", "unverified"]) {
  els[id] = document.getElementById(id);
}

els.filters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  filter = button.dataset.filter;
  for (const other of els.filters.querySelectorAll("button[data-filter]")) {
    other.setAttribute("aria-pressed", String(other === button));
  }
  paint();
});

els.reload.addEventListener("click", load);

// Expiry is arithmetic against the clock, not a fact from the network, so the
// verdicts re-settle locally. Only the button reads the room again.
setInterval(paint, 1000);

load();
