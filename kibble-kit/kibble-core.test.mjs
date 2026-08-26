import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLine, evaluateAttestation, isJobId, nextNonce, parseLine,
  boardWorkStatus, postingBudget, quotesSuccessCondition, selectAttestTargets,
  spendPacing, sweep,
} from "./kibble-core.mjs";

const JOB = "k377f334071";
const ME = "did:key:zMe";
const PEER = "did:key:zPeer";
const WORKER = "did:key:zWorker";

function job(over = {}) {
  return {
    job_id: JOB, status: "delivered", title: "Settle which line came first",
    body: "Success condition: name which of the two lines was written first and give seq and ts for BOTH.",
    result: "Both lines named with seq 1192 and seq 1438 plus timestamps.",
    result_hash: "0123456789abcdef",
    poster_did: PEER, worker_did: WORKER, attestations: [], ...over,
  };
}

test("a pipe in a field cannot forge an extra kibble column", () => {
  const line = buildLine("ATTEST", { jobId: JOB, verdict: "not", reason: "clause | forged | columns" });
  assert.equal(line.split("|").length, 4);
  assert.equal(parseLine(line).verdict, "not");
});

test("useful attestations bind the exact board result hash", () => {
  const line = buildLine("ATTEST", { jobId: JOB, verdict: "useful", resultHash: "0123456789abcdef", reason: "It meets the named condition." });
  assert.deepEqual(parseLine(line), { kind: "ATTEST", jobId: JOB, verdict: "useful", resultHash: "0123456789abcdef", reason: "It meets the named condition." });
  assert.throws(() => buildLine("ATTEST", { jobId: JOB, verdict: "useful", reason: "missing hash" }), /result_hash/u);
});

test("rejects malformed job ids and verdicts", () => {
  assert.ok(isJobId(JOB));
  assert.ok(!isJobId("k377F334071"), "uppercase hex is not a job id");
  assert.throws(() => buildLine("ATTEST", { jobId: "nope", verdict: "useful", reason: "x" }), /valid job_id/u);
  assert.throws(() => buildLine("ATTEST", { jobId: JOB, verdict: "maybe", reason: "x" }), /useful.*not/u);
});

test("sweep strips what Technocore would strip, so the signature stays verifiable", () => {
  const swept = sweep("line with\u0000controls\u200band joiners");
  assert.ok(!/[\u0000\u200b]/u.test(swept));
  assert.throws(() => sweep("\u0000\u200b"), /Nothing visible/u);
  assert.throws(() => sweep("x".repeat(50), 10), /limit/u);
});

test("nonce always advances, even if the clock goes backwards", () => {
  assert.equal(nextNonce({ lastNonce: 0 }, 1787730000000), "1787730000000");
  assert.equal(nextNonce({ lastNonce: 1787730000005 }, 1787730000000), "1787730000006");
});

test("never attests your own job, your own work, or one you already judged", () => {
  const board = { jobs: [
    job(),
    job({ job_id: "k1111111111", poster_did: ME }),
    job({ job_id: "k2222222222", worker_did: ME }),
    job({ job_id: "k3333333333", attestations: [{ did: ME }] }),
    job({ job_id: "k4444444444", status: "attested" }),
  ] };
  assert.deepEqual(selectAttestTargets(board, ME, {}).map((j) => j.job_id), [JOB]);
  assert.equal(selectAttestTargets(board, ME, { attestedJobIds: [JOB] }).length, 0);
});

test("the gate refuses a stamp and accepts a real review", () => {
  const target = job();
  assert.ok(!quotesSuccessCondition("Comprehensive and verifiable result matching task constraints.", target.body));
  assert.ok(quotesSuccessCondition("It names which of the two lines was written first.", target.body));

  const good = evaluateAttestation(JSON.stringify({
    verdict: "useful", confident: true,
    reason: "The clause asks to name which of the two lines was written first and give seq and ts for BOTH; the result supplies seq 1192 and seq 1438 with timestamps.",
  }), target);
  assert.equal(good.ok, true);

  for (const [payload, reason] of [
    ["not json", "unparsable_decision"],
    [JSON.stringify({ verdict: "useful", confident: false, reason: "x".repeat(80) }), "model_not_confident"],
    [JSON.stringify({ verdict: "useful", reason: "Comprehensive and verifiable result matching the stated task constraints here." }), "did_not_quote_success_condition"],
    [JSON.stringify({ verdict: "useful", reason: "It names which of the two lines was written first, see <quote the clause verbatim> for detail." }), "unfilled_template_slot"],
    [JSON.stringify({ verdict: "useful", reason: "It names which of the two lines was written first and mentions the airdrop allocation." }), "unsafe_content"],
  ]) {
    const outcome = evaluateAttestation(payload, target);
    assert.equal(outcome.ok, false, `${reason} must be refused`);
    assert.equal(outcome.reason, reason);
  }
});

test("a truncated reasoning-model reply is refused, not half-parsed", () => {
  assert.equal(evaluateAttestation("<think>still reasoning and never closed", job()).reason, "unparsable_decision");
});

test("budget caps both the hour and the day", () => {
  const now = Date.parse("2026-08-26T12:00:00Z");
  const recent = new Date(now - 60_000).toISOString();
  assert.equal(postingBudget({ postedAt: [recent, recent, recent] }, { maxPostsPerHour: 3, maxPostsPerDay: 12 }, now).allowed, false);
  const older = new Date(now - 2 * 3_600_000).toISOString();
  assert.equal(postingBudget({ postedAt: [older, older, older] }, { maxPostsPerHour: 3, maxPostsPerDay: 12 }, now).dayRemaining, 9);
});

test("adaptive spend pacing preserves a UTC-day reserve", () => {
  const midnight = Date.parse("2026-08-27T00:00:00Z");
  assert.equal(spendPacing({ day: "2026-08-27", vnd: 95 }, 1000, midnight, { nextCostVnd: 5 }).allowed, true);
  assert.equal(spendPacing({ day: "2026-08-27", vnd: 100 }, 1000, midnight, { nextCostVnd: 5 }).allowed, false);
});

test("board work is settled only after the board binds it to this DID", () => {
  const expected = "Both lines named with seq 1192 and seq 1438 plus timestamps.";
  assert.equal(boardWorkStatus({ jobs: [job({ status: "open", worker_did: "" })] }, JOB, ME, "claim").settled, false);
  assert.equal(boardWorkStatus({ jobs: [job({ status: "claimed", worker_did: ME, result: "", result_hash: "" })] }, JOB, ME, "claim").settled, true);
  assert.equal(boardWorkStatus({ jobs: [job({ worker_did: ME, result: expected, result_hash: "0123456789abcdef" })] }, JOB, ME, "result", expected).settled, true);
});
