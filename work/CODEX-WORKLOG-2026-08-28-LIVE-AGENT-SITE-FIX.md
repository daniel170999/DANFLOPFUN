# Live Agent site proof fix — 2026-08-28

## Scope

- Fix the DANFLOPFUN Relay evidence UI before any Observatory/MVP or public promotion work.
- Local source and verification only. No deploy, X interaction, signed write, or Worker configuration change.

## Starting state

- Repo: `DANFLOPFUN`
- Branch: `main`
- Baseline: `8f8c39f`, clean and aligned with `origin/main`
- Canonical site route: `/relay/`; root `index.html` remains its synchronized legacy source.

## Root causes in site scope

1. Worker publishes a 14-action Kibble proof view; Relay rejected any action list longer than 10.
2. Relay fetched only `/lobby` but labelled that bounded read as general recent-room coverage.

## Increment history

1. Added a release-gate regression that executes the real inline `noteValue` and `parseKibbleEnvelope` functions in a VM context.
   - RED: a valid 14-action fixture failed with `The Kibble action list is invalid.`
   - GREEN: parser accepts 14, retains a hard upper bound of 40, and still verifies actions individually downstream.
2. Added release assertions for accurate lobby-only wording.
   - RED: `RECENT LOBBY LINE` was absent.
   - GREEN: root and `/relay/` now say lobby/window everywhere the data source is lobby-only.

## Verification so far

- `node scripts/check-site.mjs`: pass after each GREEN increment.
- `node --test agent-pulse/pulse.test.mjs`: 10/10 pass.
- `node --test kibble-kit/archive.test.mjs kibble-kit/kibble-core.test.mjs kibble-kit/presence.test.mjs kibble-kit/watch.test.mjs`: 40/40 pass.
- `node scripts/audit-public.mjs --history`: current tree has no sensitive finding; the 10 reported notices are unchanged historical provider-choice wording.
- `git diff --check`: exit 0; only Git's existing LF-to-CRLF working-copy notices were printed.
- Local browser QA used a temporary loopback-only proxy and current public evidence; the server was stopped after the checks.
- Live Agent result: `VERIFIED PROOF`, `5 signed room receipts verified locally`, `6/6 sources answered`, and no current passport row.
- Responsive checks at 320, 768, 1024, and 1440 px reported no horizontal document overflow.
- Desktop and narrow-viewport console check: no warnings or errors.

## Handoff

- Diff reviewed: only the synchronized Relay sources, release-gate regression, and this local worklog changed.
- Daniel confirmed commit/push after a fresh Cloudflare Free-plan check.
- Official 2026-08-28 limits checked: Workers Free has 100,000 requests/day and 10 ms CPU/invocation; KV Free has 100,000 reads/day and 1,000 writes/day, resetting at 00:00 UTC.
- Current Worker remains on cron `*/20` (72 scheduled invocations/day) with a planned 480 KV writes/day envelope, unchanged active version `47b5bbe7-636e-43bb-a5b3-23b9dfcaa4cc`, and live HTTP 200 for `/healthz` and `/proof`.
- This site-only change adds no request path and touches no Worker source or configuration. Pushing `main` triggers Vercel only.
- The 480-write figure remains a source planning envelope, not a complete-UTC-day Cloudflare dashboard measurement.
- The separate Worker issue where an oversized Technocore note update is not surfaced remains out of this site-only slice.

## Superseding Relay semantics checkpoint — 2026-08-29 05:50 +07:00 (local only)

- Root cause: the deployed Relay showed a valid DID signature and legacy room read-back as
  `VERIFIED PROOF`, even though `receipt.verified` was false and Kibble had no passport/rank.
- The synchronized `index.html` and `relay/index.html` now verify each Worker action signature,
  distinguish current receipts, legacy read-backs, pending actions and invalid actions, and require
  an exact direct Kibble-card match (DID, delivered text and result hash) before board acceptance.
- Proof-note publication is displayed as delivery only, never as scored work. The primary chip can
  now say `BOARD-ACCEPTED RESULT`, `CURRENT ROOM RECEIPT`, `HISTORICAL READ-BACK`, or pending;
  it cannot turn a legacy row into a green result.
- Regression tests cover false legacy receipts, true current receipts, canonical RESULT lines and
  a matching/non-matching direct board card.
- Fresh checks: `node scripts/check-site.mjs` PASS; combined site suite PASS 50/50;
  `git diff --check` PASS; canonical source sync PASS; public audit credential-clean.
- Vercel is still serving the old UI at this timestamp. Worker `/proof` remains an old materialized
  record with only legacy rows and `passport:null`; Kibble reports `stats_engine_warm:false`.
  No live useful RESULT, franchise, passport or rank is claimed.

## Production UI hardening checkpoint — 2026-08-29 16:40 +07:00 (local source)

- Synchronized `index.html` and `relay/index.html`: Live Agent message grid/cards now allow
  shrinking tracks (`min-width: 0`) so narrow screens do not overflow horizontally.
- Kibble board reads in both refresh paths now fail fast after 12 seconds instead of leaving the
  page waiting behind a slow upstream response; the UI still labels timeout as unavailable rather
  than converting it into proof.
- `node scripts/check-site.mjs`: PASS; `node scripts/audit-public.mjs --history`: current tree
  credentials-clean with the same historical provider-choice notices. Changes are ready for the
  authorized `main` push and Vercel production verification.
