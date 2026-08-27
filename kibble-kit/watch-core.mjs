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
  if (target.kind === "json") {
    try {
      const parsed = JSON.parse(response.body);
      return { value: String(parsed?.[target.pick] ?? "") };
    } catch {
      return { value: "" };
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

export function interestingRooms(rooms, known = []) {
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
