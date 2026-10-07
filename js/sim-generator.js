/* ==========================================================================
   Bonus simulation — the AC generator, drawn with p5.js
   File: js/sim-generator.js   (used on topics/induction.html)

   WHY p5.js HERE
   --------------
   The six core simulations use the native Canvas 2D engine in common.js so
   that the module runs with zero dependencies. This bonus lab deliberately
   uses p5.js (loaded from a CDN on the page) to show the same physics in a
   second rendering style: a coil spinning in a uniform field, i.e. the
   "change theta" lever of Faraday's law.

   PHYSICS
   -------
   A coil of N turns and area A spins at angular frequency omega = 2*pi*f in
   a uniform field B, with theta = omega*t measured from the position where
   the flux is maximum:

       Phi(t)  = N B A cos(theta)
       EMF(t)  = -dPhi/dt = N B A omega sin(theta)      (a sine wave!)
       peak    = N B A omega

   This is every power station on Earth in one equation: mechanical rotation
   in, sinusoidal voltage out. With N=120, B=0.4 T, A=0.02 m^2, f=1.2 Hz the
   peak is about 7.2 V; real turbines simply use bigger N, B and f (50/60 Hz).

   DEGRADATION
   -----------
   If the p5 CDN is unreachable (offline, file://, strict CSP) the host shows
   a notice instead of a blank box; the rest of the page is unaffected.
   ========================================================================== */
(function () {
  const host = document.getElementById('p5-gen-host');
  if (!host) return;

  if (!window.p5) {
    host.innerHTML =
      '<div class="sim-note" style="margin:1rem">p5.js could not be loaded from the CDN, so the ' +
      'bonus generator lab is hidden. Everything else on this page \u2014 including the main ' +
      'magnet-through-a-coil simulation \u2014 works offline.</div>';
    return;
  }

  const { clamp, unit, fixed, bindRange } = EMC;

  const state = {
    N: 120,          // turns
    B: 0.40,         // tesla
    A: 0.02,         // coil area [m^2], fixed
    f: 1.2,          // rotation frequency [Hz]
    theta: 0,        // rad
    emfHist: [],     // scrolling trace
    phiHist: []
  };
  const OMEGA = () => 2 * Math.PI * state.f;
  const flux = () => state.N * state.B * state.A * Math.cos(state.theta);
  const emf = () => state.N * state.B * state.A * OMEGA() * Math.sin(state.theta);
  const peak = () => state.N * state.B * state.A * OMEGA();

  /* ---- DOM readouts (throttled: DOM writes at 60 fps are wasteful) ------ */
  const el = id => document.getElementById(id);
  let frame = 0;
  function updateDom() {
    if (el('gen-flux')) el('gen-flux').textContent = unit(flux(), 'Wb', 3);
    if (el('gen-emf')) el('gen-emf').textContent = unit(emf(), 'V', 3);
    if (el('gen-peak')) el('gen-peak').textContent = unit(peak(), 'V', 3);
    if (el('gen-omega')) el('gen-omega').textContent = `${fixed(OMEGA(), 2)} rad/s`;
  }

  /* ---- the p5 sketch (instance mode: no globals are polluted) ---------- */
  const sketch = (p) => {
    // fill the height the CSS grid gives us, but never collapse below 340 px
    let H = Math.max(340, Math.round(host.clientHeight || 340));

    p.setup = () => {
      const c = p.createCanvas(Math.max(320, host.clientWidth), H);
      c.parent(host);
      p.textFont('ui-monospace, Menlo, Consolas, monospace');
    };

    p.windowResized = () => {
      H = Math.max(340, Math.round(host.clientHeight || 340));
      p.resizeCanvas(Math.max(320, host.clientWidth), H);
    };

    /** circle-with-dot / circle-with-cross drawn as vectors (font-safe). */
    function currentSymbol(x, y, r, out) {
      p.push();
      p.noFill(); p.stroke(232, 238, 251, 230); p.strokeWeight(1.3);
      p.circle(x, y, r * 2);
      if (out) { p.noStroke(); p.fill(232, 238, 251, 230); p.circle(x, y, r * 0.7); }
      else {
        const d = r * 0.68;
        p.line(x - d, y - d, x + d, y + d);
        p.line(x + d, y - d, x - d, y + d);
      }
      p.pop();
    }

    function arrowH(x1, y, x2, col) {
      p.push();
      p.stroke(col); p.fill(col); p.strokeWeight(1.6);
      p.line(x1, y, x2, y);
      const s = Math.sign(x2 - x1) || 1;
      p.triangle(x2, y, x2 - s * 7, y - 4, x2 - s * 7, y + 4);
      p.pop();
    }

    p.draw = () => {
      p.clear();
      const w = p.width;
      const dt = p.deltaTime / 1000;
      state.theta = (state.theta + OMEGA() * clamp(dt, 0, 0.05)) % (Math.PI * 2);

      const e = emf(), phi = flux(), pk = Math.max(peak(), 1e-9);
      state.emfHist.push(e); if (state.emfHist.length > 260) state.emfHist.shift();
      state.phiHist.push(phi); if (state.phiHist.length > 260) state.phiHist.shift();

      /* ---------- left: the spinning coil ---------- */
      const cx = w * 0.26, cy = H * 0.5;
      const Hl = H * 0.52;                       // coil height
      const Wl = Math.min(w * 0.20, 150);        // coil full width
      const proj = Math.cos(state.theta);        // foreshortening

      // uniform B field, pointing right
      for (let i = -1; i <= 1; i++) {
        arrowH(cx - Wl * 1.15, cy + i * Hl * 0.42, cx + Wl * 1.15, p.color(167, 139, 250, 150));
      }
      p.noStroke(); p.fill(196, 181, 253, 200); p.textSize(11); p.textAlign(p.LEFT, p.TOP);
      p.text('B', cx + Wl * 1.15 + 6, cy - Hl * 0.42 - 6);

      // rotation axis
      p.push();
      p.stroke(148, 163, 184, 90); p.strokeWeight(1); p.drawingContext.setLineDash([4, 5]);
      p.line(cx, cy - Hl * 0.72, cx, cy + Hl * 0.72);
      p.drawingContext.setLineDash([]);
      p.pop();

      // the coil, foreshortened by cos(theta); the back edge is dimmer
      const halfW = (Wl / 2) * proj;
      const front = proj >= 0;
      p.push();
      p.strokeWeight(2.6);
      p.stroke(front ? p.color(34, 211, 238) : p.color(34, 211, 238, 110));
      p.line(cx + halfW, cy - Hl / 2, cx + halfW, cy + Hl / 2);
      p.stroke(front ? p.color(34, 211, 238, 110) : p.color(34, 211, 238));
      p.line(cx - halfW, cy - Hl / 2, cx - halfW, cy + Hl / 2);
      p.strokeWeight(2);
      p.stroke(34, 211, 238, 190);
      p.line(cx - halfW, cy - Hl / 2, cx + halfW, cy - Hl / 2);
      p.line(cx - halfW, cy + Hl / 2, cx + halfW, cy + Hl / 2);
      p.pop();

      // current direction in the two vertical sides (flips with the EMF sign)
      if (Math.abs(e) > pk * 0.02) {
        const ccw = e > 0;
        currentSymbol(cx + halfW, cy - Hl / 2, 5.5, ccw === front);
        currentSymbol(cx - halfW, cy - Hl / 2, 5.5, ccw !== front);
      }

      // live numbers on the canvas
      p.noStroke(); p.textSize(12); p.textAlign(p.LEFT, p.BOTTOM);
      p.fill(252, 211, 77); p.text(`EMF = ${unit(e, 'V', 3)}`, 12, H - 26);
      p.fill(103, 232, 249); p.text(`\u03A6 = ${unit(phi, 'Wb', 3)}`, 12, H - 10);
      p.fill(169, 186, 214); p.textAlign(p.RIGHT, p.TOP);
      p.text(`theta = ${fixed(state.theta * 180 / Math.PI, 0)}\u00B0`, cx + Wl * 1.15, 10);
      p.text(`${fixed(state.f, 1)} rev/s`, cx + Wl * 1.15, 26);

      /* ---------- right: the sine wave being generated ---------- */
      const gx = w * 0.52, gw = w * 0.44, gy = H * 0.5, gh = H * 0.34;
      p.push();
      p.stroke(148, 163, 184, 70); p.strokeWeight(1);
      p.line(gx, gy, gx + gw, gy);                       // zero line
      p.stroke(148, 163, 184, 35);
      p.line(gx, gy - gh, gx + gw, gy - gh);
      p.line(gx, gy + gh, gx + gw, gy + gh);
      p.pop();
      p.noStroke(); p.fill(169, 186, 214); p.textSize(10.5); p.textAlign(p.LEFT, p.BOTTOM);
      p.text('EMF(t) \u2014 a sine wave: the grid frequency', gx, gy - gh - 6);

      const n = state.emfHist.length;
      if (n > 1) {
        const scale = 1.15 * pk;
        p.push();
        p.noFill(); p.stroke(251, 191, 36); p.strokeWeight(2.2);
        p.beginShape();
        for (let i = 0; i < n; i++) {
          const x = gx + (i / 259) * gw;
          p.vertex(x, gy - (state.emfHist[i] / scale) * gh);
        }
        p.endShape();
        p.stroke(34, 211, 238, 160); p.strokeWeight(1.4);
        p.beginShape();
        for (let i = 0; i < n; i++) {
          const x = gx + (i / 259) * gw;
          p.vertex(x, gy - (state.phiHist[i] / (1.15 * Math.max(Math.abs(flux()), pk / (OMEGA() || 1)))) * gh * 0.5);
        }
        p.endShape();
        p.pop();
      }
      p.noStroke(); p.fill(103, 232, 249); p.textSize(10); p.textAlign(p.LEFT, p.TOP);
      p.text('\u03A6(t) (scaled)', gx, gy + gh + 4);

      if (++frame % 10 === 0) updateDom();
    };
  };

  new window.p5(sketch);

  /* ---- controls -------------------------------------------------------- */
  bindRange('gen-N', 'gen-Nv', v => { state.N = Math.round(v); updateDom(); }, v => `${Math.round(v)} turns`);
  bindRange('gen-B', 'gen-Bv', v => { state.B = v; updateDom(); }, v => `${fixed(v, 2)} T`);
  bindRange('gen-f', 'gen-fv', v => { state.f = v; updateDom(); }, v => `${fixed(v, 1)} Hz`);
  updateDom();
})();
