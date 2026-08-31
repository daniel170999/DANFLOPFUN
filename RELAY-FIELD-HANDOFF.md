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

---

## Claude pass 2 — 2026-08-31, after the bucket-cap raise

Raising `FREE_TIER_SAFE_ARCHIVE_BUCKET_RECORDS` 50 → 1,200 was the right call and the parse
measurement supporting it was the right way to make it. Live `/graph?room=kibble` now returns
**3,100 of 3,770 indexed rows (82.2%)**, 390 agents, and **388 job chains with more than one
stage** — against 12 before. That is the page's whole reason to exist, so this mattered.

It also broke the layout, in my code, in the same place twice.

### The floor was the bug

`radius = Math.max(6.5, Math.min(19, …))`. When the geometry needed a radius below 6.5 the
clamp raised it back up, which guarantees collision. Measured live at 348 agents: radius 6.5,
minimum centre distance **7.22px**, **252 overlapping pairs**.

A lower bound on ring size inside a fixed canvas is a promise the geometry cannot keep. Removed.

### Grid packing replaces it

Each lane is now packed as a grid inside its own box, and one radius is chosen as the largest
that lets the worst-packed box hold its agents:

```
r ≈ sqrt(boxWidth * boxHeight / count) / 2.3, then stepped down until columns * rows >= count
```

Verified headless before touching the browser, worst case with every agent in one lane:

| agents | radius | min centre | needed | overlaps |
|---|---|---|---|---|
| 10 | 19.00 | 43.70 | 38.0 | 0 |
| 43 | 15.91 | 36.60 | 31.8 | 0 |
| 120 | 9.52 | 21.91 | 19.0 | 0 |
| 348 | 5.59 | 12.86 | 11.2 | 0 |
| 700 | 3.94 | 9.07 | 7.9 | 0 |
| 1500 | 2.69 | 6.20 | 5.4 | 0 |

Live, at 390 agents and 1,655 traces: radius 9.86, minimum centre **22.68** against 19.72
needed, **0 overlaps**, every ring inside the canvas. Same at 375px wide.

### The page now lands on the timelapse, not on its last frame

With four days resolved, arriving at the finished state showed 390 rings and 1,655 traces at
once — a wall, not work moving. The page now plays on first load, so the field builds itself
from 27 August. That is the reference video's actual experience and the one thing a four-second
live window cannot reproduce. `prefers-reduced-motion` goes straight to the end state; Pause is
one click.

### Verified

`check-site status:ok` · public **59/59** · receipt verifier **14/14** · `audit clean` ·
`node --check` pass · render **4.5 ms/frame** at 390 nodes · mobile `scrollWidth === 375`,
0 overflow, 0 overlaps · zero colour or px literals in the JS outside comments.

`relay-field/relay-field.js` is modified and uncommitted.

### Still open

Lane widths are still fixed quarters, so a lane holding three agents is as wide as one holding
two hundred. At this density that is now visible and worth weighting by occupancy.

---

## Site unification — 2026-08-31 (Claude, built)

The three pages carried three lockups, three link sets and three names for the same
destination; `/` redirected to the competition entry, and the signed receipts appeared in no
navigation at all. That is fixed structurally rather than page by page.

### Design system

`assets/relay-nav.css` — shared shell only. `assets/relay.css` imports it and adds the full
system. Token names, component anatomy, radius scale, focus-ring treatment and motion curve
follow **shadcn/ui**; the values are FLOP's palette.

It is plain CSS, not React, on purpose. shadcn/ui needs React + Tailwind + a bundler; this site
is static HTML, and the Worker rewrites, the inline field-kit application and `check-site.mjs`
are all built around that. Porting to React would rewrite the whole site and every test without
making a single page look better — shadcn's value here is its design decisions, not its
runtime. The full React migration remains available as its own decision; nothing here blocks it.

`relay-nav.css` deliberately carries no reset, no `body` rule and no heading sizes, so it drops
onto the logo submission and the field kit without restyling anything they built. A check
enforces that.

### The mark

The header now carries the **official FLOP Chip**, fetched from
`flop.finance/assets/flop-chip-favicon.svg` and stored unmodified at
`assets/brand/flop-chip-favicon.svg` (2,131 bytes, provenance comment intact). Its path data
matches the copy already embedded in the logo submission **byte for byte** — verified, 1,367
characters, identical. Every page credits FLOP Labs by name and links the source; `check-site`
asserts the rendered path matches the official geometry so an approximation cannot creep in.

### Structure

| | before | after |
|---|---|---|
| front door | `/` → 307 → `/technocore/` | `/` is a real home page |
| lockups | 3 different, one a letter `F` in a box | 1, the official Chip |
| nav sets | 5 / 2 / 7 items | 5 destinations, identical everywhere |
| the receipts | in no navigation | `/proof/`, generated from the real 14 |
| root `index.html` | stale duplicate of `/relay/`, 0 unique ids, unreachable behind both redirects | removed (recoverable via `git show HEAD:index.html`) |

Current page is marked by the Chip's own notch, so the nav needs no second accent colour.

### Alignment

Measured at 1440×900: every `.shell` on the home page resolves to **one** left edge, x=73, nav
through footer — `shellLeftEdges: [73]`. The three "start here" cards are equal height (281px)
on a 4px spacing scale. Same single axis on `/proof/`.

### Relay Field

Rebuilt as a map: full-bleed canvas, floating panels (search + room + capture bar, layer
toggles with live counts, inspector), zoom/pan with pointer capture and ctrl-wheel, an overview
minimap, and a transport bar with the density track, scrubber and 1×/4×/20× speed.

All 25 ids the data layer binds to survive the rewrite — checked mechanically, not by eye. The
map controls are bolted on through a `MutationObserver` and drive presentation attributes only,
so nothing here can change what the page claims about the archive.

Panels initially covered the POSTED and ATTESTED lanes. The field is now inset to the clear
channel between them above 1240px; measured `anyLabelUnderPanel: false`, lanes at 410–992
inside a channel of 320–1075.

### Assertions rewritten, not deleted

Seven per-page navigation assertions pinned one page's private markup each. They are replaced
by one guard that every page carries a **byte-identical** shell, marks itself current, shows the
official Chip path, credits FLOP Labs and loads the shared stylesheet and behaviour — stronger
than what it replaced, and the thing that was actually broken. The routing assertions that
pinned the old redirects now assert the front door is not redirected away. The root-vs-`/relay/`
copy-parity check was removed with its reason: it compared the root against the kit because the
root *was* a copy of the kit, so with the duplicate gone it would only compare `/relay/` with
itself.

### Verified

`check-site status:ok pages:5 shell:identical` · public tests **59/59** · offline receipt
verifier **14/14** · `audit clean` · `node --check` on both scripts · `git diff --check` clean ·
zero colour literals in either script · `scrollWidth === 375` with **0** overflowing elements at
phone width on every page.

### Not done

- `/relay/` (the field kit) keeps its own typography and its 176KB inline application. It wears
  the shared shell but has not been rebuilt on the design system.
- The one-click DID generator on the kit is the existing implementation; the mockup's version
  was not built.

---

## Second UI pass — 2026-08-31 (Claude, built)

Scored 6.5/10 on six specific complaints. Each one measured, then fixed.

**1 · The menu disappeared.** It was 12px mono in muted-foreground on a transparent bar —
technically fine, read as decoration. Now: 13px at weight 500 in a recessed segmented group,
current page as a filled cyan pill with the Chip's notch beneath it, and a pulsing
**LIVE · AGENT RUNNING** chip in the shell on every page. Nav height 60 → 68px.

**2 · Cards underlined every word.** `a:hover { text-decoration: underline }` applied to the
whole-card anchors, so hovering a card underlined its heading, its label and its paragraph.
Measured after: `textDecorationLine: "none"` on both the card and its paragraph. Card heights
equal at 281/281/281; every `.shell` still resolves to the single axis x=73.

**3 · The Kit demanded a passphrase before it would make a DID.** The passphrase encrypts the
local backup only — `crypto.subtle.generateKey` runs regardless — so the friction was
presentational. It now offers **Suggest a strong passphrase**, which fills and reveals a
20-character value from `crypto.getRandomValues` so the field is one click, not a decision. The
deliberate `pkcs8.fill(0)` wipe immediately after encryption is untouched: making the key
extractable for later backup would have removed a real protection to save a click, and that
trade was not worth taking.

**4 · No motion.** Added, all of it tied to something real and all of it off under
`prefers-reduced-motion`: an aurora keyed to the accent, entrance choreography across the hero,
counters that animate to the number already in the markup, traces that flow in the direction
work moves, rings that breathe out of phase, an instrument scan across the panel, section rules
that draw themselves in, button sweep and arrow travel, lit card edges instead of colour swaps.

**5 · "Is there no live version?"** There was — behind a grey button called *Live*. It now
carries the success colour, a pulsing dot and a `data-live` state, and the shell chip says the
agent is running from every page.

**6 · The transport button was clipped.** `relay-field.js` wrote `Play 40s` into a 44px fixed
control. Measured after: 46×46, `playClipped: false`, `collidesWithLayers: false`; the run
length moved to the accessible name. The status line had also been pushed to the top where it
ran through the lane labels — moved to the clear bottom channel, `labelsHit: 0`.

### A number that had started lying

The daily receipts workflow appended four rows, so `proof/receipts.jsonl` held **18** while both
pages said fourteen in eight places. Both are now derived from the file — the proof page
regenerates wholesale, the home page from the same count — so it cannot drift again. Codex's
mobile-overflow fix (`b6e3a66`) was folded into the generator so a regeneration cannot drop it.

### New: `scripts/sync-shell.mjs`

`check-site` asserts every page carries a byte-identical shell, which catches drift but cannot
fix it. Adding the LIVE chip to one page immediately failed that assertion — as designed. This
script pushes the canonical shell from the front page onto the other four; `--write` applies,
bare reports and exits non-zero on drift.

### Verified

`check-site status:ok pages:5 shell:identical receipts:18` · `sync-shell inSync:true` ·
public tests **59/59** · verifier **18/18** · `audit clean` · `node --check` on both scripts ·
`git diff --check` clean · zero occurrences of the stale count.

### Still not done

`/relay/` is the original 176KB inline application wearing the shared shell. Its passphrase
friction is fixed and its navigation matches, but its internals have not been rebuilt on the
design system. That is the largest remaining gap between this site and the ones it is being
compared to.

---

## Field Kit skin — 2026-08-31 (Claude, built)

The last gap: `/relay/` wore the shared shell but its internals still looked like a different
website. Measured against the rest of the site, that was five specific things:

| | site | kit before |
|---|---|---|
| corner radius | 2px | **11 distinct values**, up to 16px and 999px pills |
| body face | Space Grotesk | **Inter** |
| mono face | Space Mono, FLOP's brand face | SFMono / Consolas |
| green | Electric Green `#32D74B` | `#84e7b9` mint, off-palette |
| amber | not in the palette | `#ffd074`, not in the palette |
| surfaces | `#060B1B` / `#0A1128` | `#0e1b3d` / `#132247`, lighter and bluer |

### Skinned, not rewritten

The kit is 91KB of inline application across 120 bound element ids and 269 layout-bearing CSS
rules. Rewriting that markup to change how it looks would have risked the application for a
visual result, which is the wrong trade. `relay/relay-kit.css` loads **after** the page's own
stylesheet and re-skins it: the 269 layout rules are inherited untouched, and the kit's own
token names are remapped to the design system's values, so every inherited rule resolves to the
right colour on its own.

Component anatomy is matched for the parts that carry the visual weight — buttons, tabs, inputs,
status chips, surfaces, the topbar — plus the hero entrance and card hover from the system.

Measured after: `distinctRadii: ["2px", "50%"]` across the whole page, down from eleven values;
`bodyFont: "Space Grotesk"`, `h1Font: "Chakra Petch"`, mono `"Space Mono"`; the active tab is the
same cyan pill as the navigation.

### The application is provably intact

Diffed against `HEAD`: **zero element ids lost**, one gained (`passphrase-suggest`), and the only
inline-JS change is the 860-byte handler for it. `check-site` still reports `kitIds:120`,
`kitInlineScripts:2`, and every parser, tab, panel and lobby-wording assertion passes unchanged.

### Verified

`check-site status:ok pages:5 shell:identical receipts:18` · `sync-shell inSync:true` ·
tests **59/59** · verifier **18/18** · `audit clean` · `node --check` both scripts ·
`git diff --check` clean · no horizontal overflow at 1440 or 375.

---

## Next directions, built — 2026-08-31 (Claude)

### The brain was never broken — the question picker was

Three reply lanes exist (`archive`, `official_docs`, `room`) and Codex's §3 work shipped. In the
24 hours to 14:00Z the model was consulted and declined every time:

```
room / verified            5   all provider: deterministic_official_fact
room / weak_protocol_match 4
official_docs / model_not_confident  3
archive / unfilled_template_slot     2
```

The cause is one character. `isAnswerableQuestion` treated a bare `?` as a question mark, and a
bare `?` appears inside every query string an agent quotes — so
`GET /r/<room>?since=<seq>` was selected as a question and handed to the lanes to answer.
They were rejecting their own output because they were being asked to answer statements.

Measured across **1,200 live room messages**: 17 selections, of which **6 were declarative
`[Protocol Insight]` posts**. Requiring the question mark to end a clause removes exactly those
six and keeps all eleven real questions. Two regression tests added; suite is 61/61.

One expectation of mine was wrong and the code was right: `How do I verify a signed receipt
without holding the private key?` is correctly rejected, because `private key` is on the secrets
filter. That filter is deliberate and stays.

### `/data/` — the archive as documented infrastructure

Nobody else has four days of Technocore history, and until now `/graph` was a private endpoint
for one page. It is now documented: what each field means, the bounds, copy-paste `curl` and
browser snippets, a live response fetched on load, and three cards stating plainly what it does
**not** claim — that it is a sample, that it proves server observation rather than signature
validity, and that no agent is ever invented.

**Not at `/api/`.** Vercel treats a root `api/` directory as Serverless Functions with no opt-out
in this project's config, and a static page there is not worth gambling a live route on.

### `/agents/` — a profile for any did:key

Paste a DID, or arrive from a ring on the map. Shows what it posted, which jobs it touched, who
it handed work to, and when it was first and last seen — read from the same public endpoint, so
the page can never show a number the API does not serve. Peers link to each other, so the graph
is walkable.

Verified against real data rather than by eye: a key showing "no handovers" was checked and its
job chains genuinely contain one DID each in that window, while the busiest key resolves 39
peers. The logic is right and the empty state is honest.

### The navigation stayed at five

Both are secondary destinations reached from the footer and from the map. `sync-shell.mjs` now
carries a `.footer-links` element as part of the shell, so they propagate with it; `check-site`
asserts the two pages wear the identical shell, do **not** claim a current destination, and are
linked from every page — an unreachable page is just an orphan file.

`scripts/build-pages.mjs` regenerates both from the canonical shell.

### Verified

`check-site status:ok` · `sync-shell inSync:true` · tests **61/61** · verifier **18/18** ·
`audit clean` · `node --check` on all three scripts · `git diff --check` clean · all seven
routes 200 · no horizontal overflow at 1440 or 375 on either new page.

### Also in this change

`assets/social/relay-field.gif` — 900×440, 64 frames, looping, drawn from the same `/graph`
document rather than screen-recorded, so every ring is a key that actually posted.
