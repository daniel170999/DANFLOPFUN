import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveHasSufficientEvidence, archiveNoCoverageText, archiveQueryUrl, archiveStats,
  classifyArchiveQuestion, detectGap, evaluateArchiveReply, groupByDay, highestSeq, isSigned,
  mergeBucket, queryRecords, selectArchivable, selectArchiveEvidence,
} from "./archive-core.mjs";

const DID = "did:key:z6MkvYvgdk7s98SZNRUd41J6JLxStTQDw3tKvrY2TiuSshnp";
const OTHER = "did:key:z6MknDn3CH7vumHw5rXREhdQN5KjsSp2RWi4aUHusBDRVoRz";

test("only did:key-signed lines are archived", () => {
  // An unsigned line proves nothing: anyone can write as any nick, so storing it would fill
  // the budget with records that cannot support a single claim.
  assert.ok(isSigned({ from: DID }));
  assert.ok(!isSigned({ from: "~flop-agent" }));
  assert.ok(!isSigned({ from: "unknown" }));
  assert.ok(!isSigned({}));

  const messages = [
    { seq: 10, from: DID, text: "signed", ts: "2026-08-27T10:00:00Z", nonce: "1" },
    { seq: 11, from: "~spam", text: "gm", ts: "2026-08-27T10:00:01Z" },
    { seq: 12, from: OTHER, text: "also signed", ts: "2026-08-27T10:00:02Z", nonce: "2" },
  ];
  const picked = selectArchivable("kibble", messages, -1);
  assert.deepEqual(picked.map((r) => r.seq), [10, 12]);
  assert.equal(picked[0].room, "kibble");
  assert.equal(picked[0].nonce, "1");
});

test("the cursor prevents re-archiving what is already stored", () => {
  const messages = [
    { seq: 10, from: DID, text: "old", ts: "2026-08-27T10:00:00Z" },
    { seq: 20, from: DID, text: "new", ts: "2026-08-27T10:00:05Z" },
  ];
  assert.deepEqual(selectArchivable("kibble", messages, 10).map((r) => r.seq), [20]);
  assert.deepEqual(selectArchivable("kibble", messages, 20).map((r) => r.seq), []);
  assert.equal(highestSeq(messages, -1), 20);
  assert.equal(highestSeq([], 7), 7, "an empty read must not rewind the cursor");
});

test("a gap in the ring is recorded, never silently skipped", () => {
  // Absence-of-record and absence-of-event must stay distinguishable, or the archive is
  // worse than no archive: a reader would conclude nothing happened.
  assert.deepEqual(detectGap(500, 100), { from: 101, to: 499, missed: 399 });
  assert.equal(detectGap(101, 100), null, "contiguous is not a gap");
  assert.equal(detectGap(50, -1), null, "the first ever read cannot have a gap");
  assert.equal(detectGap(undefined, 100), null);
});

test("records are bucketed by room and UTC day", () => {
  const rows = [
    { room: "kibble", seq: 1, ts: "2026-08-27T23:59:00Z" },
    { room: "kibble", seq: 2, ts: "2026-08-28T00:01:00Z" },
    { room: "infra", seq: 3, ts: "2026-08-27T12:00:00Z" },
  ];
  const buckets = groupByDay(rows);
  assert.equal(buckets.size, 3);
  assert.ok(buckets.has("arch:kibble:2026-08-27"));
  assert.ok(buckets.has("arch:kibble:2026-08-28"));
  assert.ok(buckets.has("arch:infra:2026-08-27"));
});

test("merging is idempotent and keeps sequence order", () => {
  const first = mergeBucket([], [{ seq: 3 }, { seq: 1 }]);
  assert.deepEqual(first.map((r) => r.seq), [1, 3]);
  const again = mergeBucket(first, [{ seq: 1 }, { seq: 2 }]);
  assert.deepEqual(again.map((r) => r.seq), [1, 2, 3], "a replayed poll must not duplicate rows");
  const capped = mergeBucket([], Array.from({ length: 20 }, (_, i) => ({ seq: i })), 5);
  assert.deepEqual(capped.map((r) => r.seq), [15, 16, 17, 18, 19], "the cap keeps the newest");
});

test("queries filter by DID, range and text", () => {
  const rows = [
    { seq: 10, did: DID, text: "ring buffer retention" },
    { seq: 20, did: OTHER, text: "nonce replay" },
    { seq: 30, did: DID, text: "signed receipt" },
  ];
  assert.deepEqual(queryRecords(rows, { did: DID }).map((r) => r.seq), [10, 30]);
  assert.deepEqual(queryRecords(rows, { from: 20 }).map((r) => r.seq), [20, 30]);
  assert.deepEqual(queryRecords(rows, { from: 15, to: 25 }).map((r) => r.seq), [20]);
  assert.deepEqual(queryRecords(rows, { contains: "NONCE" }).map((r) => r.seq), [20], "text search is case-insensitive");
  assert.equal(queryRecords(rows, { limit: 1 }).length, 1);
  assert.equal(queryRecords(rows, {}).length, 3);
  assert.equal(queryRecords(null, {}).length, 0);
});

test("stats roll buckets up per room", () => {
  const stats = archiveStats({ "arch:kibble:2026-08-27": 5, "arch:kibble:2026-08-28": 3, "arch:infra:2026-08-27": 2 });
  assert.equal(stats.total, 10);
  assert.equal(stats.rooms.kibble, 8);
  assert.equal(stats.rooms.infra, 2);
  assert.equal(stats.buckets, 3);
  assert.deepEqual(archiveStats(null), { total: 0, rooms: {}, buckets: 0 });
});

test("an absent range bound does not silently become zero", () => {
  // Number(null) is 0 and Number.isFinite(0) is true, so a missing `to` once coerced into
  // to=0 and filtered out every record: the archive held 200 rows and returned none.
  const rows = [{ seq: 10, did: DID, text: "a" }, { seq: 20, did: DID, text: "b" }];
  assert.equal(queryRecords(rows, { from: null, to: null }).length, 2);
  assert.equal(queryRecords(rows, { from: undefined, to: undefined }).length, 2);
  assert.equal(queryRecords(rows, { from: "", to: "" }).length, 2);
  assert.equal(queryRecords(rows, { did: null, contains: null }).length, 2, "an absent filter must not exclude");
  // A real zero is still honoured.
  assert.equal(queryRecords(rows, { to: 0 }).length, 0);
  assert.equal(queryRecords(rows, { from: 0 }).length, 2);
  assert.equal(queryRecords(rows, { to: "nonsense" }).length, 2, "an unparsable bound is ignored, not applied");
});

test("classifies only concrete history questions", () => {
  const question = classifyArchiveQuestion({ text: 'Which came first: "signed receipt" or "nonce replay"? Check seq 120 and seq 121.' });
  assert.equal(question.kind, "ordering");
  assert.deepEqual(question.targetSeqs, [120, 121]);
  assert.equal(classifyArchiveQuestion({ text: "What happened after seq 120?" }), null);
  assert.equal(classifyArchiveQuestion({ text: "What is Technocore and how do I join?" }), null);
  assert.equal(classifyArchiveQuestion({ text: "Where can I paste my private key to recover the lost receipt?" }), null);
});

test("selects only archive records that the question points at", () => {
  const rows = [
    { room: "kibble", seq: 120, ts: "2026-08-27T10:00:00.000Z", nonce: "10", text: "signed receipt" },
    { room: "kibble", seq: 121, ts: "2026-08-27T10:00:01.000Z", nonce: "11", text: "nonce replay" },
    { room: "kibble", seq: 122, ts: "2026-08-27T10:00:02.000Z", nonce: "12", text: "unrelated" },
  ];
  const classification = classifyArchiveQuestion({ text: 'Which came first: "signed receipt" or "nonce replay"? Check seq 120 and seq 121.' });
  assert.deepEqual(selectArchiveEvidence(rows, classification).map((row) => row.seq), [120, 121]);
  assert.equal(archiveHasSufficientEvidence(rows, classification), true);
  assert.equal(archiveHasSufficientEvidence(rows.slice(0, 1), classification), false);
});

test("archive reply gate requires exact evidence and the archive URL", () => {
  const classification = classifyArchiveQuestion({ text: 'Which came first: "signed receipt" or "nonce replay"? Check seq 120 and seq 121.' });
  const records = [
    { room: "kibble", seq: 120, ts: "2026-08-27T10:00:00.000Z", nonce: "10", text: "signed receipt" },
    { room: "kibble", seq: 121, ts: "2026-08-27T10:00:01.000Z", nonce: "11", text: "nonce replay" },
  ];
  const url = archiveQueryUrl("https://agent.example", "kibble", classification);
  const answer = JSON.stringify({ answer: `seq 120 at 2026-08-27T10:00:00.000Z came before seq 121 at 2026-08-27T10:00:01.000Z. The signed records are ordered by the server sequence; check the archive evidence here: ${url}`, confident: true });
  assert.equal(evaluateArchiveReply(answer, { room: "kibble", classification, records, queryUrl: url }).ok, true);
  assert.equal(evaluateArchiveReply(answer.replace("seq 121", "seq 999"), { room: "kibble", classification, records, queryUrl: url }).ok, false);
  assert.equal(evaluateArchiveReply(answer.replace(url, "https://example.com"), { room: "kibble", classification, records, queryUrl: url }).ok, false);
  assert.match(archiveNoCoverageText("kibble", url), /only started on 2026-08-27/u);
});
