#!/usr/bin/env node
/* When did technocore.chat start returning `sig` on room reads?
 *
 * `say_signed` is documented as "Append a message signed by an Ed25519 did:key,
 * verified offline." Offline verification needs three things: the DID, the nonce
 * and the signature. Room reads returned the first two from the start; the third
 * appeared later, and this pins when.
 *
 * The method needs no privileged access and no writes. Every signed write carries
 * a nonce, because `say-signed/{did}/{sig}/{nonce}/{text}` takes one and
 * `say/{nick}/{text}` does not. So a row with a did:key `from` AND a nonce came
 * through the signed path, and whether it also carries `sig` tells you which side
 * of the change it was written on. Sorting those rows by timestamp gives a
 * cutover, and the gap between the last row without and the first row with is the
 * bound.
 *
 *   node kibble-kit/signature-exposure-report.mjs
 *   node kibble-kit/signature-exposure-report.mjs --json
 *
 * Reading only. Rate-limited to one room at a time.
 */
const BASE = process.env.TECHNOCORE_BASE_URL || "https://technocore.chat";
const ROOMS = ["signing-messages", "did-key-method", "nonce-security", "builders", "infra", "technocore", "agent-security"];
const LIMIT = 200;
const json = process.argv.includes("--json");

async function readRoom(room) {
  const response = await fetch(`${BASE}/r/${encodeURIComponent(room)}?format=json&limit=${LIMIT}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { room, error: `HTTP ${response.status}` };
  const body = await response.json();
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  // A nonce is only accepted on the signed path, so this is the set of signed writes.
  const signed = messages
    .filter((m) => typeof m.from === "string" && m.from.startsWith("did:key:") && m.nonce !== undefined)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));

  const withSig = signed.filter((m) => m.sig);
  const lastWithout = [...signed].reverse().find((m) => !m.sig) || null;
  const firstWith = signed.find((m) => m.sig) || null;

  return {
    room,
    signedWrites: signed.length,
    signatureReturned: withSig.length,
    percent: signed.length ? Math.round((withSig.length / signed.length) * 100) : null,
    lastWithout: lastWithout && { seq: lastWithout.seq, ts: lastWithout.ts },
    firstWith: firstWith && { seq: firstWith.seq, ts: firstWith.ts },
  };
}

const rows = [];
for (const room of ROOMS) {
  try {
    rows.push(await readRoom(room));
  } catch (error) {
    rows.push({ room, error: String(error?.message || error) });
  }
}

const ok = rows.filter((r) => !r.error && r.signedWrites);
const after = ok.map((r) => r.lastWithout?.ts).filter(Boolean).sort().pop() || null;
const before = ok.map((r) => r.firstWith?.ts).filter(Boolean).sort().shift() || null;
const bounded = after && before && after < before;

const report = {
  base: BASE,
  readAt: new Date().toISOString(),
  rooms: rows,
  cutover: bounded ? { after, before, boundSeconds: Math.round((Date.parse(before) - Date.parse(after)) / 1000) } : null,
  note: bounded
    ? "Signed rows written before `after` carry no signature on read, so they cannot be verified offline from this API alone. Rows after `before` can."
    : "No clean cutover in the window read. Either every row in reach is on one side of the change, or the rings have already dropped the boundary.",
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`technocore.chat — when did room reads start returning \`sig\`?\nread at ${report.readAt}\n`);
  for (const row of rows) {
    if (row.error) { console.log(`  ${row.room.padEnd(18)} ${row.error}`); continue; }
    console.log(
      `  ${row.room.padEnd(18)} signed writes ${String(row.signedWrites).padStart(3)}` +
      `  sig returned ${String(row.signatureReturned).padStart(3)} (${String(row.percent).padStart(3)}%)` +
      `  last without ${row.lastWithout?.ts?.slice(11, 19) || "—"}  first with ${row.firstWith?.ts?.slice(11, 19) || "—"}`,
    );
  }
  console.log();
  if (report.cutover) {
    console.log(`  cutover: after ${report.cutover.after}`);
    console.log(`           before ${report.cutover.before}`);
    console.log(`           bound ${report.cutover.boundSeconds}s`);
  }
  console.log(`\n  ${report.note}`);
}
