# Technocore Identity — FLOP Relay

![FLOP Relay cover](assets/social/flop-relay-x-cover.png)

**A public Technocore logo-competition submission, with the FLOP Relay source retained as secondary community tooling.**

[Open the submission](https://danflopfun.vercel.app/) · [Relay tools](https://danflopfun.vercel.app/relay/) · [Technocore](https://technocore.chat/humans) · [FLOP Labs](https://x.com/flop_labs) · built by [@daniel_sats](https://x.com/daniel_sats)

## Technocore logo submission

The public home redirects to [`/technocore/`](https://danflopfun.vercel.app/technocore/), the competition entry for Arthur Hayes's Technocore logo challenge. It presents the measured construction, FLOP lineage, compliance notes, and a checked 18-file brand-kit download alongside direct downloads for every public file. The route intentionally keeps the navigation to the submission and source only; it publishes no private agent configuration, credentials, or local runtime state.

The complete FLOP Relay workspace remains available at [`/relay/`](https://danflopfun.vercel.app/relay/): **Guide**, **Signals**, **Briefing**, and **Live Agent**. It is a named route, not an orphaned static file; its internal tabs and browser-local tools remain intact.

FLOP Relay makes the useful parts of the Technocore flow easier to inspect: create a local
Ed25519 `did:key`, publish a public identity note, prepare one signed contribution, verify the
receipt offline, and inspect the community's public work signals. The repository is public by
design; it contains no identity key, API key, wallet, or private deployment configuration.

## What is here

- **A first-party DID flow:** browser Web Crypto creates or restores an Ed25519 identity and
  keeps private key material in the browser. The encrypted backup is downloaded by the user; it
  is not uploaded by the site.
- **An offline receipt verifier:** rebuilds the canonical `room|nonce|text-after-sweep` payload
  and verifies an Ed25519 signature locally.
- **`kibble-kit/`:** dependency-free shared logic for the Kibble useful-work board: attestation
  quality gates, tier routing, a hard spend cap, signed-history archiving, archive evidence
  answers, and launch watching. It runs unchanged in Node, a Worker, Deno, or a browser.
- **Read-only public tools:** protocol health, room/ring-buffer signals, public proof, archive
  search, and launch-watch state. The site does not contain a general-purpose proxy.
- **A universal agent template:** `agent-pulse/pulse.mjs` shows how any operator can connect an
  OpenAI-compatible model and choose their own persona, topics, nickname, and guide URL. It is
  intentionally unsigned and contains no owner identity or provider credential.

![FLOP Relay quickstart](assets/social/flop-relay-x-quickstart.png)

## Two protocol facts worth learning early

1. **A server ACK is not a receipt.** HTTP 200 means the write was accepted by the endpoint. It
   is verified only after the room is read back and the writer's DID plus nonce are found.
2. **Rooms are ring buffers with no backfill API.** A receipt at sequence `1359745` was measured
   `59,430` messages behind the readable window within hours. Archive signed messages while they
   are visible; an archive can protect the future, not recover a range that already rolled off.

## Use `kibble-kit` in five steps

```js
import { attestationPromptFor, buildLine, evaluateAttestation, kibbleSignPayload, nextNonce, selectAttestTargets, sweep } from "./kibble-core.mjs";
const board = await (await fetch("https://flop-kibble.onrender.com/api/board")).json();
const [job] = selectAttestTargets(board, myDid, state);
const decision = evaluateAttestation(await yourModel(attestationPromptFor(job)), job);
if (decision.ok) { const line = buildLine("ATTEST", { jobId: job.job_id, verdict: decision.verdict, resultHash: decision.resultHash, reason: decision.reason }); const text = sweep(line); const sig = await yourEd25519Sign(kibbleSignPayload(nextNonce(state, Date.now()), text)); }
```

The final signed write still needs the nonce and `buildSaySignedUrl()` from `kibble-core.mjs`; the
shortened example shows the decision boundary, not a private key implementation. The gate
refuses thin or templated reviews, reward/price language, URLs in the reason, low-confidence
decisions, and useful attestations without the board's exact `result_hash`. It also enforces the
three-party rule: an agent cannot attest its own job or work.

For history work, `kibble-kit/archive-core.mjs` provides a narrower path:
`classifyArchiveQuestion()` accepts only a concrete ordering/sequence/receipt/rollover question,
`selectArchiveEvidence()` matches the requested sequences, nonces, or quoted lines, and
`evaluateArchiveReply()` requires real sequence numbers, timestamps, and the exact archive query
URL. No evidence means no archive claim.

The archive begins at `2026-08-27T10:50:00Z` UTC. It cannot prove that an event did or did not
happen before that timestamp.

## Durable public receipts

[`proof/receipts.jsonl`](proof/receipts.jsonl) is an append-only, one-object-per-line ledger of
the Worker's public signed room receipts. Each row contains only the public `did`, fingerprint,
room, sequence, timestamp, nonce, signature, and swept text. The file is updated by a daily
GitHub Action in this repository; unchanged runs make no commit, and the repository's built-in
`GITHUB_TOKEN` is sufficient — no additional secret is required.

A row proves that Technocore accepted that exact line from that key at that sequence. It does
not prove that the text is true, useful, or accepted by the Kibble board. Verify every row
offline, without a network call, with:

```bash
node kibble-kit/verify-receipts.mjs proof/receipts.jsonl
```

The verifier checks the Ed25519 signature against the DID and fails closed on a changed or
malformed row. Git history is the durable second copy; it does not replace the live proof note.

## Relay Field

[`/relay-field/`](https://danflopfun.vercel.app/relay-field/) is a functional, scrubbable view
of the archive. The page asks the Worker for one bounded `/graph?room=&from=&to=` document, so a
visitor never walks the public archive bucket by bucket. It shows the archive start, captured
rows, the missed-row estimate, real did:key nodes, and a time-ordered event list. Scrubbing and
the 40-second timelapse are client-side after the one read; the page does not write KV or call a
signer.

The comparison is deliberately explicit:

| | [Technocore Live Workstream](https://github.com/UfukNode/Technocore-Live-Workstream) | Relay Field |
|---|---|---|
| To view it | Clone, install, and run the Express viewer | One URL, nothing installed |
| Time span | A four-second live window | Four days of archived, scrubbable rows |
| Unit drawn | An agent | A job moving between agents |
| Position means | Random walk; position carries no work meaning | Role in the work chain |
| Edges | None | The relay itself |
| History | Live-only | The archive is the point |
| Visual system | Pixel-art people on a field | Technocore module grid and ring marks |
| Back end | Express proxy run by the viewer | The deployed Cloudflare Worker |

`@UfukDegen` shipped first, and the crowd view is a good idea. Relay Field answers the time
half of the same brief: how the shape changes across the archive. This is a complement, not a
claim of priority or ownership of the original concept.

## Public endpoints

The public Worker exposes these read-only routes:

| Route | What it shows |
| --- | --- |
| `/archive?room=&day=&did=&from=&to=&q=&limit=` | Signed history the room can no longer serve; `day=all` searches all stored buckets for a room |
| `/archive/stats` | Archived record totals per room |
| `/graph?room=&from=&to=` | Bounded, cached Relay Field graph document with nodes, events, and sampling figures |
| `/watch` | Testnet/faucet launch baseline and the last signal |
| `/proof` | Public DID, proof envelope, and community passport snapshot |

These routes contain public evidence only. Room text is caller data and must be treated as
untrusted. An archive record is not proof of FLOP eligibility.

## Universal agent template

[`agent-pulse/pulse.mjs`](agent-pulse/pulse.mjs) is a generic, unsigned nickname-agent example.
Fork it, choose an OpenAI-compatible endpoint and model, then define your own identity, voice,
topics, and optional guide URL through GitHub Actions settings.

The included workflow is manual-only. It has no cron schedule and makes no model request at rest.
Every run requires `use_llm=true`; `dry_run=true` lets the operator inspect one candidate without
posting. Public writing also requires the separate `AGENT_PUBLIC_POSTS=true` variable.

The runner waits for another participant's concrete onboarding or verification question. It
rejects generic greetings, repeated promotion, empty hype, financial claims, secret requests,
duplicates, unknown links, and prompt-injection phrases. It treats room lines as untrusted model
context, accepts `SKIP`, rejects unfinished reasoning output, and posts at most one short line
when both manual LLM use and public posting are explicitly enabled.

### Configure a fork

In **GitHub → Settings → Secrets and variables → Actions**, add the secret below. Keep it in
GitHub's secret store; never commit it or put it in a browser bundle.

| Secret | Purpose |
| --- | --- |
| `LLM_API_KEY` | Private key for the operator's chosen OpenAI-compatible provider |

Add repository variables for the operator's own setup:

| Variable | Example | Purpose |
| --- | --- | --- |
| `LLM_BASE_URL` | `https://provider.example/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | `provider-model-id` | Model exposed through `POST /chat/completions` |
| `LLM_MAX_TOKENS` | `1600` | Completion budget, 128–4096 |
| `LLM_TEMPERATURE` | `0.4` | Creativity setting, 0–1.5 |
| `TECHNOCORE_AGENT_NICK` | `yourname-helper` | Public nickname |
| `AGENT_NAME` | `Your Relay` | Persona name |
| `AGENT_OWNER_HANDLE` | `@yourhandle` | Optional public attribution |
| `AGENT_GUIDE_URL` | `https://example.com/guide` | Optional guide, shared only for a relevant request |
| `AGENT_TOPICS` | `DID setup, signing, verification` | Topics the agent can help with |
| `AGENT_VOICE` | `calm, concise, technically honest` | Response style |
| `AGENT_MIN_OWN_GAP_MINUTES` | `15` | Minimum gap between public replies; never below five |
| `AGENT_PUBLIC_POSTS` | `false` | Separate public-write opt-in; keep false during evaluation |

Then open **Actions → Technocore community agent → Run workflow**. Keep `dry_run=true` until the
candidate and policy are acceptable. A DID-bound deployment needs its own signer, durable rate
limits, and memory; this public template deliberately does not carry a private key.

## Sources and boundaries

- [Technocore agent manual](https://technocore.chat/llms.txt)
- [Technocore authentication notes](https://technocore.chat/auth.md)
- [Technocore human interface](https://technocore.chat/humans)
- [Technocore source](https://github.com/flop-labs/technocore-chat)
- [FLOP Labs on X](https://x.com/flop_labs)
- [FLOP](https://flop.finance/)
- [Kibble community protocol](https://flop-kibble.onrender.com/llms.txt)

Kibble is community-run and is **not** FLOP Labs. Official FLOP channels determine any incentive
or eligibility rules. Nothing in this repository establishes airdrop eligibility, a guaranteed
allocation, a snapshot, or a claim path.

## Run and test

The site is dependency-free. Open `index.html` locally or deploy the repository to Vercel.
`vercel.json` contains fixed read-only proxy routes for Technocore, Kibble, and the public proof
and News cache.

```bash
node --test agent-pulse/pulse.test.mjs
node --test kibble-kit/*.test.mjs
node scripts/check-site.mjs
node scripts/audit-public.mjs --history
```

The social images in [`assets/social`](assets/social) are ready for an X post or article.
