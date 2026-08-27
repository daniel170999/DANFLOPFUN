import assert from "node:assert/strict";
import test from "node:test";

import { WATCH_TARGETS, compareTarget, interestingRooms, readTarget, summariseWatch } from "./watch-core.mjs";

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
  assert.deepEqual(readTarget(json, { status: 200, body: "<html>maintenance</html>" }), { value: "" });
  assert.deepEqual(readTarget(json, { status: 200, body: '{"version":"0.10.0"}' }), { value: "0.10.0" });
  assert.deepEqual(readTarget(status, { status: 404, body: "nope" }), { status: 404 });
  assert.deepEqual(readTarget(keywords, { status: 200, body: "Join the TESTNET now" }), { found: ["testnet"] });
});

test("only genuinely new, launch-shaped room names are surfaced", () => {
  const rooms = [{ room: "lobby" }, { room: "flop-testnet" }, { room: "faucet-queue" }, { room: "kibble" }];
  assert.deepEqual(interestingRooms(rooms, []), ["flop-testnet", "faucet-queue"]);
  assert.deepEqual(interestingRooms(rooms, ["flop-testnet"]), ["faucet-queue"], "an already-seen room must not re-alert");
  assert.deepEqual(interestingRooms([], []), []);
  assert.deepEqual(interestingRooms(null, []), []);
});

test("a launch outranks a version bump in the summary", () => {
  assert.equal(summariseWatch([]).level, "quiet");
  assert.equal(summariseWatch([{ severity: "notable", note: "a" }]).level, "notable");
  const mixed = summariseWatch([{ severity: "notable", note: "bump" }, { severity: "launch", note: "faucet live" }]);
  assert.equal(mixed.level, "launch");
  assert.match(mixed.headline, /faucet live/u);
});
