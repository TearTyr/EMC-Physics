/* ==========================================================================
   Simulation 1 — Coulomb's Law bench
   File: js/sim-coulomb.js   (used on topics/charges.html)

   PHYSICS
   -------
   F = k * |q1 * q2| / r^2        k = 8.988e9 N m^2 C^-2
   Like charges repel; opposite charges attract. The two force arrows are
   always equal in length and opposite in direction (Newton's third law).
   The field at the midpoint is found by vector superposition:
       E(P) = sum_i  k q_i (P - r_i) / |P - r_i|^3

   RENDERING / COORDINATES
   -----------------------
   Charge positions are stored as NORMALISED coordinates (0..1 of canvas
   width) and the canvas always represents the same physical width
   (SPAN_M metres). That way the computed physics never changes when the
   window is resized, and dragging a charge is stable (no feedback loop).
   ========================================================================== */
(function () {
  const canvas = document.getElementById('sim-coulomb');
  if (!canvas) return;                     // guard: page does not contain this sim

  const { CONST, clamp, arrow, label, chargeGlyph, eng, unit, bindRange } = EMC;
  const k = CONST.K;

  const SPAN_M = 1.20;                     // metres represented by the full canvas width
  const R_MIN = 0.02, R_MAX = 1.00;        // separation limits (must match the slider)

  /* ---- state ---------------------------------------------------------- */
  const state = {
    q1: 3,          // microcoulombs
    q2: -2,         // microcoulombs
    x1n: 0.30,      // normalised position of q1 (0 = left edge)
    x2n: 0.70,      // normalised position of q2
    showE: true,
    dragging: null  // 'q1' | 'q2' | null
  };

  /* ---- derived quantities --------------------------------------------- */
  const separation = () => Math.abs(state.x2n - state.x1n) * SPAN_M;

  function forceMagnitude() {
    const r = Math.max(separation(), 1e-4);
    return k * Math.abs((state.q1 * 1e-6) * (state.q2 * 1e-6)) / (r * r);
  }
  /** Signed net field at the midpoint; positive = pointing right (+x). [N/C] */
  function fieldAtMidpoint() {
    const r = Math.max(separation(), 1e-4);
    const d = r / 2;
    const q1 = state.q1 * 1e-6, q2 = state.q2 * 1e-6;
    // Midpoint lies to the RIGHT of q1 -> field of q1 points +x when q1 > 0.
    const e1 = k * q1 / (d * d);
    // Midpoint lies to the LEFT of q2 -> field of q2 points -x when q2 > 0.
    const e2 = -k * q2 / (d * d);
    return e1 + e2;
  }
  const chargeRadius = q => 13 + 9 * Math.cbrt(Math.abs(q) / 3);

  /**
   * Forces here can span 10^-9 N to 10^3 N, so arrow length uses a log scale.
   */
  function arrowLength(F, maxLen) {
    if (!(F > 0)) return 0;
    const n = clamp((Math.log10(F) + 9) / 12, 0, 1);
    return clamp(24 + n * maxLen, 24, maxLen + 24);
  }

  /* ---- rendering ------------------------------------------------------- */
  function render(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    const midY = h * 0.54;
    const x1 = w * state.x1n, x2 = w * state.x2n;
    const r1 = chargeRadius(state.q1), r2 = chargeRadius(state.q2);
    const r = separation();

    /* --- separation dimension line --- */
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,.55)';
    ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(x1, midY); ctx.lineTo(x2, midY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, midY - 10); ctx.lineTo(x1, midY + 10);
    ctx.moveTo(x2, midY - 10); ctx.lineTo(x2, midY + 10);
    ctx.stroke();
    ctx.restore();
    label(ctx, `r = ${r.toFixed(3)} m`, (x1 + x2) / 2, midY + 28, { color: '#cbd5e1', size: 12.5 });

    /* --- force arrows --- */
    const F = forceMagnitude();
    const maxLen = clamp(w * 0.16, 44, 120);
    const L = arrowLength(F, maxLen);
    const product = state.q1 * state.q2;
    const repel = product > 0, attract = product < 0;
    const col = repel ? '#f8aebe' : attract ? '#b5d777' : '#8b897f';

    if (product !== 0 && L > 0) {
      const dir1 = repel ? -1 : 1;           // direction of force ON q1
      const dir2 = -dir1;                    // equal and opposite on q2
      arrow(ctx, x1 + dir1 * (r1 + 4), midY, x1 + dir1 * (r1 + 4 + L), midY, { color: col, width: 4, head: 13 });
      arrow(ctx, x2 + dir2 * (r2 + 4), midY, x2 + dir2 * (r2 + 4 + L), midY, { color: col, width: 4, head: 13 });
      // One shared caption: per-arrow labels collide at small separations, and a
      // single label makes the Newton-III point ("same F on both") explicit.
      label(ctx, `F = ${unit(F, 'N', 3)} on each (equal & opposite)`, (x1 + x2) / 2, midY - 24,
        { color: col, size: 12, weight: '800' });
    }

    /* --- charges --- */
    chargeGlyph(ctx, x1, midY, r1, state.q1);
    chargeGlyph(ctx, x2, midY, r2, state.q2);
    label(ctx, `q1 = ${state.q1 > 0 ? '+' : ''}${state.q1.toFixed(1)} \u00B5C`,
      x1, midY + r1 + 24, { color: '#fac0cd', size: 12 });
    label(ctx, `q2 = ${state.q2 > 0 ? '+' : ''}${state.q2.toFixed(1)} \u00B5C`,
      x2, midY + r2 + 24, { color: '#cfe9f2', size: 12 });

    /* --- net field at the midpoint --- */
    if (state.showE && Math.abs(fieldAtMidpoint()) > 0) {
      const E = fieldAtMidpoint();
      const mx = (x1 + x2) / 2;
      const eLen = clamp(14 + (Math.log10(Math.abs(E)) + 6) * 9, 14, 60);
      const s = Math.sign(E);
      arrow(ctx, mx - s * eLen / 2, midY - 46, mx + s * eLen / 2, midY - 46,
        { color: '#f6d36b', width: 3, head: 10 });
      label(ctx, `E(mid) = ${unit(Math.abs(E), 'N/C', 2)}`, mx, midY - 70, { color: '#f6d36b', size: 11.5 });
    }

    label(ctx, 'Drag either charge to change r', w / 2, 18,
      { color: 'rgba(148,163,184,.7)', size: 11.5, weight: '500' });
  }

  const stage = new EMC.Stage(canvas, render);

  /* ---- readouts -------------------------------------------------------- */
  const out = {
    force: document.getElementById('coul-force'),
    nature: document.getElementById('coul-nature'),
    sub: document.getElementById('coul-substitution'),
    emid: document.getElementById('coul-emid'),
    rv: document.getElementById('coul-rv')
  };

  function updateReadouts() {
    const F = forceMagnitude();
    const { q1, q2 } = state;
    const r = separation();
    if (out.force) out.force.textContent = unit(F, 'N', 2);
    if (out.nature) {
      let txt, sub, cls;
      if (q1 === 0 || q2 === 0) { txt = 'None'; sub = 'one charge is zero'; cls = 'faint'; }
      else if (q1 * q2 > 0) { txt = 'Repulsive'; sub = 'like signs push apart'; cls = 'accent-rose'; }
      else { txt = 'Attractive'; sub = 'opposite signs pull together'; cls = 'accent-emerald'; }
      out.nature.textContent = txt;
      out.nature.className = 'stat-value ' + cls;
      const subEl = document.getElementById('coul-nature-sub');
      if (subEl) subEl.textContent = sub;
    }
    if (out.sub) {
      // innerHTML (not textContent) so the exponents can be real <sup> markup:
      // U+2079 etc. are missing from many fonts and would render as tofu.
      out.sub.innerHTML = `F = (8.99\u00D710<sup>9</sup>) \u00D7 |${(q1 * 1e-6).toExponential(1)} \u00D7 ${(q2 * 1e-6).toExponential(1)}| \u00F7 (${r.toFixed(3)})<sup>2</sup> = ${eng(F, 3)}\u00A0N`;
    }
    if (out.emid) out.emid.textContent = unit(Math.abs(fieldAtMidpoint()), 'N/C', 2);
    if (out.rv) out.rv.textContent = `${r.toFixed(3)} m`;
  }

  /** Keep the r slider in sync when the user drags a charge. */
  function syncSlider() {
    const s = document.getElementById('coul-r');
    if (s) s.value = String(clamp(separation(), R_MIN, R_MAX).toFixed(3));
  }

  function refresh() { stage.draw(); updateReadouts(); }

  /* ---- controls -------------------------------------------------------- */
  bindRange('coul-q1', 'coul-q1v', v => { state.q1 = v; refresh(); },
    v => `${v > 0 ? '+' : ''}${v.toFixed(1)} \u00B5C`);
  bindRange('coul-q2', 'coul-q2v', v => { state.q2 = v; refresh(); },
    v => `${v > 0 ? '+' : ''}${v.toFixed(1)} \u00B5C`);

  // The r slider moves BOTH charges symmetrically about their midpoint.
  bindRange('coul-r', null, v => {
    const mid = (state.x1n + state.x2n) / 2;
    const half = (clamp(v, R_MIN, R_MAX) / SPAN_M) / 2;
    state.x1n = clamp(mid - half, 0.035, 0.965);
    state.x2n = clamp(mid + half, 0.035, 0.965);
    refresh();
  });

  const eToggle = document.getElementById('coul-showE');
  if (eToggle) eToggle.addEventListener('change', () => { state.showE = eToggle.checked; refresh(); });

  // Presets: data-coul-preset="q1,q2,r"
  document.querySelectorAll('[data-coul-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.coulPreset.split(',').map(Number);
      if (p.length !== 3 || p.some(Number.isNaN)) return;
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) { el.value = String(val); el.dispatchEvent(new Event('input')); }
      };
      setVal('coul-q1', p[0]);
      setVal('coul-q2', p[1]);
      setVal('coul-r', p[2]);
      EMC.toast(`Preset: q1 = ${p[0]} \u00B5C, q2 = ${p[1]} \u00B5C, r = ${p[2]} m`);
    });
  });

  /* ---- drag interaction ------------------------------------------------ */
  stage.onPointer(p => {
    const midY = stage.h * 0.54;
    const x1 = stage.w * state.x1n, x2 = stage.w * state.x2n;
    if (p.type === 'down') {
      const hit1 = Math.hypot(p.x - x1, p.y - midY) < chargeRadius(state.q1) + 14;
      const hit2 = Math.hypot(p.x - x2, p.y - midY) < chargeRadius(state.q2) + 14;
      state.dragging = hit1 ? 'q1' : hit2 ? 'q2' : null;
      canvas.classList.toggle('grabbing', !!state.dragging);
    } else if (p.type === 'move' && state.dragging) {
      const xn = clamp(p.x / stage.w, 0.035, 0.965);
      if (state.dragging === 'q1') state.x1n = xn; else state.x2n = xn;
      // Enforce the separation limits by pushing the dragged charge back.
      let r = separation();
      if (r < R_MIN || r > R_MAX) {
        const other = state.dragging === 'q1' ? state.x2n : state.x1n;
        const dir = Math.sign(xn - other) || 1;
        const lim = clamp(r, R_MIN, R_MAX) / SPAN_M;
        const fixed = clamp(other + dir * lim, 0.035, 0.965);
        if (state.dragging === 'q1') state.x1n = fixed; else state.x2n = fixed;
      }
      syncSlider();
      refresh();
    } else if (p.type === 'up' || p.type === 'leave') {
      state.dragging = null;
      canvas.classList.remove('grabbing');
    }
  });

  syncSlider();
  refresh();
})();
