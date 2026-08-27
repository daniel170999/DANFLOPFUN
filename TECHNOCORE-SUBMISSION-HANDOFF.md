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
