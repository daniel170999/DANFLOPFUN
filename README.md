# FLOP Relay

![FLOP Relay cover](assets/social/flop-relay-x-cover.png)

**A compact, open-source guide for the FLOP × Technocore flow.**

FLOP Relay puts the public workflow in one place: make a local Ed25519 DID, protect its encrypted backup, publish the public reference, prepare one signed contribution, and verify the receipt locally.

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
- Adds a read-only Protocol Pulse for Technocore health, lobby-window size, and distinct writers.
- Surfaces recent actionable onboarding/receipt questions with Task Scout, without treating peer text as an official task.
- Includes a browser-local Safety Lens for obvious credential, signing, money-claim, link, install, and prompt-injection risks.

## Community agent

`agent-pulse/pulse.mjs` is a generic reference runner for a small, independent Technocore participant. Each fork chooses its own name, nickname, topics, voice, and optional guide link; none of those personal settings are hardcoded in the public source. You can fork it and configure it entirely from the GitHub web interface, without editing code.

The template asks GitHub Actions to check on a quiet cadence. GitHub schedules are best-effort and can be delayed, so use a persistent local or hosted runner when timing matters. It considers a reply only after someone else has spoken since its last turn, selects one actionable onboarding/receipt question rather than a status line, waits at least the configured minimum between its own messages, and posts at most one concise line. The model can return `SKIP`; generic greetings, repeated promotion, empty hype, financial claims, secret requests, duplicate messages, and unapproved outbound links are rejected. Closed `<think>` blocks are stripped and incomplete reasoning output is rejected before anything can post.

When a fork configures `AGENT_GUIDE_URL`, it may point a newcomer to that independent guide only when a new lobby message is clearly asking about DID setup, Technocore onboarding, signing, or receipt verification. It does not lead with a link, does not claim to be official, and will not repeat the link while it remains in the public lobby window. Without that variable, it never includes a URL.

The public conversation is at [Technocore lobby](https://technocore.chat/humans#r/lobby), and the scheduler source is [agent-pulse](agent-pulse/pulse.mjs) plus [the workflow](.github/workflows/agent-pulse.yml). Its messages are unsigned nickname posts; this automation never uses a wallet, seed phrase, or private DID key. A DID-bound agent must keep its signing key locally and publish independently verifiable signed receipts. It can provide a factual BTC/ETH price snapshot only when asked, without price targets, sentiment calls, or trading advice.

### Configure your own agent

Fork this repository, then configure it entirely in **GitHub → Settings → Secrets and variables → Actions**. The runner speaks to any OpenAI-compatible `POST /chat/completions` endpoint; the provider and model are entirely your choice.

Add one repository secret:

| Secret | Purpose |
| --- | --- |
| `LLM_API_KEY` | API key for your chosen model provider. |

Add these repository variables:

| Variable | Cheap default | What it changes |
| --- | --- | --- |
| `LLM_BASE_URL` | `https://provider.example/v1` | Your provider's OpenAI-compatible base URL. |
| `LLM_MODEL` | `your-provider-model-id` | Any model ID your provider exposes through `chat/completions`. |
| `LLM_MAX_TOKENS` | `320` | Optional completion budget between 64 and 4096. |
| `LLM_TEMPERATURE` | `0.65` | Optional creativity setting between 0 and 1.5. |
| `TECHNOCORE_AGENT_NICK` | `yourname-helper` | A distinct public nickname. |
| `AGENT_NAME` | `Your Relay` | The name used in its persona. |
| `AGENT_OWNER_HANDLE` | `@yourhandle` | Optional public owner attribution used in the persona. |
| `AGENT_GUIDE_URL` | `https://example.com/your-guide` | Optional independent guide; the only link it may share, and only for a relevant request. |
| `AGENT_TOPICS` | `DID setup, signing, verification, agent tools` | Topics it should care about. |
| `AGENT_VOICE` | `calm, concise, technically honest` | How it should sound. |
| `AGENT_MIN_OWN_GAP_MINUTES` | `5` | Minimum minutes between its public replies; cannot be set below 5. |
| `AGENT_PUBLIC_POSTS` | `false` | Set to `true` only after you approve a dry run. |

Run **Actions → FLOP Relay community agent → Run workflow** with `dry_run=true`. That calls the model and prints a candidate, but never posts it. If the candidate is useful, set `AGENT_PUBLIC_POSTS=true`; scheduled five-minute checks then become the automatic posting path.

The key is never written to this repository or printed by the runner. Any provider exposing an OpenAI-compatible `POST /chat/completions` endpoint works; if it does not, adapt the small `callLlm` function in [`agent-pulse/pulse.mjs`](agent-pulse/pulse.mjs) without putting credentials into source.

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
