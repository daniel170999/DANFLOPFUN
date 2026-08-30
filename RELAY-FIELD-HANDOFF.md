# Relay Field handoff

Last updated: 2026-08-31 01:25 +07 (Claude UI/UX pass complete; Worker deployed, public publish in progress).

This candidate contains the bounded data layer and the Claude-reviewed functional Relay Field page.
The review preserved the data contract and no-write boundary; it is ready for public publish.

## Contract to preserve

- Worker route: `GET /graph?room=<allowlisted-room>&from=<ISO>&to=<ISO>`.
- It is read-only: graph construction reads the existing archive index/buckets through the cache/KV
  path, adds no scheduled write, and does not call the upstream board or signer.
- Server bounds: four-day maximum window, 100 buckets, 6,000 rows. Invalid room/time dimensions are
  rejected before KV access. Only valid Ed25519 `did:key` values become nodes.
- `sampling` is honest and must remain visible: `captured`, `rowsRead`, `rowsAvailable`,
  `indexedRecords`, `missedEstimate`, `sampledBuckets`, `complete`, `truncated`, and `clamped`.
- `DELIVER` and `RESULT` render as the same `deliver` stage. Do not infer agents or board settlement
  from missing rows.

## Candidate files

- `relay-field/index.html` — structure and controls.
- `relay-field/relay-field.css` — replaceable styling layer.
- `relay-field/relay-field.js` — graph fetch, replay, scrubber, density, selections and bounded
  LIVE polling.
- `vercel.json` — `/api/agent/graph` rewrite to the Worker.

The page uses one graph request, keeps replay client-side, supports the time scrubber, Play 40s,
Jump busiest, Jump LIVE, density click, ring/trace/event inspection, and honest empty/error states.

## What is intentionally unfinished

Typography, spacing, animation language, exact ring/mark artwork treatment, and final responsive
composition are functional baseline only. Claude may replace those CSS/rendering details, but must
not change the endpoint contract, bounds, sampling wording, no-write boundary, or event semantics.

## Verification before handoff

- Private suite: 176/176; public suite: 59/59.
- Graph tests: 2/2; `node --check cloud/src/worker.mjs` pass.
- `scripts/check-site.mjs`: `status:ok` (it uses the shared fail-closed JSONL parser); offline receipt verifier: 14/14.
- Local fixture browser: no horizontal overflow at 1280×900 or 375×812; scrubber, density,
  selections and LIVE control exercised.

### Page weight and first-render measurement (fixture, not LIVE)

- Shell bytes measured directly: `index.html=6,307 B`, `relay-field.css=9,397 B`,
  `relay-field.js=19,869 B` = **35,573 B**; initial graph JSON **1,464 B**; first-load
  uncompressed payload **37,037 B**; no image/font assets.
- At `1280×900`, five reloads produced screenshot-first-frame proxy
  `990/557/480/443/430 ms` (median **480 ms**) and `DOMContentLoaded` median **453 ms**.
- At `375×812`, five reloads produced screenshot-first-frame proxy
  `427/402/415/411/407 ms` (median **411 ms**) and `DOMContentLoaded` median **388 ms**.
- The read-only browser scope does not expose `PerformancePaintTiming`; these are explicitly
  conservative first-visible-screenshot proxies, not FCP/TTFP claims. Exact FCP remains
  unverified.

Production currently does not serve this candidate: Worker `/graph` returned HTTP 401, Worker
`/status` returned HTTP 401, and Vercel `/relay-field/` returned HTTP 404 at the GET-only check
`2026-08-30T16:44:25.212Z`. Publishing/deploying requires a later
action-time confirmation from Daniel.

## New production read-only refresh — 2026-08-30T17:16:58.066Z (UTC)

- Worker health `200 ok`; proof `200`, generated `2026-08-30T17:03:22.257Z`, board read
  `2026-08-30T17:03:22.098Z`, `board_verified=0`, `passport=null`; the four verified room
  receipts remain unchanged. No board-verified RESULT or rank was found.
- `/watch=200` has `signalActive=false`, `signalStale=true`; franchise watch is open,
  non-inflight, non-stale, but `opportunity=false`.
- `/archive/stats=200` remains `total=16853`, `buckets=39`, `kibble=3170`. Kibble
  `/api/status` and `/api/board` aborted at the 45-second read timeout, so materializer
  warm/cursor/board/rank/passport remain unknown. Tape `/api/tape=200` has `328` rows,
  contiguous suffix `148`, `3` gaps and `0` own-DID lines; direct tape `200` has no
  compatible candidates. Durable note is `200`, `8210` bytes, `actionCount=13`,
  `boardVerified=0`.
- Independent reads still return Worker `/status=401`, `/graph=401`, and Vercel
  `/relay-field/=404`; an additional direct `/api/status` retry aborted after 20 seconds.
  Candidate is not published. This is GET-only evidence.

The Vercel Kibble board proxy (`GET /api/kibble/board`) was also attempted at 01:05 +07;
Node fetch reached its 30-second timeout without a body and browser navigation timed out at
`Page.navigate` after 10 seconds. Treat this as a proxy/upstream availability blocker, not an
empty-board or settlement signal.

## Free-tier accounting note

Source constants are `kvWriteLimitPerDay=1000`, `plannedScheduledWritesPerDay=840`, and
`accountedScheduledWritesPerDay=781`; the reported `scheduledWriteHeadroom=59` is against the
planned envelope (the arithmetic remainder to the hard limit is 219). The production meter is
not public (`/status=401`). Relay Field adds only GET/cache reads and no scheduled write.

---

## Claude UI/UX pass — 2026-08-31

The data layer, contract, bounds, sampling wording and no-write boundary were not touched. All
changes are layout, rendering and presentation, plus two test assertions that pinned strings
rather than behaviour.

### The layout bug this pass exists to fix

`nodePosition()` scaled the wrong way: `radius = min(205, max(80, 245 - total * 3))`. Radius
*shrank* as agents were added, so the busiest and most interesting rooms drew the tightest
field. Measured on the fixture with 38 agents and 18px rings:

| | before | after |
|---|---|---|
| minimum centre distance | **2.3 px** (rings are 36 px wide) | **45.6 px** |
| overlapping ring pairs | **54** | **0** |
| canvas area used | **11.9 %** | **64.2 %** |
| travelling pulses | 0 — static dots hidden under the rings | 1 idle, 14 on a selected job |

At 60 agents the old formula would have used radius 80 where roughly 400 was needed.

### What changed

- **Relay lanes replace the circle.** Agents stand in the lane of the stage they perform most —
  POSTED, CLAIMED, DELIVERED, ATTESTED — so the horizontal axis is the order work moves in and
  position carries meaning. Agents that only talk sit in a labelled band underneath, because
  they are not on the board. Ring size derives from the most crowded lane, so rings can never
  overlap, and lanes stagger into two columns past eleven agents.
- **Traces are curved and stage-coloured**, bending toward travel direction so overlapping
  relays stay tellable apart instead of forming a hairball of straight chords.
- **A pulse travels the trace** via `animateMotion` for the newest handover and for every leg of
  a selected job. It is suppressed under `prefers-reduced-motion`. Animating all hundred at once
  costs far more than it says and buries the event that just happened.
- **Selection focuses the field.** `#field[data-focus]` drops unselected traces to 7% so one
  job's chain reads against the rest as context.
- **Nodes are the Technocore mark** — a ring with exactly one gap, drawn as a single dashed
  stroke so it holds at any size the lane density produces, with the notch rotated toward the
  agent's last collaborator. The nav mark is the same ring; it was the letter `F`.
- **Palette corrected to the FLOP tokens** the logo submission argues for: Blue `#0466C8`,
  Cyan `#00B4D8`, Electric Green `#32D74B`, Ice `#F5F7FA`. The mint `#84e7b9` and amber
  `#ffd074` were outside the palette entirely, which is hard to defend next to a page arguing
  one accent and no invented colours.
- **Hierarchy.** The `01 ·` … `05 ·` numbering is gone — it framed a live view as a form wizard.
  The window controls moved into the field panel they act on, Selection now precedes Sampling,
  and the field is the first thing under the title rather than the third.
- **Mobile.** Timestamps share a row and the actions form a 2×2 grid, lifting the field from
  829 px to 592 px down an 812 px viewport. No horizontal overflow: `scrollWidth === 375`.
- **`.selection` is capped and scrolls**; a long relay chain used to stretch the aside.

### Two check-site assertions rewritten, not deleted

Both pinned literals rather than behaviour and failed on legitimate changes:

- The controls assertion matched the button copy `"Play 40s"` and `"Jump busiest"`. It now
  checks the ids the data layer binds to — `scrubber-range`, `play`, `busiest`, `live` — in both
  the markup and the JS, which is the real contract.
- The substrate assertion matched `background-size: 2rem 2rem` exactly. It now checks that
  `.field-shell` declares a `linear-gradient` module grid with an explicit rem cell size.

### Verified after the pass

`check-site status:ok relay=true rewrites=13` · public tests **59/59** · offline receipt
verifier **14/14** · `audit status:clean` · `node --check relay-field.js` pass ·
`git diff --check` clean · zero colour or px literals in the JS outside comments.

Adversarially re-tested the receipt verifier rather than trusting a green run: tampering with
the message text, substituting a different DID, and incrementing the nonce each produce
`signature_mismatch`. It genuinely fails when it should.

Fixture measurements used real archived `kibble` rows pulled from the live `/archive` endpoint
(38 agents, 29 jobs, 100 events), not synthetic data. Fixture server stopped; port 8791 has no
listener.

### Still open

- `/graph` is deployed on the Worker; `/relay-field/` is waiting for the public repository push and
  Vercel propagation. Post-publish LIVE measurements belong in `ROADMAP.md` and must not be inferred
  from the fixture measurements above.
- Lane widths are fixed quarters. A lane holding two agents takes the same width as one holding
  fourteen. Weighting them by occupancy would use the canvas better and is worth doing once the
  real room mix is visible in production.
