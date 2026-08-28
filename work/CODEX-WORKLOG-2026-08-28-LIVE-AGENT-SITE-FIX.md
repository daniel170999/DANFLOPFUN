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
