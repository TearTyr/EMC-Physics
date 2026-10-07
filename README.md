# EMC Lab — Interactive Electromagnetics Tutorial

A responsive, interactive educational website for **Calculus-based Physics II**, built for the
**EMC (Electromagnetics) group**. It teaches electricity and magnetism through written
tutorials, **eight live simulations**, and a **20-question auto-graded quiz** with Chart.js
score analytics — plus an *optional* Express + MySQL progress-sync server.

> Every number on every screen is computed from the real equations (Coulomb's law, Ohm's law,
> the dipole field, Faraday's law). Nothing is animated by hand.
>
> **Stack:** HTML + CSS + vanilla JavaScript, Tailwind CSS (CDN), native Canvas 2D for the core
> sims, **p5.js** for the bonus AC-generator lab, **Chart.js** for quiz analytics, and an
> optional **Node/Express + MySQL** backend. The website itself still opens straight from the
> file system: every library has a tested offline fallback.

---

## 1. Quick start

The site is static. Any of these works:

### Option A — open directly
Double-click `index.html`. Everything works from the file system, including progress tracking
in browsers that allow `localStorage` for `file://` (Chrome, Edge, Firefox all do by default).

### Option B — local web server (recommended)
```bash
cd emc-physics-tutorial
python3 -m http.server 8000        # or: npx serve .
# then open  http://localhost:8000
```

### Option C — any static host
Upload the folder to GitHub Pages, Netlify, Vercel or a university web space as-is.

**Requirements:** a modern browser — Chrome 100+, Firefox 100+, Edge 100+ (also Safari 15.4+).
An internet connection is *optional*: Tailwind loads from a CDN when available, and an identical
offline stylesheet (`css/tailwind-fallback.css`) takes over when it is not (see §5).

---

## 2. File structure

```
emc-physics-tutorial/
├── index.html                     Landing page: navigation, topic cards, formula sheet,
│                                  progress dashboard, animated dipole hero
├── quiz.html                      Quiz page: toolbar, question list, score card
├── topics/
│   ├── charges.html               Topic 1 — charges, Coulomb's law, electric fields
│   ├── current.html               Topic 2 — Ohm's law, series/parallel, R-equivalent
│   ├── magnetism.html             Topic 3 — field lines, bar magnets, F = qv×B
│   └── induction.html             Topic 4 — flux, Faraday, Lenz, magnet through a coil
├── css/
│   ├── styles.css                 Design tokens + all semantic components (the design system)
│   └── tailwind-fallback.css      Offline copy of the Tailwind utilities the markup uses
├── js/
│   ├── common.js                  Shared engine: constants, HiDPI canvas Stage, pointer input,
│   │                              SI formatter, localStorage progress, nav/reveal/toasts
│   ├── home.js                    Hero animation + progress dashboard + sync panel (index.html)
│   ├── sync.js                    Optional client for the Express sync server (opt-in, silent)
│   ├── sim-coulomb.js             Sim 1 — Coulomb force bench (draggable charges)
│   ├── sim-efield.js              Sim 2 — electric field explorer (lines/vectors/probe)
│   ├── sim-ohm.js                 Sim 3 — Ohm's law bench (auto-range meter + I–V chart)
│   ├── sim-circuit.js             Sim 4 — circuit builder (series/parallel/combination)
│   ├── sim-magnetfield.js         Sim 5 — bar magnet lab (lines/compass/vectors/filings)
│   ├── sim-lorentz.js             Sim 6 — Lorentz force + right-hand-rule challenge
│   ├── sim-induction.js           Sim 7 — magnet through a coil (exact dipole flux + charts)
│   ├── sim-generator.js           Sim 8 — AC generator, rendered with p5.js (bonus lab)
│   ├── quiz-data.js               20 questions with worked explanations
│   └── quiz.js                    Quiz engine: marking modes, scoring, Chart.js analytics
├── server/
│   ├── lib.js                     Shared API logic: stores, merge rule, sanitising, cache policy
│   ├── index.js                   Optional Express API + static host (Node flavour)
│   ├── bun-server.js              The same server on Bun.serve (faster flavour, no Express)
│   └── schema.sql                 Manual MySQL setup script
├── tools/
│   ├── check-links.mjs            Static validator (links, ids, data-hooks, CSS coverage)
│   ├── smoke-test.mjs             Runtime test harness (jsdom, optional dev dependency)
│   ├── server-test.mjs            API contract test (runs against Node or Bun servers)
│   └── bench.mjs                  Node-vs-Bun static-serving benchmark
├── api/                           Vercel serverless functions (optional sync on Vercel)
│   ├── health.js                  GET /api/health
│   └── progress/[id].js           GET|PUT /api/progress/:id
├── vercel.json                    Vercel config: cache headers + function settings
├── tailwind.config.js             Optional production Tailwind build (npm run build:css)
├── package.json                   Dev/server scripts: check / test / server / bench / …
├── README.md                      This file
├── TESTING.md                     Manual + automated testing checklist
└── PRESENTATION-NOTES.md          Physics + implementation notes for presenting the module
```

Total: ~8,000 lines across 6 pages, 2 stylesheets and 11 scripts. No framework, no bundler.

---

## 3. Features

| Requirement | Where it lives |
|---|---|
| Clean landing page with navigation to each topic | `index.html` — hero, 4 topic cards, simulation index, formula reference |
| Responsive UI, desktop + mobile | Fluid `clamp()` type, `md:`/`lg:` grids, hamburger nav < 900 px, canvases resize via `ResizeObserver` |
| Sim 1 — Ohm's law calculator | `js/sim-ohm.js`: V and R sliders (R on a log scale), live I, P, auto-ranging ammeter, bulb brightness ∝ P, I–V characteristic plot, power-rating safety warning |
| Sim 2 — circuit builder (battery + bulb, series/parallel) | `js/sim-circuit.js`: add/remove/edit resistors, three topologies, exact per-element V/I/P table, animated charge flow whose density ∝ branch current, clickable resistors |
| Sim 3 — induction: magnet through a coil | `js/sim-induction.js`: exact on-axis dipole flux, Faraday EMF, centre-zero galvanometer, ⊙/ current symbols, scrolling Φ and EMF strip charts, drag/push/oscillate modes |
| Extra simulations (4 more) | Coulomb bench, field explorer, bar-magnet lab, Lorentz-force lab |
| Tutorials with explanations, diagrams, formulas, real-world examples | Each topic page: objectives → theory → SVG figures → worked examples → applications → misconceptions → self-check reveals |
| Quiz with ≥ 10 MCQs, automatic scoring + feedback | 20 questions, exam *or* instant marking, per-question explanations, per-topic breakdown, grade bands, review-incorrect filter, shuffle, retake |
| Chart.js score visualisation | Doughnut (correct/incorrect), horizontal bars (score per topic), line (attempt history) on the score card; CSS-bar fallback when the CDN is unreachable |
| p5.js simulation | Bonus AC-generator lab on Topic 4 (`js/sim-generator.js`, p5 instance mode); notice fallback offline |
| Progress tracking with localStorage | `EMC.Progress` in `js/common.js`: topics read + best score + attempt history → ring on the home page; degrades gracefully to memory when storage is blocked |
| Optional backend for tracking | `server/index.js`: Express + MySQL (or zero-config JSON file) with `GET/PUT /api/progress/:id`, server-side merge; opt-in client `js/sync.js` |
| Cross-browser (Chrome / Firefox / Edge) | No exotic APIs; feature-guarded `ResizeObserver`, `IntersectionObserver`, Web Animations; vendor-prefixed range-input styling for both engines |

---

## 4. The physics inside each simulation

| Sim | Governing equations implemented |
|---|---|
| Coulomb bench | F = k\|q₁q₂\|/r²; superposition for the midpoint field E = Σ kqᵢr̂/rᵢ² |
| Field explorer | E(P) = Σ kqᵢ(P−rᵢ)/\|P−rᵢ\|³; field lines integrated along Ê with a fixed pixel step |
| Ohm bench | I = V/R; P = VI = I²R = V²/R; I–V line of gradient 1/R |
| Circuit builder | R<sub>eq</sub> = ΣRᵢ (series), 1/R<sub>eq</sub> = Σ1/Rᵢ (parallel), R₁+(R₂R₃)/(R₂+R₃) (combo); Kirchhoff's laws; P = I²R per element |
| Magnet lab | B(P) = (μ₀/4π) Σ q<sub>m,i</sub> r̂/r² two-pole dipole model (stated openly in the UI as a drawing model) |
| Lorentz lab | F = qv×B; r = mv/(\|q\|B); T = 2πm/(\|q\|B); exact circular solution p(t) = c + Rot(Ωt)(p₀−c) with Ω = −qB<sub>z</sub>/m |
| Induction | Φ(z) = μ₀ma²/[2(a²+z²)^{3/2}]; λ = NΦ; EMF = −N·dΦ/dz·v; I = EMF/R; P = EMF²/R |

The induction simulation differentiates Φ **analytically** and integrates the magnet's motion in
2 ms sub-steps, so the displayed EMF is exact and never undersamples the narrow peak at
z = ±a/2. The double-peak, zero-crossing-at-centre signature of a real search coil falls out of
the maths rather than being scripted.

---

## 5. Optional progress-sync server

The website never requires it. When you want progress to follow a student between machines:

```bash
npm install                 # express + mysql2 (server only; jsdom is for tests)
npm run server              # http://localhost:8080  (also serves the site)
```

* **Zero config:** with no database environment variables the server stores records in
  `server/data/progress.json` and reports `"driver": "json-file"` on `/api/health`.
* **MySQL:** set `MYSQL_URL=mysql://user:pass@host/emc_lab` (or `DB_HOST`, `DB_PORT`, `DB_USER`,
  `DB_PASS`, `DB_NAME`). The `progress` table is created automatically; `server/schema.sql`
  contains the manual script including a least-privilege user.
* **API:** `GET /api/health` · `GET /api/progress/:id` · `PUT /api/progress/:id`. Merging is
  done on both client and server: topic union, max score, concatenated de-duplicated history.
* **Client:** progress is local-only until the user presses **Connect…** on the home dashboard.
  The client then probes `/api/health`, merges, and mirrors every change (debounced 800 ms).
  On `file://` sync is unavailable and the panel says so. Ids are random anonymous tokens.
* **Test:** `npm run test:server` boots the server and asserts the whole contract (14 checks).

---

## 6. Using Bun (optional — faster serving, same code)

The project is **runtime-agnostic**: every server and tool runs on plain Node *or* on
[Bun](https://bun.sh). Nothing in the assignment requires or forbids either; Bun is purely a
deployment/performance choice, and the graded artefact (the static website) is identical bytes
in both cases.

```bash
bun install              # drop-in replacement for npm install (much faster)
npm run server:bun       # Bun.serve flavour:  bun run server/bun-server.js
npm run test:server:bun  # the same 14 API assertions against the Bun server
npm run bench            # head-to-head static-serving benchmark
bun tools/check-links.mjs  # the validators run on Bun too
```

Measured on the development sandbox (`npm run bench`, 1200 mixed HTML/JS/CSS requests at
concurrency 30 — your numbers will differ):

| runtime | req/s | p50 | p95 | p99 |
|---|---|---|---|---|
| node + express | 486 | 71.5 ms | 97.3 ms | 169.3 ms |
| **bun.serve** | **945** | **22.8 ms** | **63.9 ms** | **76.5 ms** |

Both servers share one implementation (`server/lib.js`), so the API, merge rules and cache
policy can never drift between runtimes.

### What Bun does *not* change
Bun runs on **your machine**, not in the visitor's browser. The browser executes the same
HTML/CSS/JS either way, so client-side speed is unaffected by the runtime choice. The things
that actually make the site fast in the browser are already in place:

* both servers send cache headers — HTML revalidates (`no-cache`), assets cache for 1 h;
* p5.js and Chart.js load **only on the pages that use them**, and never block the fallbacks;
* every simulation canvas **pauses its rAF loop off-screen** and sub-steps its physics instead
  of burning frames;
* DOM readouts are memoised (no per-frame `innerHTML` thrash) and sync writes are debounced;
* if a CDN is blocked, the fallbacks kick in immediately instead of stalling on a timeout.

---

## 7. Hosting on Vercel

Yes — and it is a two-minute job, because the site is plain static files.

**GUI route**
1. Push this folder to GitHub/GitLab.
2. Vercel → *Add New… → Project* → import the repo.
3. Framework preset: **Other** (no build command, no output directory needed — Vercel serves
   the repo root, where `index.html` lives). Deploy.

**CLI route**
```bash
npx vercel            # preview deployment
npx vercel --prod     # production
```

What you get from the bundled `vercel.json`:
* cache headers — everything under `/css/` and `/js/` is served `public, max-age=3600`;
  HTML needs no rule because Vercel's default for it is already `must-revalidate`.
  (Vercel `source` patterns are not full regex: no `(a|b)` alternation and no `?`
  quantifiers — simple per-folder wildcards are the supported idiom.)
* the optional sync API as **serverless functions**: `api/health.js` and `api/progress/[id].js`,
  which reuse `server/lib.js`, so the contract is identical to the bundled Node/Bun servers and
  `js/sync.js` works unchanged (same-origin `/api/...`).

One Vercel-specific rule: serverless filesystems are ephemeral, so the JSON-file driver is
refused there. **Sync on Vercel needs a MySQL connection string** in
*Project → Settings → Environment Variables* (`MYSQL_URL`, or `DB_HOST/DB_USER/DB_PASS/DB_NAME`,
e.g. a free serverless MySQL). Without it `/api/health` answers 503 and the website silently
stays in local-only mode — verified by `npm run test:vercel`.

If you do not need cross-machine sync, deploy as-is and ignore the `api/` folder entirely; the
static site is 100 % of the graded artefact.

---

## 8. Tailwind: how it is wired (and how to see it)

Tailwind **is** the styling system — it just shares the stage with two other layers, which is
why a first look at `css/` can be misleading:

| Layer | File / tag | Role |
|---|---|---|
| 1 · Tailwind utilities | `<script src="https://cdn.tailwindcss.com">` in every `<head>` + inline `tailwind.config` | layout primitives written straight in the markup: `grid grid-cols-1 md:grid-cols-2 gap-4`, `flex items-center justify-between`, `text-sm`, `mt-6`, `rounded-xl`, … |
| 2 · Component design system | `css/styles.css` | the *look*: dark lab theme, panels, sliders, readouts, quiz cards, progress ring. Deliberately semantic (`.panel`, `.ctl`, `.q-card`) so the design lives in one reviewed file |
| 3 · Offline mirror | `css/tailwind-fallback.css` | a value-for-value copy of exactly the utilities layer 1 uses, so a blocked CDN (offline, `file://`, strict CSP) cannot break the layout |

Proof it is live: `node tools/check-links.mjs` prints
`Tailwind utilities . 18 used, 18 covered offline`; in DevTools, any element with
`md:grid-cols-2` shows its computed grid coming from the `<style>` tag the Play CDN injects;
and blocking the CDN leaves the page pixel-identical because layer 3 takes over.

**Production variant (optional).** The Play CDN compiles in the browser and logs a warning on
production domains. For Vercel/Netlify you can compile the same utilities once instead:

```bash
npm run build:css          # tailwindcss CLI -> css/tailwind.generated.css (minified, ~7 kB)
node tools/switch-css.mjs built   # repoint the six pages (drops the CDN + fallback sheet)
node tools/switch-css.mjs cdn     # ...and back to the CDN default (assignment requirement)
```

Both modes were rendered in a browser with **every external request blocked** and produced the
same layout (2-column topic grid, correct type scale, zero console errors). The repo ships in
`cdn` mode because the brief asks for Tailwind *via CDN*.

---

## 9. Engineering notes

* **Visual design policy — "chiikawa official, but dark and minimal".** The layout language is
  borrowed from chiikawaofficial.com and translated, not copied: one calm centred column,
  sections separated by space instead of rules, sticker-like cards with thick soft outlines and
  large radii, pill buttons, and a small bobbing mascot ("Denki-chan") that appears in the hero,
  above each topic title, and as the brand mark. The palette is a warm charcoal base with the
  reference site's own candy pastels (pink `#f8aebe`, lilac `#d5b8d8`, green `#b5d777`,
  blue `#a8d3e0`, yellow `#f6d36b`) used sparingly as the only accents. Typography uses the same
  two families the reference loads — **Cabin** for body/nav and **Open Sans** for headings —
  via Google Fonts, falling back to system faces offline. Motion is limited to the mascot's bob
  and soft hover lifts; there is no blur, glass, gradient, glow or scroll animation anywhere.
  Simulations and SVG figures sit on flat near-black plates, like lab instruments.
* **Equations are real LaTeX.** Every displayed equation carries its source in a `data-tex`
  attribute and is typeset at boot by **KaTeX** (CDN): `F = k\,\frac{|q_1q_2|}{r^2}`,
  `\mathcal{E} = -N\,\frac{d\Phi}{dt}`, and so on — 19 display equations plus the home-page
  formula table (inline mode). If the KaTeX CDN is unreachable, each element keeps its
  hand-readable plain-text fallback, so nothing ever shows raw TeX or empty boxes.
* **Styling.** Tailwind is loaded from `https://cdn.tailwindcss.com` as required, and is used for
  layout utilities in the markup. All component design (panels, cards, sliders, readouts, quiz)
  lives in `css/styles.css`, which is linked *after* the CDN script so its class selectors win
  over Tailwind's Preflight. `css/tailwind-fallback.css` re-declares exactly the utility classes
  the markup uses with Tailwind's own values, so the layout is pixel-identical with or without
  the CDN — offline, on `file://`, or behind a blocking CSP. `node tools/check-links.mjs`
  reports any utility used but not covered.
* **Canvas engine.** `EMC.Stage` (`js/common.js`) wraps each `<canvas>`: device-pixel-ratio
  scaling, resize observation, an auto-pausing `requestAnimationFrame` loop, and unified
  pointer events (mouse + touch + pen) with pointer capture for drags. Render functions draw in
  CSS pixels only.
* **Number formatting.** `EMC.eng()` formats to 3 significant figures with a single SI prefix
  (femto…tera, exponential outside that range); `EMC.unit()` joins the unit without a break so
  "399 mN" can never wrap. Prefixes are never stacked (no "µmWb").
* **Robustness.** `localStorage` access is wrapped and falls back to memory; every optional DOM
  lookup is guarded so a page without a given simulation still boots; `scrollIntoView`,
  `Element.animate`, `ResizeObserver` and `IntersectionObserver` are feature-detected.
* **Accessibility.** Skip link, landmark regions, one `<h1>` per page, labelled canvases
  (`role="img"` + `aria-label`), `radiogroup`/`radio` semantics with arrow-key support in the
  quiz, `aria-pressed` toggles, visible focus rings, `prefers-reduced-motion` support, and
  print styles that hide the interactive chrome.
* **No tracking, no backend.** The only persistent state is one `localStorage` key
  (`emc.progress.v1`) in the user's own browser.

---

## 10. Developer commands

```bash
npm install          # dev/server deps: jsdom (tests), express + mysql2 (optional server)
npm run check        # static validation: links, ids, data-hooks, CSS coverage
npm test             # 177 runtime assertions across all six pages (skips politely
                     # if jsdom is absent)
npm run test:server  # boots the sync server and asserts the API contract
npm run test:server:bun  # same contract against the Bun server
npm run server       # optional Express + MySQL/JSON progress server on :8080
npm run server:bun   # same server on Bun.serve (faster; see §6)
npm run bench        # node-vs-bun serving benchmark
npm run build:css    # optional: compile Tailwind utilities statically
npm run switch:built # optional: point pages at the compiled CSS
npm run switch:cdn   # back to the CDN default
npm run test:vercel  # contract test for the api/ serverless functions
```

The website itself still has **zero required dependencies**: every CDN library (Tailwind,
Chart.js, p5.js) has a tested fallback, and the server is purely additive.

---

## 11. Browser support

Tested in headless Chrome 148 (see `TESTING.md`); the code targets and is expected to work in:

| Browser | Minimum version | Notes |
|---|---|---|
| Chrome | 100 | primary test target |
| Edge | 100 | same engine as Chrome |
| Firefox | 100 | `::-moz-range-*` slider styling provided |
| Safari | 15.4 | `color-mix()` has a `@supports` fallback |

---

## 12. Licence and credits

Educational use. Physics content follows the standard calculus-based texts
(Halliday/Resnick/Walker; Serway; Young & Freedman). Constants are CODATA 2018 values.
