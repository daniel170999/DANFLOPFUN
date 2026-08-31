# Findings

Measurements taken against public Technocore endpoints, read-only, reproducible.
Written by [@daniel_sats](https://x.com/daniel_sats). Not affiliated with FLOP Labs.

---

## Room reads started returning `sig` at 05:07Z on 2026-08-31

**Reproduce:** `node kibble-kit/signature-exposure-report.mjs`

`say_signed` is documented as *"Append a message signed by an Ed25519 did:key, verified
offline."* Verifying offline needs three things: the DID, the nonce, and the signature. Room
reads returned the first two from the start. The third appeared this morning.

```
signing-messages   signed writes 200   sig returned  27 (14%)   last without 04:34:12   first with 05:13:28
did-key-method     signed writes 200   sig returned  27 (14%)   last without 03:57:47   first with 05:08:26
nonce-security     signed writes 200   sig returned  48 (24%)   last without 03:57:57   first with 05:08:30
builders           signed writes 200   sig returned  61 (31%)   last without 05:06:49   first with 05:09:10
infra              signed writes 200   sig returned 125 (63%)   last without 05:05:17   first with 05:07:56
agent-security     signed writes 200   sig returned 158 (79%)   last without 03:34:07   first with 05:11:22
technocore         signed writes 200   sig returned 200 (100%)  last without —          first with 16:31:24

cutover:  after  2026-08-31T05:06:49.363199Z
          before 2026-08-31T05:07:56.322916Z
          bound  67 seconds
```

An independent corroboration: a poller watching `/.well-known/agent.json` recorded
`0.10.0 → 0.11.0` at **2026-08-31T05:20:41Z**, thirteen minutes after that bound.

### How the method works, and why it needs no privileged access

Every signed write carries a nonce, because `say-signed/{did}/{sig}/{nonce}/{text}` takes one
and `say/{nick}/{text}` does not. So a row with a `did:key` in `from` **and** a nonce came
through the signed path. Whether that row also carries `sig` says which side of the change it
was written on. Sort those rows by timestamp and the cutover falls out.

The sharp per-room boundary is what rules out the alternative explanations. This is not
signatures decaying with age and not a sampling artifact: in every room, **every** signed row
before the boundary lacks `sig` and **every** row after carries it. That is a deployment.

### The consequence

This is a change in the right direction and it closes a real gap. The observation worth
recording is what it means for everything written before it:

**Signed messages written before 2026-08-31T05:07Z are attributed to a DID in the public API but
carry no signature, so no third party can verify them offline from Technocore alone.** They are
server-attested, not independently verifiable. Anyone reasoning about agent history from before
this morning — reputation, allocation, provenance — is trusting the server's attribution rather
than checking a signature.

The gap is only closable by whoever held the signature at write time. This repository keeps its
own: see [`proof/receipts.jsonl`](proof/receipts.jsonl) and the offline verifier in
[`kibble-kit/verify-receipts.mjs`](kibble-kit/verify-receipts.mjs), which reconstructs
`room|nonce|text` and checks Ed25519 against the DID with no network at all.

### Suggestion, offered lightly

If the signature is still held server-side for pre-0.11.0 rows, backfilling it on read would
make the whole history independently verifiable rather than just the part written after this
morning. If it was never retained, saying so in `/.well-known/agent.json` — a field noting from
which version `sig` is returned — would let consumers reason correctly about what they can and
cannot check, instead of discovering it the way this was discovered.

---

## `/api/board` returns a fixed 80-row window while reporting far more

**Not a Technocore issue.** Kibble is community-run and states so itself.

Measured 2026-08-31: `stats.jobs` **32,905**, `stats.open` **13,850**, `stats.agents` **2,175**,
while the `jobs` array holds **80** rows with **0** open. `?status=open`, `?limit=20` and
`?open=1` all return the same 80.

Any client that reads the array and believes it has the board will conclude there is no work
available. Reading `JOB v1` lines from the room tape instead is the workaround this repository
uses; the fix belongs upstream.

Its Render instance also returns `HTTP 502` and `524` intermittently — seven times in the
24 hours to 2026-08-31T14:00Z — and serves degraded partial JSON on cold start: one read
returned `jobs:45, agents:26` where three reads two minutes later all returned
`jobs:22113, agents:2026`. **One read is not a measurement.**

---

## The archive is a sample and says so

For completeness, since this repository publishes an archive others may build on: it captures
only `did:key`-attributed rows, on a poll, with a bounded read per pass. One 20-minute window
missed **147,928** messages in `technocore` while capturing 200. Quiet rooms are close to
complete; busy ones are not. Every response carries `sampling.missedEstimate`, and it counts
indexed rows not read — it cannot count what was never captured. See [`/data/`](https://danflopfun.vercel.app/data/).
