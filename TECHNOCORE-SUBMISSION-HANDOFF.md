# Technocore logo submission

## Public route

- Route: `/technocore/`
- Owner attribution: `@daniel_sats`
- Purpose: the public entry for the Technocore logo competition.

## Immutable submission boundary

- `technocore/index.html` was ported from the approved submission source. Its
  construction interaction script is preserved byte-for-byte.
- The 18 listed downloadable assets are served as ordinary static files under
  `/technocore/`; do not pass the PNGs through an image optimizer or rewrite the
  SVGs with SVGO/SVGR.
- Do not publish any archive, local runtime/browser profile, log, `.env` file,
  private key, API key, or machine path.

## Verification gate

Run before a future change or release:

```bash
node scripts/check-site.mjs
node scripts/audit-public.mjs --history
```

The first command checks the route favicon, the 18 required assets, the single
interaction script, and the absence of `#FF453A` from the route markup. The
second command checks the working tree and Git history for sensitive literals.
