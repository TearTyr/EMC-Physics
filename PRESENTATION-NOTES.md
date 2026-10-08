# Presentation notes — EMC Lab interactive electromagnetics module

Companion notes for presenting the project: what the physics is, how each piece is implemented,
and a scripted live demo. Designed for a ~12 minute talk plus questions.

---

## Part 1 — The physics, in four movements

### 1. Charge and field (Topic 1)
*Charge* is a conserved, quantised property of matter (q = ne, e = 1.602×10⁻¹⁹ C). Charges
interact through Coulomb's law,

> **F = k·q₁q₂/r²**, k = 1/(4πε₀) = 8.988×10⁹ N·m²/C²

an inverse-square central force. Rather than "action at a distance", we say each charge creates
an **electric field**, **E = F/q₀**, and other charges respond to the field *where they are*.
Field lines are bookkeeping for E: they start on + charge, end on − charge, never cross, and
their density encodes magnitude. Superposition — adding the E vectors of every charge — is what
makes the field explorer's live tracing possible, and it is why the null point between two like
charges exists.

**Teaching hook in the sim:** drag the charges apart and watch the arrows shrink by 1/r²; the
two arrows are always equal and opposite (Newton III), even for +20 µC against −0.5 µC.

### 2. Current and resistance (Topic 2)
Current is charge in motion, I = ΔQ/Δt. In an ohmic material the drift response is linear,
giving **V = IR**, with power **P = VI = I²R = V²/R**. Networks reduce by two rules that follow
from charge and energy conservation (Kirchhoff): series shares current and adds voltage
(R adds), parallel shares voltage and adds current (conductances add).

**Teaching hook in the sim:** the circuit builder animates charge dots whose *density and speed*
are proportional to the local current, so the current splitting unevenly in a parallel bank is
something students *see*, and the table proves ΣV = V supply and ΣI = I total.

### 3. Magnetism (Topic 3)
All magnetism is moving charge. A bar magnet's field is a dipole field; its lines form **closed
loops** (∇·B = 0 — no monopoles), running N→S outside and S→N inside. A charge moving through B
feels **F = qv×B**, always perpendicular to v, so the force does **no work**: speed and kinetic
energy are untouched, and a charge with v ⊥ B travels a circle of

> **r = mv/(|q|B)**, **T = 2πm/(|q|B)**

Note that T is independent of v — the operating principle of the cyclotron. The right-hand rule
gives the direction; reverse it for electrons.

**Teaching hook in the sim:** flip proton → electron and the orbit reverses and shrinks by the
mass ratio; the RHR challenge turns the rule into a game with instant feedback.

### 4. Induction (Topic 4)
Faraday's discovery: a **changing** magnetic flux induces an EMF,

> **EMF = −N·dΦ/dt**, Φ = ∫B·dA = BA cosθ

and Lenz's law (the minus sign) says the induced current opposes the *change* that made it —
which is conservation of energy wearing a magnetic costume. Three levers change Φ: B, A or θ;
generators rotate θ. For a coil on the axis of a dipole magnet the flux has the closed form
**Φ(z) = μ₀ma²/[2(a²+z²)^{3/2}]**, which is exactly what the simulation evaluates — then
differentiates analytically. The consequence students remember: push the magnet through and the
EMF shows **two opposite peaks with a zero at the centre**, because flux is maximal (and
momentarily unchanging) exactly when the magnet is mid-coil.

**Teaching hook in the sim:** oscillate the magnet and the strip chart draws a clean sine wave —
a generator, in one interaction.

---

## Part 2 — Technical implementation

### Architecture
* **Six static pages**, one per topic plus home and quiz. Shared chrome (header, footer,
  progress) is plain markup; behaviour is shared through `js/common.js`.
* **The pages read as a plain tutorial, not a project report.** No course or module name, no
  "works everywhere / tested in" blurb, no build-step stats, no dev-doc links — the reading
  experience is a single centred article column: every page (home, topics, quiz) shares one
  1060 px content column, with blog-style air above every heading so one idea fills a
  screen at a time.
* **Static site, no framework, no backend.** Serve the folder (or open `index.html`). Tailwind
  is compiled at build time (`bun run build:css`) into `css/site.css`, so what ships is plain
  static HTML, CSS and JavaScript — identical bytes on `file://`, localhost or Vercel.
* **`EMC.Stage`** — a small canvas engine used by all seven simulations: HiDPI backing-store
  scaling, `ResizeObserver`-driven resizing, an rAF loop that pauses off-screen, and unified
  pointer input (mouse/touch/pen) with capture so drags keep working outside the canvas.
* **Physics is data, not decoration.** Each sim owns a `state` object and pure functions
  (`analyze()`, `compute()`, `fieldAt()`) that return SI values; render functions only draw what
  those functions return. This is why the readouts, the canvas and the tables can never disagree.
* **Library choices, and where each earns its place.** The seven core sims run on a tiny native
  Canvas 2D engine (zero dependencies, exact HiDPI control). **p5.js** powers the bonus AC-generator
  lab, where its instance mode and quick vector primitives shine. **Chart.js** renders the quiz
  analytics (doughnut, per-topic bars, attempt-history line). **Tailwind** handles layout
  utilities. Each of the three CDNs has a tested fallback, so the module still works with no
  network at all.
* **Formatting** goes through one formatter (`eng`/`unit`) that emits 3 significant figures with a
  single SI prefix — so the whole site reads like an instrument, and units never wrap or stack.
* **Progress** is one `localStorage` key with a memory fallback, wrapped so blocked storage can
  never throw.

### Decisions worth defending in Q&A
| Question | Answer |
|---|---|
| Where is p5.js, then? | In the bonus AC-generator lab on Topic 4, in instance mode so it pollutes no globals. The core sims stay on the native engine because they need exact HiDPI control and must work with no network; the generator shows the same physics in p5's idiom. |
| Can we host it on Vercel? | Trivially — it is a static site: import the repo, preset *Other*, and let `vercel.json` pin everything: `buildCommand` runs `bun run build` (Tailwind compile + `tools/build-public.mjs` assembling `public/`) and `outputDirectory: "public"` overrides any stale dashboard value, so every `git push` redeploys; cache headers are pinned there too. There is deliberately no backend: progress is localStorage-only, so nothing to configure, bill, or lose. |
| Is Tailwind actually being used? It doesn't look like it. | It is — it *is* the pipeline. `css/input.css` declares `@layer base / components / utilities` around the three `@tailwind` directives, and the CLI compiles everything into `css/site.css` (Vercel rebuilds it on deploy). Utilities in the markup sit in the top cascade layer, the sticker components in the middle, element resets at the bottom — which is exactly why `mt-2` wins over a heading reset without a single `!important`. |
| Can we run it on Bun? Is that allowed? | Yes and yes. Bun is the project's *package manager and task runner* — `bun install`, `bun run build:css`, `bun run test` — and a runtime, not a frontend framework. Visitors' browsers receive identical static bytes no matter which tool built them; the browser-side wins come from cache headers, per-page library loading and off-screen canvas pausing. (An optional progress-sync server existed early in development and was deliberately removed: progress is localStorage-only, so there is nothing to host, configure or bill.) |
| Why Chart.js only for the quiz? | Score analytics are exactly what Chart.js is for (doughnut/bars/line with legends and tooltips). The physics charts (I–V line, Φ/EMF strip chart) are drawn by the sims themselves so they stay in perfect sync with the simulation state and cost nothing extra. |
| Why analytic derivatives in the induction sim? | Finite differencing a sharply peaked Φ(z) at frame rate undersamples the peak and produces a jagged, frame-rate-dependent EMF. The analytic dΦ/dz is exact; motion is sub-stepped at 2 ms for smooth positions. |
| Why a two-pole model for the bar magnet? | It reproduces the true dipole field accurately *outside* the magnet and makes line tracing trivial. The UI says openly that monopoles are a drawing model — turning a simplification into a teaching point about ∇·B = 0. |
| Why is the animation slowed? | A proton in 0.5 T orbits in 131 ns. The Lorentz sim keeps the physically correct *direction and ratios* and prints the slow-down factor, so nothing is silently faked. |
| Why does submitting grade the whole bank even when filtered? | Filters are a revision aid; letting them shrink the denominator would make "100 %" meaningless. The UI states this next to the toolbar. |

### Testing strategy
Static validator (links, ids, data-hooks, CSS coverage) plus a jsdom harness with **217
assertions** that assert *physics* — e.g. F(+2 µC,−2 µC,0.30 m) = 399 mN, R(10‖22‖47) = 6.00 Ω,
Φ matches the closed form to 1 %, EMF ∝ N, I = EMF/R at every sample — and *behaviour*: quiz
scoring at 100/50/0 %, blank-submit guard, storage persistence. Plus a real headless-Chrome pass
over all six pages at desktop and mobile widths with zero console errors. See `TESTING.md`.

---

## Part 3 — Live demo script (~6 minutes)

1. **Home (30 s).** Point at the hero dipole animation ("the field lines are integrated live"),
   the topic cards and the progress ring at 0 %.
2. **Topic 1 (60 s).** Coulomb bench: drag the charges together — "inverse square, and Newton's
   third law in the equal arrows". Switch to the field explorer, load *Two like*, hover the
   midpoint: "the field is zero here — two vectors cancelling".
3. **Topic 2 (90 s).** Ohm bench: type R = 4 Ω at V = 12 V → 3.00 A; push P past the rating and
   show the warning. Circuit builder: switch series → parallel and narrate the bulb getting
   brighter *and* the dot density changing; point at the table row where branch currents sum to
   the total.
4. **Topic 3 (60 s).** Magnet lab: rotate the magnet with the compasses on; toggle filings.
   Lorentz: flip proton → electron; run the right-hand-rule challenge on the audience.
5. **Topic 4 (120 s).** Induction: magnet at rest — "a huge flux, zero EMF". Press *Push through*
   — narrate the galvanometer kick, the zero at the centre, the second kick, and the two peaks on
   the chart. Then *Oscillate*: "this sine wave is the entire electrical grid in miniature."
   Scroll to the **p5.js bonus lab**: the same law with the coil spinning instead of the magnet
   moving — double f and the peak doubles *and* the wave compresses.
6. **Quiz (75 s).** Answer two questions in instant mode, submit the rest, then walk across the
   score card: the grade band, the **Chart.js doughnut**, the per-topic bars ("magnetism is the
   weak spot — that's Topic 3 to revise"), and the attempt-history line. Finish on the home page
   ring having moved, and mention the optional sync server for lab courses.

**Fallback if the projector/venue has no internet:** everything still works; only the Tailwind
CDN is absent and the fallback stylesheet takes over with no visible difference.

---

## Part 4 — Likely audience questions

* **"Why does the EMF go to zero in the middle of the coil?"** Flux is maximal there; a maximum
  has zero derivative. dΦ/dt — not Φ — is what induction responds to.
* **"Does the resistance change the induced EMF?"** No: EMF = −N dΦ/dt is geometry and motion.
  R sets the current (I = EMF/R) and therefore the braking force and the heating.
* **"Why do field lines never cross, for either field?"** Two directions at one point would make
  the field multi-valued. Electric lines end on charge; magnetic lines close on themselves.
* **"Is the bulb ohmic in your circuit builder?"** It is modelled as ohmic and the tutorial says
  so, alongside the real caveat that a filament's R rises ~10× from cold to operating temperature.
* **"How fast is 'fast' for induction?"** Only dΦ/dt matters: the same flux change in half the
  time gives twice the EMF — doubling the magnet speed doubles the peaks but leaves the area
  under each peak (the flux change) untouched.

---

## Part 5 — References

* D. J. Griffiths, *Introduction to Electrodynamics*, 4th ed. — dipole flux and field models
* Halliday, Resnick & Walker, *Fundamentals of Physics* — topic sequencing and worked examples
* CODATA 2018 recommended values — e, mₑ, mₚ, μ₀, ε₀ as used in `js/common.js`
* MDN Web Docs — Canvas 2D, Pointer Events, `localStorage`, ARIA authoring practices
