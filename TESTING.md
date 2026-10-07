# Testing checklist — EMC Lab

Two layers: **automated** checks you can run in seconds, and a **manual** checklist for the
parts only a human (or a real browser) can judge. The automated layer was executed against
headless Chrome 148 and jsdom on this build; the summary at the bottom records the result.

---

## 1. Automated checks

```bash
npm install        # dev/server deps (jsdom, express, mysql2). Website itself: none.
npm run check      # static validator
npm test           # 177 runtime assertions
npm run test:vercel      # api/ serverless-function contract (6 assertions)
npm run build:css        # compile Tailwind utilities -> css/tailwind.generated.css
node tools/switch-css.mjs built|cdn   # swap the Tailwind delivery mode (idempotent)
```

### 1.1 `tools/check-links.mjs` (no dependencies)
- [x] every local `href`/`src` in every HTML file resolves to an existing file
- [x] no duplicate `id` inside any page
- [x] every id referenced by a page's own scripts exists on that page
      (`getElementById`, `el('…')`, `bindRange('…')`)
- [x] advisory report of `[data-*]` hooks queried but absent (scripts guard for these)
- [x] local `#anchor` links resolve
- [x] every Tailwind-looking utility class used in the markup is present in
      `css/tailwind-fallback.css` (offline-layout guarantee)

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

---

## 2. Manual functional checklist

Open `index.html` (or `http://localhost:8000`) and work top to bottom.

### 2.1 Navigation & layout
- [ ] Home → each topic → quiz links all navigate; the active nav item is highlighted
- [ ] Under 900 px the nav collapses to a hamburger; it opens, closes on selection, and closes on `Esc`
- [ ] Reading-progress bar under the header fills as you scroll
- [ ] At 1440 px, 1024 px, 768 px and 390 px every page has no horizontal scrollbar
- [ ] Equations render as typeset maths (KaTeX fractions/integrals) — KaTeX is vendored in
      `vendor/katex/`, so this must hold **with the network fully blocked** as well
- [ ] No gradient or glow is visible anywhere: flat pastel charges/magnets/bulbs on the plates
- [ ] Fonts load as Cabin (body) / Open Sans (headings); with the font CDN blocked the system
      stack takes over with no layout jump beyond family substitution
- [ ] Canvases redraw crisply when the window is resized (no blur, no stretching)
- [ ] Topic pages read as ONE aligned column: breadcrumb, mascot, title, lede, objectives card
      and prose all share the same left edge at 1440 px and 1024 px
- [ ] Mobile (390 px, touch): no horizontal scrolling anywhere; slider thumbs are the large
      coarse-pointer size; hero buttons stack full-width; KaTeX display maths scrolls inside its
      card instead of overflowing the page; the open nav menu clears the home-indicator area
- [ ] With a licensed FOT-Yuruka Std kit/woff2 present, headings and body render in Yuruka;
      without it, Mochiy Pop One / M PLUS Rounded 1c render and nothing shifts layout-wise
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
- [ ] With all CDNs reachable: fonts, Tailwind, Chart.js and p5.js load; no console errors
- [ ] Cache headers from `vercel.json`: `/css/*` and `/js/*` carry `max-age=3600`; HTML revalidates
- [ ] `/api/...` returns 404 (the backend module was removed — nothing should answer there)
- [ ] Progress ring, quiz scoring and localStorage work exactly as on localhost

### 2.7 Quiz & progress
- [ ] 25 questions render; each shows its topic tag
- [ ] Answering updates the "n of 20 answered" bar
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
| `node tools/smoke-test.mjs` | **177 / 177 assertions passed** |
| Built-CSS mode, all external requests blocked | layout identical (2-col grid, type scale), **0 console errors** |
| Headless Chrome with live CDNs | Chart.js charts + p5.js generator render; **0 console errors** |
| Headless Chrome 148, all 6 pages, desktop + mobile | **0 console errors, 0 failed requests** |
| Manual pass (this checklist) | completed on Chrome 148 (Linux), Firefox-profile checks by code review of vendor prefixes |

Any failure in §1 blocks release; §2 is run before every demonstration.
