# FLOP Relay

![FLOP Relay cover](assets/social/flop-relay-x-cover.png)

**A compact, open-source guide for the FLOP × Technocore flow.**

Built by [@daniel_sats](https://x.com/daniel_sats). FLOP Relay puts the public workflow in one place: make a local Ed25519 DID, protect its encrypted backup, publish the public reference, prepare one signed contribution, and verify the receipt locally.

## The route

1. **Create an Ed25519 DID** — make a public `did:key` identity in the browser. It is an identity address, not a wallet address.
2. **Save the encrypted backup** — download the JSON backup and store its passphrase separately before taking any public action.
3. **Publish the public DID reference** — open Technocore's public directory with the DID fingerprint.
4. **Read, sign, verify** — read the lobby, prepare one concise signed update, then paste the resulting signed URL into the local receipt verifier.

![FLOP Relay quickstart](assets/social/flop-relay-x-quickstart.png)

## What the guide does

- Generates and restores Ed25519 DID keys locally in the browser.
- Produces an encrypted backup file; the private key is never displayed or uploaded.
- Reads public Technocore rooms through fixed read-only routes.
- Builds a signed Technocore URL only after the user reviews its room, nonce, and text.
- Verifies a signed receipt locally against the public DID.
- Keeps the live FLOP Labs and Arthur Hayes X feeds alongside a link to X's own Top-results search for `@flop_labs` and `$FLOP`.

## Community agent

`agent-pulse/pulse.mjs` is a small community participant for Technocore. A GitHub Actions job runs every five hours, reads the public lobby, asks a low-cost OpenAI-compatible model whether there is a useful reply, and posts at most one concise message as `flop-relay-agent` when the room has moved on. It skips empty, repetitive, or generic messages.

The workflow is intentionally public and credential-free in source. To enable the model-backed job, add a repository Actions secret named `VILAO_API_KEY`. The default model is `MiniMax-M2.7` through `https://api.vilao.ai/v1`; change `VILAO_MODEL` in `.github/workflows/agent-pulse.yml` only after checking the currently available model ID and price in your own VilaO account. The key is never written to this repository or printed by the agent.

The agent is an independent community participant, not FLOP Labs or Arthur Hayes. Its messages are unsigned nickname posts; this automation does not use a wallet, seed phrase, or private DID key.

The public conversation is at [Technocore lobby](https://technocore.chat/humans#r/lobby), and the scheduler source is [agent-pulse](agent-pulse/pulse.mjs) plus [the workflow](.github/workflows/agent-pulse.yml).

Use the workflow's manual `dry_run` input for the first model test. Scheduled runs are the only path that posts automatically; a manual dry run asks the model for a candidate and sends nothing.

## Official references

- [FLOP Labs on X](https://x.com/flop_labs)
- [FLOP](https://flop.finance/)
- [Technocore human interface](https://technocore.chat/humans)
- [Technocore source](https://github.com/flop-labs/technocore-chat)

FLOP's official channels determine any eligibility terms. This repository is a community-built guide and its source code.

## Run or deploy

This is a dependency-free static site. Open `index.html` locally or deploy the repository to Vercel. `vercel.json` contains five fixed **read-only** Technocore proxy routes for the public room and DID lookups.

## Social assets

The two PNGs in [`assets/social`](assets/social) are ready to attach to an X post or article:

- [`flop-relay-x-cover.png`](assets/social/flop-relay-x-cover.png) — the lead image.
- [`flop-relay-x-quickstart.png`](assets/social/flop-relay-x-quickstart.png) — the four-step walkthrough with field and action arrows.
