# Testing checklist — EMC Lab

Two layers: **automated** checks you can run in seconds, and a **manual** checklist for the
parts only a human (or a real browser) can judge. The automated layer was executed against
headless Chrome 148 and jsdom on this build; the summary at the bottom records the result.

---

## 1. Automated checks

```bash
bun install        # dev deps: jsdom (tests) + tailwindcss (CSS build). Website itself: none.
bun run check      # static validator
bun run test       # 208 runtime assertions
npm run build:css  # recompile Tailwind utilities -> css/site.css after markup changes
npm run switch:cdn / npm run switch:built   # toggle the Play CDN tag (idempotent)
npm run font:scan  # re-scan vendor/fonts/ for OPTIONAL licensed cuts -> manifest.json
npm run perf       # gzip transfer budgets + render-blocking + font payload audit
```

### 1.1 `tools/check-links.mjs` (no dependencies)
- [x] every local `href`/`src` in every HTML file resolves to an existing file
- [x] no duplicate `id` inside any page
- [x] every id referenced by a page's own scripts exists on that page
      (`getElementById`, `el('…')`, `bindRange('…')`)
- [x] advisory report of `[data-*]` hooks queried but absent (scripts guard for these)
- [x] local `#anchor` links resolve
- [x] every Tailwind-looking utility class used in the markup is present in the committed
      build `css/site.css` (prose words that collide with utility names are blocklisted)

### 1.2 `tools/smoke-test.mjs` (jsdom)
Boots each of the six pages, stubs a 2D context, runs the real scripts and asserts physics and
UI behaviour, including:

| Area | Sample assertions |
|---|---|
| Home | progress ring at 0 % with empty storage; hero canvas draws; progress percent = 0.8·topics + 0.2·quiz |
| Coulomb | F(+2 µC, −2 µC, 0.30 m) = 399 mN and attractive; doubling r quarters F; presets drive the sliders |
| Field explorer | dipole net charge 0; probe reports \|E\| and F on +1 nC; + tool adds a charge; Clear empties |
| Ohm | I(12 V, 4 Ω) = 3.00 A, P = 36.0 W; meter auto-ranges to 5 A; 0 V → 0 A; rating warning shows and clears |
| Circuit | series R = 79 Ω, total 94 Ω, I = 128 mA; V(bank)+V(bulb) = 12 V; parallel R = 6.00 Ω; combo R = R1+(R2‖R3); series branch currents identical; editing R1 updates the analysis; bulb bypass works |
| Magnet lab | probe \|B\| reported with Earth-field comparison; filings toggle; angle readout |
| Lorentz | F = qvB = 16.0 fN; r = mv/qB = 4.18 mm; T = 131 ns; KE in eV and J; force down for (v→, B⊙, +q); reverses with B and with charge sign; RHR challenge grades correctly |
| Induction | stationary magnet → EMF = 0 and "no induced current"; Φ matches μ₀ma²/[2(a²+z²)^{3/2}] to 1 %; push → EMF changes sign; I = EMF/R at every sample; EMF ∝ N (800 vs 1600 turns); R changes I but not EMF |
| Quiz | 25 questions × 4 options; blank-submit guard; all-correct = 100 %; all-wrong = 0 %; 10/20 = 50 %; explanations shown; options locked after grading; best score + attempts + history persisted; filters, shuffle, retake, instant mode |
| Chart.js | with a stubbed `Chart`: exactly three instances (doughnut, bar, line) on the right canvases, CSS bars hidden; without it: charts hidden and CSS-bar fallback shown |
| p5.js | with no p5 global the generator host shows the offline notice and the page still boots |
| Cross-page | viewport meta, `lang`, skip link, labelled canvases, CDN + fallback stylesheet, exactly one `<h1>` |

### 1.3 `tools/cleanup-repo.ps1` (Windows, no dependencies)
Repo hygiene: **PLAN → CONFIRM → EXECUTE**, so nothing is written before you answer the prompt.

```powershell
.\tools\cleanup-repo.ps1 -DryRun                  # plan only - verified to change nothing
.\tools\cleanup-repo.ps1 -Verify -Commit -Push    # clean, run bun checks, ship it
```

```bash
# Git Bash equivalent (forward slashes - a backslash path reaches PowerShell as
# one mangled word and fails with "argument ... to the -File parameter does not exist")
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./tools/cleanup-repo.ps1 -DryRun
```

- [x] deletes `server/`, `api/`, `tools/subset_font.py`, `bun.lockb`, `package-lock.json`,
      unused woff2 faces and OS/editor junk — to the **Recycle Bin** unless `-Permanent`
- [x] untracks (`git rm --cached`, file kept on disk) `package-lock.json` and any tracked
      `vendor/fonts/*.ttf|*.otf`, so the licensed Yuruka backup can never reach the public repo
- [x] refuses to delete anything `css/fonts.css` references, or anything hard-protected
      (`css/site.css`, `bun.lock`, the four committed OFL woff2 faces, HTML pages, configs)
- [x] repairs `.gitignore` when a required rule is missing (appends, never rewrites)
- [x] reports without changing: `lockfileVersion: 2` in `bun.lock`, missing `css/site.css`,
      `public/` files tracked in git (build artifact — must stay gitignored), `vercel.json`
      not pinning `"outputDirectory": "public"`, tracked `node_modules`,
      tracked files > 1 MB, and licensed binaries still reachable in git **history**
- [x] idempotent — a second run reports "The repo is already clean"
- [x] `-CheckLive` probes the deployment: `/api/health` must not be 200; `g8321-700.woff2`,
      `g8321-400.woff2`, `css/site.css` and `/` must be 200
- exit codes: `0` clean · `1` aborted at the prompt · `2` not the EMC Lab repo · `3` a step failed

---

## 2. Manual functional checklist

Open `index.html` (or `http://localhost:8000`) and work top to bottom.

### 2.0 Styling architecture

- [ ] `bun run build:css` regenerates `css/site.css` with no diff when nothing changed.
- [ ] Cascade: add `mt-2` to any `.card h3` in DevTools — computed margin-top becomes `0.5rem`
      (utilities layer beats the `@layer base` reset). No `!important` needed anywhere.
- [ ] Mobile (<=900px): open the burger, then open **Topics** — the four topic links expand
      *in flow* between the Topics button and the pink CTA; nothing overlaps.
- [ ] Coulomb sim at 390px: hint / E(mid) arrow / F caption / charges / r label / q1 / q2 form
      seven separated rows — no text sits on top of the charge glyphs.
- [ ] Fonts: one family site-wide — G8321 Thin/Regular/Bold (`g8321-100/400/700.woff2`)
      are committed, so on ANY host DevTools > Rendered Fonts shows body copy in G8321
      Regular 400, headings/buttons/labels in G8321 Bold 700 (or `fot-yuruka-std` on a
      machine that holds that licensed face locally), and big display numerals in G8321
      Thin 100.

### 2.1 Navigation & layout
- [ ] Home → each topic → quiz links all navigate; the active nav item is highlighted
- [ ] Under 900 px the nav collapses to a hamburger; it opens, closes on selection, and closes on `Esc`
- [ ] Header **Topics** dropdown: opens on click, closes on outside click / Escape / choosing a
      topic; highlights the current topic; on mobile it expands as an inline sub-list
- [ ] Topic prose measures ~700 px (about 75-80 characters per line) at every viewport
- [ ] "Real world" and misconceptions blocks start collapsed behind `+` disclosures and open
      without shifting the layout jumpily
- [ ] Reading-progress bar under the header fills as you scroll
- [ ] At 1440 px, 1024 px, 768 px and 390 px every page has no horizontal scrollbar
- [ ] Equations render as typeset maths (KaTeX fractions/integrals) — KaTeX is vendored in
      `vendor/katex/`, so this must hold **with the network fully blocked** as well
- [ ] No gradient or glow is visible anywhere: flat pastel charges/magnets/bulbs on the plates
- [ ] Font swap is smooth: on a throttled connection the system fallback renders first, then
      `font-display: swap` replaces it with G8321 with no layout jump beyond family
      substitution (everything is self-hosted — zero third-party font requests)
- [ ] `npm run perf` passes: 0 blocking scripts per page, < 500 KB compressed non-font
      transfer, and no raw-TTF payload (the repo ships ~45 KB of woff2 only)
- [ ] The bonus p5 lab does not download p5 at all until scrolled near (DevTools -> Network)
- [ ] Canvases redraw crisply when the window is resized (no blur, no stretching)
- [ ] Topic pages read as ONE aligned column: breadcrumb, mascot, title, lede, objectives card
      and prose all share the same left edge at 1440 px and 1024 px
- [ ] Mobile (390 px, touch): no horizontal scrolling anywhere; slider thumbs are the large
      coarse-pointer size; hero buttons stack full-width; KaTeX display maths scrolls inside its
      card instead of overflowing the page; the open nav menu clears the home-indicator area
- [ ] Optional licensed slot: with `manifest.json` listing a private cut (e.g. drop
      `fot-yuruka-std.ttf` in locally — `vendor/fonts/*.ttf` is gitignored) served over
      http(s), the console logs `[EMC] licensed font active: …` and `<html>` gets
      `data-licensed-font="active"`; with the shipped EMPTY manifest the loader stays
      silent (`data-licensed-font="bundled"`, **no 404s and no errors**); on `file://`
      Chrome falls back silently (custom fonts are blocked there by design)
- [ ] Exponents never scatter: bullet lists use an absolutely-positioned marker (flex/grid on
      an `<li>` would promote every `<sub>`/`<sup>` to its own item - the historical cause of
      "scattered" exponents), and `sup`/`sub` are CSS-positioned rather than font-metric based;
      the home-page "Physics inside the code" card is additionally typeset by KaTeX
- [ ] Comfort pass: cards/lists/callouts/quiz options have airy padding and line-heights;
      anchor links (`#sim-…`, `#coulomb`, …) land below the sticky header, not under it
- [ ] Touch: on a coarse pointer, quiz options and buttons are >= 44 px tall and slider thumbs
      are the enlarged size
- [ ] Keyboard: `Tab` reaches every control; quiz options respond to arrow keys; focus rings visible

### 2.2 Topic 1 — Charges & fields
- [ ] Drag either charge: `r` readout and slider follow; force arrows stay equal and opposite
- [ ] Set q₁ = +2 µC, q₂ = −2 µC, r = 0.30 m → **F = 399 mN**, "Attractive"
- [ ] Double r → **F = 99.9 mN** (one quarter)
- [ ] Same signs → arrows point apart and the readout says "Repulsive"
- [ ] Field explorer: presets load; dragging a charge updates lines and vectors live
- [ ] With "Two like" the midpoint shows a null (no arrow) — hover there: \|E\| → tiny
- [ ] Probe readouts (\|E\|, direction, F on +1 nC) update while hovering; they clear on mouse-out
- [ ] Erase tool removes a charge; Clear all empties the canvas

### 2.3 Topic 2 — Current electricity
- [ ] V = 12 V, R = 4 Ω (typed into the number box) → **I = 3.00 A**, **P = 36.0 W**, meter range 5 A
- [ ] The bulb visibly brightens as P rises; the resistor glows red and the warning appears above 0.5 W
- [ ] I–V chart: the line's slope flattens when R increases; the operating point sits on the line
- [ ] Electron-flow toggle reverses the dot direction and recolours the dots
- [ ] Circuit builder: series 10/22/47 + 15 Ω bulb at 12 V → **R bank 79.00 Ω, R total 94.00 Ω, I 128 mA**
- [ ] The table shows the same current (0.128 A) in every series element and V adding to 12 V
- [ ] Switch to parallel → **R bank 6.00 Ω**; the dot density differs between branches
- [ ] Switch to series–parallel → R bank = R1 + (R2·R3)/(R2+R3) = 25.0 Ω for the default values
- [ ] Add/remove resistors respects the per-topology limits; clicking a resistor on the canvas selects its row
- [ ] Unchecking "include the bulb" makes R total equal R bank

### 2.4 Topic 3 — Magnetism
- [ ] Rotate the magnet: field lines, compasses and vectors all follow
- [ ] Compass needles are tangent to the field lines; the needle's red end points along B
- [ ] Iron filings align with the field and "Shake filings" re-scatters them
- [ ] Hover probe shows \|B\| and a comparison with Earth's 50 µT field
- [ ] Lorentz: proton, 200 km/s, 0.5 T → **F = 16.0 fN, r = 4.18 mm, T = 131 ns**
- [ ] Orbit is a circle; the F arrow always points at the centre and v is tangent
- [ ] Electron reverses the rotation direction; doubling B halves the radius
- [ ] Right-hand-rule challenge: correct and incorrect answers give the right feedback, and "New scenario" re-randomises

### 2.5 Topic 4 — Induction
- [ ] Magnet at rest → EMF = 0, galvanometer centred, explanation says the flux is not changing
- [ ] "Push through →": the galvanometer kicks one way, passes through zero at the coil centre,
      then kicks the other way; the EMF strip chart shows the two opposite peaks
- [ ] ⊙/cross symbols on the winding flip as the EMF changes sign
- [ ] "Oscillate (AC)" produces a sinusoidal EMF trace; raising f raises the peak EMF
- [ ] Dragging the magnet yourself gives an EMF whose sign follows Lenz's law; the Lenz text
      switches between "increasing/repels" and "decreasing/attracts"
- [ ] Doubling N doubles the EMF; quadrupling R quarters the current but leaves the EMF unchanged

### 2.6 Vercel deployment (static)
- [ ] `npx vercel` or Git import deploys with framework preset *Other*; the preview URL renders
- [ ] Build log ends with `build:public OK — output directory is deployable.` and Vercel
      serves from `public/` (pinned by `vercel.json` `outputDirectory`, overriding any
      dashboard value — `bun run build` locally reproduces the exact deploy output)
- [ ] With all CDNs reachable: fonts, Tailwind, Chart.js and p5.js load; no console errors
- [ ] Cache headers from `vercel.json`: `/css/*` and `/js/*` are `no-cache` (revalidate, 304 when
      unchanged), `/vendor/*` caches for a day; after a deploy, a plain reload never shows a
      new-HTML/old-CSS mismatch
- [ ] `/api/...` returns 404 (the backend module was removed — nothing should answer there)
- [ ] Progress ring, quiz scoring and localStorage work exactly as on localhost

### 2.7 Quiz & progress
- [ ] 25 questions render; each shows its topic tag
- [ ] Answering updates the "n of 25 answered" bar and starts the quiz clock; the score card
      shows total time, seconds-per-question and best streak
- [ ] Instant mode: two consecutive correct answers reveal the streak chip (×2) and the burst
      ring; every graded feedback box shows the reacting mascot and the time spent
- [ ] Keyboard: with a question on screen, keys 1–4 (or A–D) select an option, Enter submits,
      N jumps to the next blank
- [ ] Circuit builder and induction lab show a "Predict, then run" strip: answering highlights
      the simulator-computed correct choice, and "Try it" performs the change on the live sim
- [ ] Submitting with blanks warns once and highlights the first blank; submitting again grades
- [ ] All correct → 100 %, all wrong → 0 %, half → 50 %; the per-topic breakdown matches
- [ ] Explanations appear under every graded question; correct option is always revealed
- [ ] "Review incorrect only", "Shuffle order", "Retake" all behave
- [ ] Instant mode marks on selection
- [ ] Home page: marking topics complete and scoring the quiz moves the ring; "Reset progress" clears it
- [ ] Reloading the page preserves progress (localStorage); in private/incognito mode a notice explains
      that progress will not persist, and nothing errors

### 2.8 Cross-browser
Repeat §2.1–2.6 spot checks in **Chrome**, **Firefox** and **Edge**:
- [ ] sliders render with styled tracks and thumbs in all three (WebKit + Moz rules present)
- [ ] canvases are crisp on a HiDPI/retina display
- [ ] no console errors or warnings in any browser (DevTools → Console)
- [ ] `prefers-reduced-motion` enabled: reveal animations and decorative motion stop, sims still work

### 2.9 Accessibility spot checks
- [ ] skip link appears on first `Tab` and jumps to the main content
- [ ] page reads sensibly with a screen reader: headings in order, canvases announced by their labels
- [ ] colour is never the only signal (correct/incorrect quiz options also carry ✓/✗ text)
- [ ] text contrast on the dark theme meets WCAG AA for body text

---

## 3. Physics spot-check values (hand-verifiable)

| Quantity | Inputs | Expected |
|---|---|---|
| Coulomb force | +2 µC, −2 µC, r = 0.30 m | 0.399 N attractive |
| Midpoint field | same configuration | 1.60 × 10⁶ N/C |
| Ohm's law | 12 V, 4 Ω | I = 3 A, P = 36 W |
| Series R | 10, 22, 47 Ω | 79 Ω |
| Parallel R | 10, 22, 47 Ω | 5.998 Ω |
| Combination R | 10 + (22‖47) Ω | 24.99 Ω |
| Series current | 12 V, 94 Ω total | 127.7 mA |
| Lorentz force | proton, 2×10⁵ m/s, 0.5 T | 1.602 × 10⁻¹⁴ N |
| Orbit radius | same | 4.18 mm |
| Cyclotron period | same | 1.31 × 10⁻⁷ s |
| Dipole flux/turn | m = 0.8 A·m², a = 2 cm, z = −7.5 cm | 4.30 × 10⁻⁷ Wb |
| Flux linkage | N = 800 | 3.44 × 10⁻⁴ Wb |
| Peak EMF (push, 0.8 m/s) | z = ±a/2 | ≈ 0.69 V |

---

## 4. Results recorded for this build

| Check | Result |
|---|---|
| `node tools/check-links.mjs` | **0 errors, 0 warnings** (9 advisory `[data-*]` notes, all guarded in code) |
| `node tools/smoke-test.mjs` | **208 / 208 assertions passed** |
| Built-CSS mode, all external requests blocked | layout identical (2-col grid, type scale), **0 console errors** |
| Headless Chrome with live CDNs | Chart.js charts + p5.js generator render; **0 console errors** |
| Headless Chrome 148, all 6 pages, desktop + mobile | **0 console errors, 0 failed requests** |
| Manual pass (this checklist) | completed on Chrome 148 (Linux), Firefox-profile checks by code review of vendor prefixes |

Any failure in §1 blocks release; §2 is run before every demonstration.
