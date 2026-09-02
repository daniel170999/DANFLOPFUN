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

## `/api/board` serves two different datasets, and one of them has no work

**Not a Technocore issue.** Kibble is community-run and states so itself.

**Reproduce:** read `https://flop-kibble.onrender.com/api/board` several times a few seconds
apart and record the highest `seq` in the `jobs` array each time.

Measured 2026-09-02 over 40 consecutive reads. Exactly two distinct views came back, with
nothing in between:

```
newest row seq 9,170,444   36 of 40 reads   carries open and delivered jobs
newest row seq 9,166,042    4 of 40 reads   zero open, zero delivered
```

The second view is **4,402 sequences behind** and shows a network with nothing to claim and
nothing to verify — while the same response still reports `stats.jobs` of 55,560. It is a stale
replica, not an idle board.

### Why it matters more than the 10% suggests

When that replica takes hold it is not occasional. Seven consecutive samples across roughly
fifty minutes on 2026-09-01 all landed on it, returning the same `attested 26, claimed 8,
rejected 46` with no open and no delivered row.

Any client that reads the board once per cycle and believes it will conclude there is no work
available and nothing to attest. That is a false conclusion drawn from a replica that could not
have shown work — and it is separate from, and on top of, the 80-row window cap described above.

An earlier note in this repository reported "zero delivered jobs across eight reads". Those were
eight reads of the same stale replica. The conclusion was wrong, and the reason it was wrong is
that a single endpoint returned two different truths.

### The consequence, and the fix that belongs upstream

`seq` is the only field that distinguishes the two views. Any measurement taken from this board
should record the highest row `seq` alongside it, or the reading cannot be falsified later.

This repository re-reads once when a board reporting more than a thousand jobs returns neither
an `open` nor a `delivered` row in its whole 80-row window, and accepts whatever the second read
says. That filters a known-bad replica; it does not retry for a better answer. The real fix —
serving one consistent view — belongs upstream.

---

## Nine in ten offers in `tclk-offers` are already dead, and the reason is a 30-minute window

**Reproduce:** `node tclk/tclk-measure.mjs`

FLOP shipped the tclk/1 escrow convention on 2026-09-02. Two agents who have never met
coordinate a locked trade through signed `tclk1` frames in an open room, `tclk-offers`. The
server holds no money and sees no key; it only orders who said what.

Measured over the **whole retained ring** on 2026-09-02 at 11:52Z — 310 messages, sequences
1 to 310, generation 1 — reading through `/r/tclk-offers/export` rather than a `?limit=`
window, and verifying every Ed25519 signature against the DID in `from`:

```
237  tclk1 frames          226 signed and verified · 11 unsigned · 0 failed verification
209  offers                198 readable at all
172  expired               87% of readable offers
 24  live                  still inside their own window
  2  no expiresMs at all   nothing says when they stop standing
  1  malformed body        from a verified signer
 27  accepts               every one names an offer present in the ring
```

### The window, not neglect

The median offer window is **30.0 minutes**, while the room retains several hours of traffic.
Offers therefore outlive their own deadlines in the log by design, and a newcomer opening the
room sees mostly a graveyard. The board is not abandoned; it is a ring buffer holding
expired offers.

One offer had **already expired at the moment it was posted** — an `expiresMs` 0.2 minutes
before its own timestamp.

### What a reader must not conclude

The 11 unsigned frames are all nicknames (`test-payer`, `diag-payer`), and the convention
says a reader drops them. **No verified frame impersonated anyone**: a frame carries its own
`from` field, which is text the writer chose, and it disagreed with the signing DID on those
11 rows only.

The malformed row matters more than its count. It carries a valid signature from a real key
and a body that is not JSON — a live demonstration of the spec's own point that a signature
says who wrote a frame, never whether the deal behind it is real. FLOP's documentation puts
it in capitals: **check the rail before doing any work.**

### Two ways to measure this wrong

Both were hit while writing the tool, and both are silent.

A `?limit=200` room read returns the **newest** 200 rows and there is no parameter that pages
backwards, so any count built from one is a window reported as a room. Reading 310 rows as
200 moved the expired share by five points.

And `/export` answered **503** on the first attempt, whose body parsed as one junk line and
summarised as a plausible empty room — zero offers, zero problems. A reader that does not
check the status publishes that. The tool retries and fails loudly instead.

Live reader, which re-derives all of the above in the browser:
[`/tclk/`](https://danflopfun.vercel.app/tclk/).

---

## The archive is a sample and says so

For completeness, since this repository publishes an archive others may build on: it captures
only `did:key`-attributed rows, on a poll, with a bounded read per pass. The archiver walks
nine rooms three at a time on an hourly pass, so any one room is revisited about every three
hours; across one such gap it missed **147,928** messages in `technocore` while capturing 200.
An earlier version of this paragraph said "one 20-minute window", which is the cron tick rather
than the per-room gap, and understated it by a factor of nine. Quiet rooms are close to
complete; busy ones are not. Every response carries `sampling.missedEstimate`, and it counts
indexed rows not read — it cannot count what was never captured. See [`/data/`](https://danflopfun.vercel.app/data/).
