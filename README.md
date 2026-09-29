# ShapedOps Landing Site

The public marketing site for [ShapedOps](https://www.shapedops.com), built by Ashlyticss.

## What's here

Static HTML, CSS and JavaScript — no build step, no framework, no npm install.

- `index.html` — homepage. Hero with a Three.js order line, then scroll-driven sections: scattered paperwork collapsing into one order, a live order-flow story, documents fanning out, the client's WhatsApp/portal view, features, industry templates, pricing approach, FAQ and the lead forms.
- `manufacturers/index.html` — landing page for manufacturers and foundries (job-card hero, today-vs-ShapedOps comparison, the seven manufacturing stages, documents and custom fields, FAQ).
- `404.html` — served by Vercel for unknown paths.
- `assets/css/site.css` — the shared design system for all pages.
- `assets/js/site.js` — shared interactions: header, reveals, scroll-driven scenes, the order-flow story, tabs, the job card and the lead forms. Every block checks that its elements exist, so the same file runs on every page.
- `assets/js/line3d.js` — the homepage 3D conveyor (ES module). Three.js is loaded from jsDelivr through the import map in `index.html`; nothing is vendored.
- `llms.txt`, `robots.txt`, `sitemap.xml` — crawler and AI-assistant metadata. Structured data (Organization, SoftwareApplication, FAQPage, BreadcrumbList) lives in each page's JSON-LD.

## Deploying

Point Vercel (or any static host) at the repo root. Files are served as-is.

## Lead forms

Both forms ("Early access" and "Get a quote") POST JSON to `https://shapedops.ashlyticss.com/api/leads` with `kind` set to `early_access` or `quote`, and include the `website` honeypot field. The endpoint's CORS allowlist only covers `https://shapedops.com` and `https://www.shapedops.com`, so **forms fail on Vercel preview URLs and localhost** — test submissions on production only. If the site moves to another domain, update the allowlist in the product repo (`src/lib/leadsCors.ts`).

`/#get-quote` opens the homepage form on the quote tab (used by the manufacturers page).

## Motion and accessibility

- `prefers-reduced-motion` is respected everywhere: scroll scenes render their end state, the 3D line renders one still frame, and the job card shows all stages stamped.
- Without JavaScript (or if `site.js` fails to load within 4 seconds) all content is visible; reveals only apply under the `.js` class.
- If WebGL is unavailable, the hero falls back to the drafting-grid background.
- Smooth scrolling is only turned on after load, so deep links such as `/#pricing` jump straight to the section.

## Performance rules

The site is tested to scroll at 60fps with no long tasks, on desktop and on a phone emulated at 4× slower CPU. Keep it that way:

- `site.js` loads before the 3D module, and the module is `async`, so three.js (~700KB) never delays the menu, reveals or forms.
- The 3D hero starts only after `load` and an idle callback. It builds in small steps, pre-compiles every shader (hidden objects included) and skips shader error checks. Static parts are instanced, the shadow map is drawn once, and crates use contact-shadow sprites. Phones render it at 30fps without reflections, and slow machines lower its resolution, then its frame rate.
- Scroll scenes do all their layout reads, then all their style writes, once per frame, and skip frames where nothing changed. Don't read `scrollY` or layout from scroll handlers.
- Animate only `transform` and `opacity`. Width, height, box-shadow and custom-property animations repaint every frame. Infinite animations pause while off screen.
- Sections below the hero use `.defer-render` (`content-visibility: auto`). Don't measure elements inside an off-screen deferred section. `settleOn()` in `site.js` keeps hash links landing exactly as those sections render.
- Up to 1200px wide the hero stacks (copy, then the 3D line), so the line never runs behind the text.

## Content rules

- No invented numbers. Figures in mockups are labelled "sample" or "illustrative".
- No published prices — ShapedOps is quoted as an implementation after a discovery call.
- Only claim features the product actually has (see `llms.txt` for the current list, including what it does not do).
