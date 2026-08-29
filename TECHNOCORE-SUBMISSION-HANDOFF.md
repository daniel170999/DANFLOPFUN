# Technocore logo submission

## Public route

- Public home: `/` redirects with a temporary 307 to `/technocore/`.
- Canonical route: `/technocore/`
- FLOP Relay tools: `/relay/` — Guide, Signals, Briefing, and Live Agent.
- Owner attribution: `@daniel_sats`
- Purpose: the public entry for the Technocore logo competition.

The submission header gives equal visual weight to **Logo submission** and
**FLOP Relay tools**, with the latter linking to `/relay/`, the public canonical
field-kit route. The public route exposes individual files only; no ZIP archive
is published. `/relay/` retains the full
Guide, Signals, Briefing, and Live Agent workspace. `/index.html` redirects
there so the older static file path does not create a second public entry point.

## Immutable submission boundary

- `technocore/index.html` was ported from the approved submission source. Its
  construction interaction script is preserved byte-for-byte.
- The 18 listed downloadable assets are served as ordinary static files under
  `/technocore/`; do not pass the PNGs through an image optimizer or rewrite the
  SVGs with SVGO/SVGR.
- The previously generated `technocore-brand-kit.zip` was removed from the public
  route on 2026-08-30. Keep the no-archive boundary: publish individual assets
  only and do not recreate or link a bundle.
- Do not publish any local runtime/browser profile, log, `.env` file, private
  key, API key, or machine path.

## Verification gate

Run before a future change or release:

```bash
node scripts/check-site.mjs
node scripts/audit-public.mjs --history
```

The first command checks the route favicon, the 18 required assets, the single
interaction script, the absence of a public ZIP archive, and the absence of
`#FF453A` from the route markup. The second command checks the working tree and
Git history for sensitive literals.

## Release log

- `68e91c0` published the static `/technocore/` route and the 18 direct files.
- `c165be2` added a deterministic, stored ZIP bundle (historical; no longer public).
- `7239d60` exposed the visible ZIP control (historical; removed 2026-08-30).
- `e8f96f4` confined wide lockups to their specimen wells below 720 px, removing
  horizontal body overflow on narrow screens without changing logo geometry.
- `2f35395` made `/technocore/` the public landing destination and replaced the
  old field-kit navigation with the competition submission and source only.
  Historical production verification: `/` resolved to `/technocore/`; the
  Delivery anchor and 390 px no-overflow check passed. The former ZIP was
  removed from the public route on 2026-08-30.
- `431d1e2` restored the full FLOP Relay workspace at `/relay/` and exposed it
  through the Technocore submission header. Production verification: the
  canonical Relay page exposes Guide, Signals, Briefing, and Live Agent; each
  tab selects its matching panel; `/index.html` redirects to `/relay/`.
- `292274d` promotes the header navigation into visibly labelled controls for
  **Logo submission** and **FLOP Relay tools**, and removes the Brand kit menu
  link without removing the checked delivery download. Production verification:
  the controls are 42 px high on desktop, Relay resolves to `/relay/`, no
  Brand kit navigation link remains, the 390 px layout has no horizontal body
  overflow, and the production console has no warnings or errors.
