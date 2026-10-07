/* ==========================================================================
   Simulation 5 — Bar Magnet Field Visualiser
   File: js/sim-magnetfield.js   (used on topics/magnetism.html)

   PHYSICS
   -------
   Outside a bar magnet the field is very well approximated by two opposite
   "magnetic poles" +/- qm separated by the magnet length l, with dipole
   moment m = qm * l:

       B(P) = (mu0 / 4pi) * SUM_i  qm_i * (P - r_i) / |P - r_i|^3

   * Field lines leave the NORTH pole and enter the SOUTH pole (outside the
     magnet). Inside the magnet they run S -> N, so every line is a closed
     loop -- there are no magnetic monopoles. The two-pole picture is a
     MODEL used for drawing; the tutorial text says so explicitly.
   * The tangent to a field line gives the direction a compass needle points.
   * Line density (and arrow colour) represents field strength.

   Coordinates: physics axes are x-right / y-up; the canvas y axis points
   down, so every vector is drawn as (Bx, -By).
   ========================================================================== */
(function () {
  const canvas = document.getElementById('sim-magnet');
  if (!canvas) return;

  const { CONST, clamp, arrow, label, roundRect, eng, unit } = EMC;
  const MU0_4PI = CONST.MU0 / (4 * Math.PI);   // = 1e-7 T m / A
  const PX_PER_M = 1300;                       // canvas scale (magnet ~6 cm long)
  const L_MAG = 0.06;                          // magnet length [m]

  const state = {
    nx: 0.5, ny: 0.5,        // magnet centre, normalised canvas coords
    angleDeg: 0,             // 0 = N pointing right
    m: 0.6,                  // dipole moment [A m^2]
    show: { lines: true, compass: true, vectors: false, filings: false },
    lines: 16,
    probe: null,
    dragging: false
  };

  /* ---- deterministic "iron filings" scatter ---------------------------- */
  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  let filings = [];
  function makeFilings(seed = 7) {
    const rnd = seededRandom(seed);
    filings = [];
    for (let i = 0; i < 900; i++) filings.push({ nx: rnd(), ny: rnd(), jitter: (rnd() - 0.5) * 0.5 });
  }
  makeFilings();

  /* ---- field maths ----------------------------------------------------- */
  function geometry(w, h) {
    const cx = state.nx * w, cy = state.ny * h;
    const th = state.angleDeg * Math.PI / 180;
    const halfPx = (L_MAG / 2) * PX_PER_M;
    // physics axes: y up. Canvas y is down, hence the sign flip on sin().
    const ax = Math.cos(th), ay = Math.sin(th);
    return {
      cx, cy, th, halfPx,
      N: { x: cx + ax * halfPx, y: cy - ay * halfPx },   // canvas px
      S: { x: cx - ax * halfPx, y: cy + ay * halfPx }
    };
  }

  /** Magnetic flux density at canvas pixel (x,y). Returns physics-axis vector. */
  function fieldAt(x, y, g) {
    const qm = state.m / L_MAG;                          // pole strength [A m]
    const poles = [{ p: g.N, q: +qm }, { p: g.S, q: -qm }];
    let bx = 0, by = 0;
    for (const pole of poles) {
      const dxm = (x - pole.p.x) / PX_PER_M;
      const dym = (-(y - pole.p.y)) / PX_PER_M;          // convert to y-up
      const r2 = dxm * dxm + dym * dym;
      const r = Math.sqrt(r2);
      if (r < 1e-4) continue;
      const B = MU0_4PI * pole.q / r2;
      bx += B * dxm / r; by += B * dym / r;
    }
    return { bx, by, mag: Math.hypot(bx, by) };
  }

  /** Field expressed directly in canvas direction (y flipped) + magnitude. */
  function fieldCanvas(x, y, g) {
    const f = fieldAt(x, y, g);
    return { dx: f.bx, dy: -f.by, mag: f.mag };
  }

  function magColor(B) {
    // 1e-5 T (Earth) .. 1e-2 T mapped onto a colour ramp
    const n = clamp((Math.log10(Math.max(B, 1e-9)) + 5) / 3, 0, 1);
    const hue = 210 - n * 210;
    return `hsl(${hue.toFixed(0)} 92% ${56 + n * 10}%)`;
  }

  /* ---- layer painters -------------------------------------------------- */
  function drawFieldLines(ctx, w, h, g) {
    const step = 2.6, maxSteps = 1600;
    const poleR = Math.max(9, g.halfPx * 0.34);
    ctx.save();
    ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let i = 0; i < state.lines; i++) {
      const a = (i / state.lines) * Math.PI * 2;
      let x = g.N.x + Math.cos(a) * poleR * 0.85;
      let y = g.N.y + Math.sin(a) * poleR * 0.85;
      ctx.beginPath(); ctx.moveTo(x, y);
      let hitS = false;
      for (let s = 0; s < maxSteps; s++) {
        const f = fieldCanvas(x, y, g);
        if (f.mag < 1e-12) break;
        x += (f.dx / f.mag) * step;
        y += (f.dy / f.mag) * step;
        ctx.lineTo(x, y);
        if (x < -60 || x > w + 60 || y < -60 || y > h + 60) break;
        if (Math.hypot(x - g.S.x, y - g.S.y) < poleR * 0.7) { hitS = true; break; }
      }
      const grad = ctx.createLinearGradient(g.N.x, g.N.y, x, y);
      grad.addColorStop(0, 'rgba(251,113,133,.9)');
      grad.addColorStop(0.55, 'rgba(167,139,250,.6)');
      grad.addColorStop(1, hitS ? 'rgba(56,189,248,.9)' : 'rgba(167,139,250,.18)');
      ctx.strokeStyle = grad;
      ctx.stroke();
      // tangent arrow showing the N -> S direction
      const t = 0.35;
      const mx = g.N.x + (x - g.N.x) * t, my = g.N.y + (y - g.N.y) * t;
      const f = fieldCanvas(mx, my, g);
      if (f.mag > 0) {
        arrow(ctx, mx - (f.dx / f.mag) * 6, my - (f.dy / f.mag) * 6,
              mx + (f.dx / f.mag) * 6, my + (f.dy / f.mag) * 6,
              { color: 'rgba(221,214,254,.85)', width: 1.5, head: 5 });
      }
    }
    ctx.restore();
  }

  function drawCompasses(ctx, w, h, g) {
    const step = w < 560 ? 62 : 52;
    const r = Math.min(13, step * 0.26);
    for (let x = step / 2; x < w; x += step) {
      for (let y = step / 2; y < h; y += step) {
        if (Math.hypot(x - g.cx, y - g.cy) < g.halfPx + 12) continue;   // inside the magnet
        const f = fieldCanvas(x, y, g);
        ctx.save();
        ctx.fillStyle = 'rgba(10,18,34,.85)';
        ctx.strokeStyle = 'rgba(148,163,184,.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (f.mag > 0) {
          const ux = f.dx / f.mag, uy = f.dy / f.mag;
          ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.strokeStyle = '#fb7185';                       // north-seeking half
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ux * r * 0.78, y + uy * r * 0.78); ctx.stroke();
          ctx.strokeStyle = '#cbd5e1';                       // south-seeking half
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * r * 0.78, y - uy * r * 0.78); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  function drawVectors(ctx, w, h, g) {
    const step = w < 560 ? 46 : 38;
    for (let x = step / 2; x < w; x += step) {
      for (let y = step / 2; y < h; y += step) {
        if (Math.hypot(x - g.cx, y - g.cy) < g.halfPx + 8) continue;
        const f = fieldCanvas(x, y, g);
        if (f.mag <= 0) continue;
        const len = clamp(4 + (Math.log10(f.mag) + 5) * 4.2, 3, step * 0.5);
        arrow(ctx, x - (f.dx / f.mag) * len / 2, y - (f.dy / f.mag) * len / 2,
              x + (f.dx / f.mag) * len / 2, y + (f.dy / f.mag) * len / 2,
              { color: magColor(f.mag), width: 1.5, head: 4.5 });
      }
    }
  }

  function drawFilings(ctx, w, h, g) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of filings) {
      const x = p.nx * w, y = p.ny * h;
      if (Math.hypot(x - g.cx, y - g.cy) < g.halfPx * 0.7) continue;
      const f = fieldCanvas(x, y, g);
      if (f.mag <= 0) continue;
      const n = clamp((Math.log10(f.mag) + 4.4) / 2.6, 0.08, 1);
      const len = 3 + n * 7;
      const ux = f.dx / f.mag, uy = f.dy / f.mag;
      ctx.strokeStyle = `rgba(203,213,225,${0.12 + n * 0.7})`;
      ctx.lineWidth = 0.9 + n * 0.9;
      ctx.beginPath();
      ctx.moveTo(x - ux * len / 2 + p.jitter, y - uy * len / 2);
      ctx.lineTo(x + ux * len / 2 + p.jitter, y + uy * len / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMagnet(ctx, g) {
    const half = g.halfPx, thick = half * 0.46;
    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.rotate(-g.th);                     // canvas y is flipped, so negate
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14;
    // S half (left, blue)
    roundRect(ctx, -half, -thick, half, thick * 2, 5);
    const gs = ctx.createLinearGradient(-half, -thick, 0, thick);
    gs.addColorStop(0, '#0ea5e9'); gs.addColorStop(1, '#0369a1');
    ctx.fillStyle = gs; ctx.fill();
    // N half (right, red)
    roundRect(ctx, 0, -thick, half, thick * 2, 5);
    const gn = ctx.createLinearGradient(0, -thick, half, thick);
    gn.addColorStop(0, '#f43f5e'); gn.addColorStop(1, '#be123c');
    ctx.fillStyle = gn; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
    roundRect(ctx, -half, -thick, half * 2, thick * 2, 5); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '800 15px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('S', -half / 2, 1);
    ctx.fillText('N', half / 2, 1);
    ctx.restore();
  }

  /* ---- main render ----------------------------------------------------- */
  function render(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    const g = geometry(w, h);

    if (state.show.filings) drawFilings(ctx, w, h, g);
    if (state.show.lines) drawFieldLines(ctx, w, h, g);
    if (state.show.vectors) drawVectors(ctx, w, h, g);
    if (state.show.compass) drawCompasses(ctx, w, h, g);
    drawMagnet(ctx, g);

    // probe
    if (state.probe && Math.hypot(state.probe.x - g.cx, state.probe.y - g.cy) > g.halfPx) {
      const f = fieldCanvas(state.probe.x, state.probe.y, g);
      if (f.mag > 0) {
        const len = clamp(12 + (Math.log10(f.mag) + 5) * 6, 12, 46);
        arrow(ctx, state.probe.x, state.probe.y,
              state.probe.x + (f.dx / f.mag) * len, state.probe.y + (f.dy / f.mag) * len,
              { color: '#fbbf24', width: 2.4, head: 8 });
        ctx.save();
        ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(251,191,36,.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(state.probe.x, state.probe.y, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    label(ctx, 'drag the magnet \u00B7 rotate it with the angle slider', w / 2, 16,
      { color: 'rgba(148,163,184,.65)', size: 11, weight: '500' });
  }

  const stage = new EMC.Stage(canvas, render);

  /* ---- readouts -------------------------------------------------------- */
  const el = id => document.getElementById(id);
  const fixed2 = v => Number(v).toFixed(2);

  function updateReadouts() {
    if (el('mag-moment')) el('mag-moment').textContent = `${fixed2(state.m)} A\u00B7m\u00B2`;
    if (el('mag-pole')) el('mag-pole').textContent = `${eng(state.m / L_MAG, 2)} A\u00B7m`;
    if (state.probe) {
      const g = geometry(stage.w, stage.h);
      const f = fieldAt(state.probe.x, state.probe.y, g);
      if (el('mag-bprobe')) el('mag-bprobe').textContent = unit(f.mag, 'T', 2);
      if (el('mag-bprobe-uT')) {
        el('mag-bprobe-uT').hidden = false;
        el('mag-bprobe-uT').textContent = `\u2248 ${(f.mag / 5e-5).toFixed(1)}\u00D7 Earth's field (50 \u00B5T)`;
      }
      if (el('mag-dir')) {
        const deg = (Math.atan2(f.by, f.bx) * 180 / Math.PI + 360) % 360;
        el('mag-dir').textContent = f.mag > 0 ? `${deg.toFixed(0)}\u00B0 from +x` : '\u2014';
      }
    } else {
      if (el('mag-bprobe')) el('mag-bprobe').textContent = 'hover the field';
      if (el('mag-bprobe-uT')) { el('mag-bprobe-uT').textContent = ''; el('mag-bprobe-uT').hidden = true; }
      if (el('mag-dir')) el('mag-dir').textContent = '\u2014';
    }
  }
  function refresh() { stage.draw(); updateReadouts(); }

  /* ---- controls -------------------------------------------------------- */
  EMC.bindRange('mag-angle', 'mag-anglev', v => { state.angleDeg = v; refresh(); }, v => `${v.toFixed(0)}\u00B0`);
  // Dipole moment uses a log slider: 0.05 .. 2.0 A m^2
  const mSlider = el('mag-m');
  if (mSlider) {
    const fromS = s => Math.pow(10, -1.3 + (s / 1000) * (Math.log10(2) + 1.3));
    const toS = m => clamp((Math.log10(clamp(m, 0.05, 2)) + 1.3) / (Math.log10(2) + 1.3) * 1000, 0, 1000);
    const show = () => {
      const t = el('mag-mv');
      if (t) t.textContent = `${state.m.toFixed(2)} A\u00B7m\u00B2`;
    };
    mSlider.addEventListener('input', () => { state.m = fromS(parseFloat(mSlider.value)); show(); refresh(); });
    mSlider.value = String(toS(state.m));
    show();
  }
  const lineSlider = el('mag-lines');
  if (lineSlider) EMC.bindRange(lineSlider, 'mag-linesv', v => { state.lines = Math.round(v); refresh(); }, v => `${Math.round(v)} lines`);

  EMC.bindToggles('mag-toggles', (key, on) => {
    if (key in state.show) { state.show[key] = on; refresh(); }
  });

  const shuffle = el('mag-shuffle');
  if (shuffle) shuffle.addEventListener('click', () => {
    makeFilings(Math.floor(Math.random() * 100000));
    if (!state.show.filings) {
      const btn = document.querySelector('[data-toggle="filings"]');
      if (btn) { btn.setAttribute('aria-pressed', 'true'); state.show.filings = true; }
    }
    refresh();
  });
  const resetBtn = el('mag-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    state.nx = 0.5; state.ny = 0.5; state.angleDeg = 0;
    const a = el('mag-angle'); if (a) { a.value = '0'; a.dispatchEvent(new Event('input')); }
    refresh();
  });

  /* ---- drag the magnet ------------------------------------------------- */
  stage.onPointer(p => {
    const g = geometry(stage.w, stage.h);
    if (p.type === 'down') {
      // hit test against the rotated magnet body (un-rotate the pointer)
      // Un-rotate the pointer offset into the magnet's local frame:
      // the body was drawn with ctx.rotate(-theta), so the inverse is R(+theta).
      const dx = p.x - g.cx, dy = p.y - g.cy;
      const c = Math.cos(g.th), s = Math.sin(g.th);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      state.dragging = Math.abs(lx) < g.halfPx + 10 && Math.abs(ly) < g.halfPx * 0.5 + 12;
      canvas.classList.toggle('grabbing', state.dragging);
    } else if (p.type === 'move') {
      state.probe = { x: p.x, y: p.y };
      if (state.dragging) {
        state.nx = clamp(p.x / stage.w, 0.12, 0.88);
        state.ny = clamp(p.y / stage.h, 0.18, 0.82);
      }
      refresh();
    } else if (p.type === 'up' || p.type === 'leave') {
      state.dragging = false;
      if (p.type === 'leave') state.probe = null;
      canvas.classList.remove('grabbing');
      refresh();
    }
  });

  refresh();
})();
