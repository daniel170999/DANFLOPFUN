// Launch watch: detect the moment the FLOP testnet actually opens.
//
// Why this exists. Hayes has said allocation is determined by testnet activity, and the
// FLOP thread says the testnet runs about ninety days with public source. As of 2026-08-27
// it does not exist: technocore.chat v0.10.0 serves no /faucet and no /testnet, and
// flop.finance does not mention either word. Whoever is running on day one ends with ninety
// days of history; whoever notices in week three ends with sixty-something. Missing the
// opening is the one loss in this project that cannot be recovered later.
//
// Deliberately dumb: fetch a few public surfaces, compare against a stored baseline, and
// shout when something changes. No model calls, so it costs nothing from the daily budget
// and cannot be starved by spend pacing.

export const WATCH_TARGETS = [
  // A version bump is the earliest visible signal that the protocol is shipping. It moved
  // 0.9.5 -> 0.10.0 on 2026-08-27, which is what makes this worth polling at all.
  { id: "agent-json", url: "https://technocore.chat/.well-known/agent.json", kind: "json", pick: "version" },
  // These are 404 today. The day either stops being 404 is the day the window opens.
  { id: "faucet", url: "https://technocore.chat/faucet", kind: "status" },
  { id: "testnet", url: "https://technocore.chat/testnet", kind: "status" },
  // The official site is where an announcement would land first.
  { id: "flop-finance", url: "https://flop.finance/", kind: "keywords", keywords: ["testnet", "faucet", "technocore", "claim", "genesis", "mainnet"] },
];

export function readTarget(target, response) {
  if (target.kind === "status") return { status: response.status };
  const status = Number(response?.status);
  // A JSON or keyword body from a 5xx/redirect error page is not an observation. Keeping the
  // previous baseline is what prevents an outage from becoming a fake version/launch signal.
  if (!Number.isInteger(status) || status < 200 || status >= 300) return { available: false };
  if (target.kind === "json") {
    try {
      const parsed = JSON.parse(response.body);
      return { value: String(parsed?.[target.pick] ?? "") };
    } catch {
      return { available: false };
    }
  }
  if (target.kind === "keywords") {
    const body = String(response.body || "").toLowerCase();
    const found = (target.keywords || []).filter((word) => body.includes(word.toLowerCase()));
    return { found: found.sort() };
  }
  return {};
}

// A change is only interesting in one direction for some targets. A 404 that becomes a 200
// matters; a 200 that flaps to 503 is just an outage and must not fire a launch alert.
export function compareTarget(target, before, after) {
  if (!before) return { changed: false, note: "baseline recorded" };
  if (!after || after.available === false) return { changed: false, note: "observation unavailable" };

  if (target.kind === "status") {
    const was404 = before.status === 404;
    const isLive = after.status >= 200 && after.status < 400;
    if (was404 && isLive) return { changed: true, severity: "launch", note: `${target.id} went from 404 to ${after.status}` };
    return { changed: false };
  }

  if (target.kind === "json") {
    if (before.value && after.value && before.value !== after.value) {
      return { changed: true, severity: "notable", note: `${target.id} ${before.value} -> ${after.value}` };
    }
    return { changed: false };
  }

  if (target.kind === "keywords") {
    const had = new Set(before.found || []);
    const added = (after.found || []).filter((word) => !had.has(word));
    if (added.length) return { changed: true, severity: "launch", note: `${target.id} now mentions ${added.join(", ")}` };
    return { changed: false };
  }

  return { changed: false };
}

// New rooms whose names read like a testnet or a faucet are a second, independent signal:
// the protocol tends to grow a room before it grows a docs page.
const ROOM_HINTS = /(testnet|faucet|genesis|mainnet|validator|miner|claim|epoch|devnet)/iu;

// A room listing is a baseline source, not a normal target. It is valid only when the endpoint
// returned a successful, parseable object with an array of rooms. A 200 maintenance page or an
// error-shaped JSON body must not seed an empty baseline and make every old room look new later.
export function readRoomListing(response) {
  const status = Number(response?.status);
  if (!Number.isInteger(status) || status < 200 || status >= 300) return { available: false };
  try {
    const parsed = JSON.parse(String(response?.body || ""));
    if (!Array.isArray(parsed?.rooms)) return { available: false };
    return { available: true, rooms: parsed.rooms };
  } catch {
    return { available: false };
  }
}

// seeded says whether a room listing has ever been read successfully. A first observation is a
// baseline, not a launch event.
export function interestingRooms(rooms, known = [], seeded = true) {
  if (!seeded) return [];
  const seen = new Set(known);
  return (Array.isArray(rooms) ? rooms : [])
    .map((row) => String(row?.room || row?.name || ""))
    .filter((name) => name && ROOM_HINTS.test(name) && !seen.has(name))
    .slice(0, 12);
}

export function summariseWatch(changes) {
  const launch = changes.filter((row) => row.severity === "launch");
  const notable = changes.filter((row) => row.severity === "notable");
  if (launch.length) return { level: "launch", headline: `LAUNCH SIGNAL: ${launch.map((row) => row.note).join(" | ")}` };
  if (notable.length) return { level: "notable", headline: `changed: ${notable.map((row) => row.note).join(" | ")}` };
  return { level: "quiet", headline: "no change" };
}

// A signal that cannot go stale is not a signal, it is a banner. Keep the history, but say
// plainly whether the most recent successful check still sees it.
export function signalView(lastSignal, checkedAt) {
  if (!lastSignal) return { active: false, lastSignal: null };
  const firedAt = Date.parse(lastSignal.at || "");
  const checked = Date.parse(checkedAt || "");
  const active = Number.isFinite(firedAt) && Number.isFinite(checked) && firedAt >= checked;
  return {
    active,
    lastSignal,
    stale: Boolean(lastSignal) && !active,
  };
}
