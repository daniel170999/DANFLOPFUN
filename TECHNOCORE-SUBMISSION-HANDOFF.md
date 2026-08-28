# Technocore logo submission

## Public route

- Public home: `/` redirects with a temporary 307 to `/technocore/`.
- Canonical route: `/technocore/`
- FLOP Relay tools: `/relay/` — Guide, Signals, Briefing, and Live Agent.
- Owner attribution: `@daniel_sats`
- Purpose: the public entry for the Technocore logo competition.

The submission header gives equal visual weight to **Logo submission** and
**FLOP Relay tools**, with the latter linking to `/relay/`, the public canonical
field-kit route. The header does not contain a Brand kit item; the checked ZIP
download remains in the Delivery content section. `/relay/` retains the full
Guide, Signals, Briefing, and Live Agent workspace. `/index.html` redirects
there so the older static file path does not create a second public entry point.

## Immutable submission boundary

- `technocore/index.html` was ported from the approved submission source. Its
  construction interaction script is preserved byte-for-byte.
- The 18 listed downloadable assets are served as ordinary static files under
  `/technocore/`; do not pass the PNGs through an image optimizer or rewrite the
  SVGs with SVGO/SVGR.
- Daniel explicitly approved one exception to the original no-archive rule on
  2026-08-28: `/technocore/technocore-brand-kit.zip`. It contains exactly the
  18 listed public files and is built by `scripts/build-technocore-kit.mjs` with
  raw source bytes preserved. Do not add any other archive or extra file to it.
- Do not publish any local runtime/browser profile, log, `.env` file, private
  key, API key, or machine path.

## Verification gate

Run before a future change or release:

```bash
node scripts/check-site.mjs
node scripts/audit-public.mjs --history
```

The first command checks the route favicon, the 18 required assets, the single
interaction script, the checked 18-file bundle, and the absence of `#FF453A`
from the route markup. The second command checks the working tree and Git
history for sensitive literals. If a listed source asset changes, rebuild the
bundle with `node scripts/build-technocore-kit.mjs` before running the gate.

## Release log

- `68e91c0` published the static `/technocore/` route and the 18 direct files.
- `c165be2` added the deterministic, stored ZIP bundle and its 18-file check.
- `7239d60` exposed the visible **Download all · 18 files · ZIP** control.
- `e8f96f4` confined wide lockups to their specimen wells below 720 px, removing
  horizontal body overflow on narrow screens without changing logo geometry.
- `2f35395` made `/technocore/` the public landing destination and replaced the
  old field-kit navigation with the competition submission, brand kit, and
  source only. Production verification: `/` resolves to `/technocore/`; the
  Delivery anchor and checked 18-file ZIP remain reachable; 390 px has no page
  overflow.
- `431d1e2` restored the full FLOP Relay workspace at `/relay/` and exposed it
  through the Technocore submission header. Production verification: the
  canonical Relay page exposes Guide, Signals, Briefing, and Live Agent; each
  tab selects its matching panel; `/index.html` redirects to `/relay/`.
- Pending release: expands the header navigation into visible, labelled controls
  for Logo submission and FLOP Relay tools, while removing the Brand kit menu
  link without removing the checked delivery download.
