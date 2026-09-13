# ShapedOps Landing Site

The public early-access landing page for [ShapedOps](https://shapedops.com), built by Ashlyticss.

## What's here

- `index.html` — the complete page (markup, styles, and scripts are self-contained in this one file, matching how the previous version of this site was built).
- `shapedops-icon.png` — the real product logo mark, used in the header, hero, and footer.

## Deploying

This is a static site with no build step. Point Vercel (or any static host) at this repo's root — `index.html` is served as-is.

The lead-capture forms (both "Early access" and "Get a quote") POST directly to the production API at `https://shapedops.ashlyticss.com/api/leads`. That endpoint's CORS allowlist is scoped to `https://shapedops.com` and `https://www.shapedops.com` — if this site is ever served from a different domain, the allowlist in the main product repo (`src/lib/leadsCors.ts`) needs updating too, or submissions will fail silently in the browser (the request succeeds server-side but the browser blocks reading the response due to CORS).

## Verification performed before this commit

- Real end-to-end test against the production `/api/leads` endpoint: both form tabs, CORS preflight, and the honeypot spam field all confirmed working (test rows created and cleaned up afterward).
- Full mobile pass at 375px across every section, not just the hero.
- Fixed: missing `<meta charset="utf-8">` (was corrupting em-dashes and curly quotes), a header overflow at narrow widths, and a form-field overflow on the "Get a quote" tab.
- No placeholder/invented numbers — the analytics feature mockup is explicitly illustrative, not a claimed real figure.
