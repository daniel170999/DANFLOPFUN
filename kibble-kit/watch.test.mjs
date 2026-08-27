import assert from "node:assert/strict";
import test from "node:test";

import { WATCH_TARGETS, compareTarget, interestingRooms, readRoomListing, readTarget, signalView, summariseWatch } from "./watch-core.mjs";

const status = WATCH_TARGETS.find((t) => t.id === "faucet");
const json = WATCH_TARGETS.find((t) => t.id === "agent-json");
const keywords = WATCH_TARGETS.find((t) => t.id === "flop-finance");

test("a 404 becoming live is a launch signal; an outage is not", () => {
  assert.equal(compareTarget(status, { status: 404 }, { status: 200 }).severity, "launch");
  assert.equal(compareTarget(status, { status: 404 }, { status: 302 }).severity, "launch");
  // The endpoint flapping to an error must never be reported as a launch, or the one alert
  // that matters gets buried under outages.
  assert.equal(compareTarget(status, { status: 200 }, { status: 503 }).changed, false);
  assert.equal(compareTarget(status, { status: 404 }, { status: 404 }).changed, false);
  assert.equal(compareTarget(status, { status: 404 }, { status: 500 }).changed, false);
});

test("the first observation only records a baseline", () => {
  assert.equal(compareTarget(status, null, { status: 404 }).changed, false);
  assert.equal(compareTarget(json, undefined, { value: "0.10.0" }).changed, false);
  assert.equal(compareTarget(keywords, null, { found: ["testnet"] }).changed, false);
});

test("a protocol version bump is notable, not a launch", () => {
  const moved = compareTarget(json, { value: "0.9.5" }, { value: "0.10.0" });
  assert.equal(moved.changed, true);
  assert.equal(moved.severity, "notable", "shipping code is a hint, not the opening bell");
  assert.equal(compareTarget(json, { value: "0.10.0" }, { value: "0.10.0" }).changed, false);
  // A failed parse reads as empty and must not look like a downgrade.
  assert.equal(compareTarget(json, { value: "0.10.0" }, { value: "" }).changed, false);
});

test("a new keyword on the official site is a launch signal, and only new ones fire", () => {
  const fired = compareTarget(keywords, { found: ["technocore"] }, { found: ["faucet", "technocore", "testnet"] });
  assert.equal(fired.severity, "launch");
  assert.match(fired.note, /faucet/u);
  assert.match(fired.note, /testnet/u);
  assert.equal(compareTarget(keywords, { found: ["testnet"] }, { found: ["testnet"] }).changed, false);
  assert.equal(compareTarget(keywords, { found: ["testnet"] }, { found: [] }).changed, false, "a word disappearing is not a launch");
});

test("readTarget survives a body that is not what it expected", () => {
  assert.deepEqual(readTarget(json, { status: 200, body: "<html>maintenance</html>" }), { available: false });
  assert.deepEqual(readTarget(json, { status: 200, body: '{"version":"0.10.0"}' }), { value: "0.10.0" });
  assert.deepEqual(readTarget(status, { status: 404, body: "nope" }), { status: 404 });
  assert.deepEqual(readTarget(keywords, { status: 200, body: "Join the TESTNET now" }), { found: ["testnet"] });
});

test("an outage cannot become a JSON or keyword launch signal", () => {
  assert.deepEqual(readTarget(json, { status: 503, body: '{"version":"99.0.0"}' }), { available: false });
  assert.deepEqual(readTarget(keywords, { status: 502, body: "testnet faucet claim" }), { available: false });
  assert.equal(compareTarget(json, { value: "0.10.0" }, { available: false }).changed, false);
  assert.equal(compareTarget(keywords, { found: ["technocore"] }, { available: false }).changed, false);
});

test("only genuinely new, launch-shaped room names are surfaced", () => {
  const rooms = [{ room: "lobby" }, { room: "flop-testnet" }, { room: "faucet-queue" }, { room: "kibble" }];
  assert.deepEqual(interestingRooms(rooms, []), ["flop-testnet", "faucet-queue"]);
  assert.deepEqual(interestingRooms(rooms, ["flop-testnet"]), ["faucet-queue"], "an already-seen room must not re-alert");
  assert.deepEqual(interestingRooms([], []), []);
  assert.deepEqual(interestingRooms(null, []), []);
});

test("an unseeded room listing never fires, however many rooms match", () => {
  const rooms = [{ room: "gpu-miners" }, { room: "flop-testnet" }, { room: "validators" }];
  assert.deepEqual(interestingRooms(rooms, [], false), [], "nothing is new until one listing has succeeded");
  assert.deepEqual(interestingRooms(rooms, [], true).sort(), ["flop-testnet", "gpu-miners", "validators"]);
  assert.deepEqual(interestingRooms(rooms, ["gpu-miners", "validators"], true), ["flop-testnet"]);
});

test("only a successful, parseable room listing can seed the baseline", () => {
  const rooms = [{ room: "gpu-miners" }, { room: "flop-testnet" }];
  assert.deepEqual(readRoomListing({ status: 503, body: JSON.stringify({ rooms }) }), { available: false });
  assert.deepEqual(readRoomListing({ status: 200, body: "maintenance" }), { available: false });
  assert.deepEqual(readRoomListing({ status: 200, body: JSON.stringify({}) }), { available: false });
  assert.deepEqual(readRoomListing({ status: 200, body: JSON.stringify({ rooms }) }), { available: true, rooms });
});

test("a launch outranks a version bump in the summary", () => {
  assert.equal(summariseWatch([]).level, "quiet");
  assert.equal(summariseWatch([{ severity: "notable", note: "a" }]).level, "notable");
  const mixed = summariseWatch([{ severity: "notable", note: "bump" }, { severity: "launch", note: "faucet live" }]);
  assert.equal(mixed.level, "launch");
  assert.match(mixed.headline, /faucet live/u);
});

test("a signal goes stale once a later check is quiet", () => {
  const fired = { at: "2026-08-27T11:20:06Z", level: "launch", headline: "new rooms: gpu-miners" };
  const sameCheck = signalView(fired, "2026-08-27T11:20:06Z");
  assert.equal(sameCheck.active, true);
  assert.equal(sameCheck.stale, false);
  const laterQuiet = signalView(fired, "2026-08-27T11:50:00Z");
  assert.equal(laterQuiet.active, false);
  assert.equal(laterQuiet.stale, true);
  assert.equal(laterQuiet.lastSignal.headline, fired.headline);
  assert.deepEqual(signalView(null, "2026-08-27T11:50:00Z"), { active: false, lastSignal: null });
  assert.equal(signalView(fired, "not-a-date").active, false);
});
