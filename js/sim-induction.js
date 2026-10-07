/* Sim 7 - magnet through a coil. Phi(z) = mu0 m a^2 / (2 (a^2+z^2)^{3/2}); EMF = -N dPhi/dz * v (analytic), I = EMF/R, P = EMF^2/R. Motion is sub-stepped at 2 ms so the narrow EMF peak is never undersampled. Sign convention: EMF > 0 = counter-clockwise seen from +x (dot at the top of each turn). */
(function () {
  const canvas = document.getElementById('sim-induction');
  if (!canvas) return;

  const { CONST, clamp, lerp, damp, label, roundRect, eng, unit, fixed } = EMC;
  const MU0 = CONST.MU0;

  const state = {
    N: 800,            // turns
    a: 0.020,          // coil radius [m]
    m: 0.80,           // magnet dipole moment [A m^2]
    R: 10,             // total circuit resistance [ohm]
    z: -0.075,         // magnet position [m] (+ = right of the coil)
    v: 0,              // magnet velocity [m/s]
    speed: 0.8,        // auto-move speed [m/s]
    mode: 'manual',    // 'manual' | 'push' | 'pull' | 'oscillate'
    oscAmp: 0.075,     // oscillation amplitude [m]
    oscFreq: 1.6,      // oscillation frequency [Hz]
    oscPhase: 0,
    showSymbols: true,
    iScale: 1e-4,      // galvanometer auto-range [A]
    history: []        // {t, lambda, emf} for the strip chart
  };
  const Z_MAX = 0.11;   // magnet travel limit [m]
  let chart = null;     // strip-chart Stage (constructed below the main stage)

  /* ---- core physics ---------------------------------------------------- */
  function fluxPerTurn(z) {
    const a2 = state.a * state.a;
    return MU0 * state.m * a2 / (2 * Math.pow(a2 + z * z, 1.5));
  }
  function dFluxdz(z) {
    const a2 = state.a * state.a;
    return -3 * MU0 * state.m * a2 * z / (2 * Math.pow(a2 + z * z, 2.5));
  }
  function compute() {
    const phi = fluxPerTurn(state.z);
    const lambda = state.N * phi;
    const dphidt = dFluxdz(state.z) * state.v;         // Wb/s per turn
    const emf = -state.N * dphidt;                     // Faraday + Lenz sign
    const I = emf / state.R;
    const P = emf * emf / state.R;
    return { phi, lambda, dlambda_dt: state.N * dphidt, emf, I, P };
  }

  /* ---- geometry -------------------------------------------------------- */
  function geom(w, h) {
    const cy = h * 0.42;
    const pxPerM = (w * 0.40) / Z_MAX;
    const coilX = w / 2;
    const aPx = clamp(state.a * pxPerM, 16, h * 0.30);
    const turns = clamp(Math.round(state.N / 120), 5, 14);
    const coilLen = clamp(w * 0.16, 60, 150);
    const galv = { x: w / 2, y: h - Math.max(40, h * 0.14), r: clamp(Math.min(w, h) * 0.075, 20, 30) };
    return { cy, pxPerM, coilX, aPx, turns, coilLen, galv,
             magnetX: coilX + state.z * pxPerM,
             magLen: clamp(0.05 * pxPerM, 46, w * 0.24), magThick: clamp(aPx * 0.42, 14, 30) };
  }

  /* ---- painters -------------------------------------------------------- */
  function drawCoil(ctx, G, phys) {
    const x0 = G.coilX - G.coilLen / 2;
    const spacing = G.coilLen / G.turns;
    // determine current direction symbol: emf > 0 => CCW seen from +x
    const ccw = phys.emf >= 0;
    const glow = clamp(Math.abs(phys.I) / state.iScale, 0, 1);
    const wireColor = glow > 0.02
      ? (ccw ? '#b5d777' : '#f6d36b')
      : 'rgba(185,183,174,.85)';

    ctx.save();
    ctx.lineWidth = 2.6;
    for (let i = 0; i < G.turns; i++) {
      const x = x0 + i * spacing;
      const rx = Math.max(4.5, spacing * 0.62);
      // far half of the loop (dimmer) ...
      ctx.strokeStyle = 'rgba(148,163,184,.35)';
      ctx.beginPath();
      ctx.ellipse(x, G.cy, rx, G.aPx, 0, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
      // ... then the near half in the live wire colour (glows with current)
      ctx.strokeStyle = wireColor;
      ctx.beginPath();
      ctx.ellipse(x, G.cy, rx, G.aPx, 0, Math.PI * 1.5, Math.PI * 0.5);
      ctx.stroke();
    }
    ctx.restore();

    // current-direction symbols at the top and bottom of the winding
    if (state.showSymbols && glow > 0.03) {
      const size = 4 + glow * 3.5;
      const topOut = ccw;                       // CCW from +x => out of page at top
      for (let i = 0; i < G.turns; i++) {
        const x = x0 + i * spacing;
        drawCurrentSymbol(ctx, x, G.cy - G.aPx, size, topOut);
        drawCurrentSymbol(ctx, x, G.cy + G.aPx, size, !topOut);
      }
    }
    label(ctx, `${G.turns} turns shown (N = ${state.N})`, G.coilX, G.cy - G.aPx - 18,
      { color: 'rgba(169,186,214,.8)', size: 10.5, weight: '600' });
    return { x0, spacing };
  }

  /* dot = current out of the page, cross = current into the page */
  function drawCurrentSymbol(ctx, x, y, s, out) {
    ctx.save();
    ctx.strokeStyle = 'rgba(232,238,251,.95)'; ctx.fillStyle = 'rgba(232,238,251,.95)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.stroke();
    if (out) { ctx.beginPath(); ctx.arc(x, y, Math.max(1.4, s * 0.34), 0, Math.PI * 2); ctx.fill(); }
    else {
      const d = s * 0.72;
      ctx.beginPath(); ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d);
      ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMagnet(ctx, G) {
    const x = G.magnetX, y = G.cy, L = G.magLen, T = G.magThick;
    ctx.save();
    // S half (left, pastel blue)
    roundRect(ctx, x - L / 2, y - T / 2, L / 2, T, 4);
    ctx.fillStyle = '#a8d3e0'; ctx.fill();
    // N half (right, pastel pink) — the N pole leads when the magnet moves right
    roundRect(ctx, x, y - T / 2, L / 2, T, 4);
    ctx.fillStyle = '#f8aebe'; ctx.fill();
    ctx.strokeStyle = 'rgba(246,241,229,.45)'; ctx.lineWidth = 1.2;
    roundRect(ctx, x - L / 2, y - T / 2, L, T, 4); ctx.stroke();
    ctx.fillStyle = '#2b2d33'; ctx.font = `800 ${Math.max(11, T * 0.5)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('S', x - L / 4, y + 1);
    ctx.fillText('N', x + L / 4, y + 1);
    ctx.restore();
    label(ctx, 'drag me \u2194', x, y - T / 2 - 13, { color: 'rgba(232,238,251,.8)', size: 10.5, weight: '600' });
  }

  function drawLeads(ctx, G, coil, phys, stageRef) {
    const g = G.galv;
    const leftX = coil.x0, rightX = coil.x0 + G.coilLen;
    const yTop = G.cy + G.aPx;
    ctx.save();
    ctx.strokeStyle = '#5b7299'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leftX, yTop); ctx.lineTo(leftX, g.y); ctx.lineTo(g.x - g.r, g.y);
    ctx.moveTo(rightX, yTop); ctx.lineTo(rightX, g.y); ctx.lineTo(g.x + g.r, g.y);
    ctx.stroke();
    ctx.restore();

    // animated charge flow: direction flips with the sign of the current
    const mag = clamp(Math.abs(phys.I) / state.iScale, 0, 1);
    if (mag > 0.02) {
      const dir = phys.I >= 0 ? 1 : -1;    // + => CCW seen from +x
      const speed = 40 + 260 * mag;
      const phase = (stageRef.t * speed) % 60;
      ctx.save();
      ctx.fillStyle = 'rgba(251,191,36,.95)';
      [[leftX, dir], [rightX, -dir]].forEach(([x, d]) => {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const s = (((i / n) + (phase * d) / 60) % 1 + 1) % 1;
          const yy = lerp(yTop, g.y, s);
          ctx.beginPath(); ctx.arc(x, yy, 2.8, 0, Math.PI * 2); ctx.fill();
        }
      });
      ctx.restore();
    }
  }

  function drawGalvanometer(ctx, G, phys) {
    const { x, y, r } = G.galv;
    const frac = clamp(phys.I / state.iScale, -1, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(8,15,28,.95)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5b7299'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    // centre-zero scale
    ctx.strokeStyle = 'rgba(148,163,184,.6)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
    [-1, -0.5, 0, 0.5, 1].forEach(f => {
      const a = Math.PI * 1.5 + f * Math.PI * 0.32;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.64, y + Math.sin(a) * r * 0.64);
      ctx.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
      ctx.stroke();
    });
    const na = Math.PI * 1.5 + frac * Math.PI * 0.32;
    ctx.strokeStyle = frac >= 0 ? '#b5d777' : '#f6d36b'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(na) * r * 0.66, y + Math.sin(na) * r * 0.66); ctx.stroke();
    ctx.fillStyle = '#e8eefb'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    label(ctx, 'G', x, y + r * 0.5, { color: '#e8eefb', size: Math.max(10, r * 0.32), weight: '800' });
    label(ctx, `\u00B1${eng(state.iScale, 1)} A full scale`, x, y + r + 15,
      { color: '#7b8db0', size: 10, weight: '600' });
  }

  function drawAxis(ctx, G, w) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,.22)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(10, G.cy); ctx.lineTo(w - 10, G.cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(G.coilX, G.cy - G.aPx - 30); ctx.lineTo(G.coilX, G.cy + G.aPx + 12); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    label(ctx, 'coil plane', G.coilX, G.cy + G.aPx + 24, { color: 'rgba(148,163,184,.75)', size: 10, weight: '600' });
    // z dimension
    const y = G.cy + G.aPx + 44;
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(G.coilX, y); ctx.lineTo(G.magnetX, y); ctx.stroke();
    ctx.restore();
    label(ctx, `z = ${(state.z * 100).toFixed(1)} cm`, (G.coilX + G.magnetX) / 2, y - 10,
      { color: '#cbd5e1', size: 11, weight: '700' });
  }

  /* ---- main render ----------------------------------------------------- */
  let dragging = false, lastZ = 0;
  function render(ctx, w, h, stageRef, dt) {
    ctx.clearRect(0, 0, w, h);
    const G = geom(w, h);

    /* --- advance the magnet ------------------------------------------------ The EMF peak is narrow (it sits at z = +/- a/2), so a single Euler step per animation frame can jump straight over it on a slow device. The motion is therefore integrated in sub-steps of at most 2 ms, which also keeps the position accurate when the browser clamps dt. */
    const subSteps = dt ? clamp(Math.ceil(dt / 0.002), 1, 40) : 1;
    const sdt = dt ? dt / subSteps : 0;
    if (dt && (state.mode === 'push' || state.mode === 'pull')) {
      state.v = (state.mode === 'push' ? 1 : -1) * state.speed;
      for (let i = 0; i < subSteps; i++) {
        state.z = clamp(state.z + state.v * sdt, -Z_MAX, Z_MAX);
        if (Math.abs(state.z) >= Z_MAX) { state.v = 0; setMode('manual'); break; }
      }
    } else if (dt && state.mode === 'oscillate') {
      for (let i = 0; i < subSteps; i++) state.oscPhase += 2 * Math.PI * state.oscFreq * sdt;
      state.z = state.oscAmp * Math.sin(state.oscPhase);
      // exact derivative of the prescribed motion -> no numerical noise
      state.v = state.oscAmp * 2 * Math.PI * state.oscFreq * Math.cos(state.oscPhase);
    } else if (dt && dragging) {
      // manual drag: finite-difference velocity, low-pass filtered
      const raw = dt > 0 ? (state.z - lastZ) / dt : 0;
      state.v = damp(state.v, clamp(raw, -25, 25), 18, dt);
      lastZ = state.z;
    } else if (dt) {
      state.v = damp(state.v, 0, 12, dt);     // released: velocity decays to 0
    }

    const phys = compute();

    /* --- galvanometer auto-range: track a slowly decaying peak --- */
    const target = Math.max(Math.abs(phys.I), 1e-7);
    state.iScale = target > state.iScale ? target * 1.15 : damp(state.iScale, target * 1.25, 1.2, dt || 0.016);
    state.iScale = clamp(state.iScale, 1e-7, 10);

    /* --- draw --- */
    drawAxis(ctx, G, w);
    const coil = drawCoil(ctx, G, phys);
    drawLeads(ctx, G, coil, phys, stageRef);
    drawMagnet(ctx, G);
    drawGalvanometer(ctx, G, phys);

    // live headline numbers on the canvas
    label(ctx, `EMF = ${unit(phys.emf, 'V', 3)}`, 12, 18,
      { color: '#f6d36b', size: 13, align: 'left', weight: '800' });
    label(ctx, `I = ${unit(phys.I, 'A', 3)}`, 12, 38,
      { color: '#cfe9f2', size: 13, align: 'left', weight: '800' });
    label(ctx, `v = ${fixed(state.v, 2)} m/s`, w - 12, 18,
      { color: '#a7f3d0', size: 12, align: 'right', weight: '700' });

    /* --- record history for the strip chart --- */
    if (dt) {
      state.history.push({ t: stageRef.t, lambda: phys.lambda, emf: phys.emf });
      const cutoff = stageRef.t - 7;
      while (state.history.length && state.history[0].t < cutoff) state.history.shift();
      if (state.history.length > 1400) state.history.splice(0, state.history.length - 1400);
    }
    updateReadouts(phys);
    if (chart) chart.draw();
  }

  const stage = new EMC.Stage(canvas, render, { animate: true });

  /* ---- strip chart: flux linkage and EMF vs time ----------------------- */
  const chartCanvas = document.getElementById('sim-induction-chart');
  if (chartCanvas) {
    chart = new EMC.Stage(chartCanvas, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const pad = { l: 44, r: 12, t: 12, b: 20 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const midY = pad.t + ph / 2;

      // frame + zero line
      ctx.save();
      ctx.strokeStyle = 'rgba(148,163,184,.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(pad.l, pad.t, pw, ph);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(148,163,184,.4)';
      ctx.beginPath(); ctx.moveTo(pad.l, midY); ctx.lineTo(pad.l + pw, midY); ctx.stroke();
      ctx.restore();

      const H = state.history;
      if (H.length > 1) {
        const t1 = H[H.length - 1].t, t0 = t1 - 7;
        let maxL = 1e-9, maxE = 1e-9;
        for (const s of H) { maxL = Math.max(maxL, Math.abs(s.lambda)); maxE = Math.max(maxE, Math.abs(s.emf)); }
        const X = t => pad.l + ((t - t0) / 7) * pw;
        const trace = (key, max, color, half) => {
          ctx.save();
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
          ctx.beginPath();
          let started = false;
          for (const s of H) {
            const x = X(s.t);
            if (x < pad.l - 1) continue;
            const y = half
              ? midY - (s[key] / max) * (ph / 2 - 4)
              : pad.t + ph - (s[key] / max) * (ph - 8) - 4;
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.restore();
        };
        trace('lambda', maxL, 'rgba(34,211,238,.95)', false);   // always positive -> bottom baseline
        trace('emf', maxE, 'rgba(251,191,36,.95)', true);       // bipolar -> centre baseline
        label(ctx, `\u03BB max ${eng(maxL, 2)}Wb`, pad.l + 6, pad.t + 10,
          { color: '#cfe9f2', size: 10, align: 'left', weight: '700' });
        label(ctx, `EMF max \u00B1${eng(maxE, 2)}V`, pad.l + pw - 6, pad.t + 10,
          { color: '#f6d36b', size: 10, align: 'right', weight: '700' });
      }
      label(ctx, 'time \u2192 (last 7 s)', pad.l + pw / 2, h - 7,
        { color: '#7b8db0', size: 10, weight: '600' });
      label(ctx, '\u03BB', pad.l - 8, pad.t + 12, { color: '#cfe9f2', size: 11, align: 'right', weight: '800' });
      label(ctx, 'EMF', pad.l - 8, midY, { color: '#f6d36b', size: 11, align: 'right', weight: '800' });
    });
  }

  /* ---- readouts -------------------------------------------------------- */
  const el = id => document.getElementById(id);
  let lastLenzHTML = '';
  function updateReadouts(phys) {
    const set = (id, v) => { if (el(id)) el(id).textContent = v; };
    set('ind-z', `${(state.z * 100).toFixed(1)} cm`);
    // Base SI units in, one SI prefix out — never stack prefixes ("µmWb").
    set('ind-phi', unit(phys.phi, 'Wb', 3));
    set('ind-lambda', unit(phys.lambda, 'Wb', 3));
    set('ind-dphi', unit(phys.dlambda_dt, 'Wb/s', 3));
    set('ind-emf', unit(phys.emf, 'V', 3));
    set('ind-I', unit(phys.I, 'A', 3));
    set('ind-P', unit(phys.P, 'W', 3));
    set('ind-v', `${fixed(state.v, 2)} m/s`);

    // direction + Lenz explanation
    const dirEl = el('ind-dir'), lenzEl = el('ind-lenz');
    const tiny = Math.abs(phys.emf) < state.iScale * state.R * 0.004;
    let dir = '\u2014', lenz = '';
    if (tiny || Math.abs(state.v) < 1e-4) {
      dir = 'no induced current';
      lenz = Math.abs(state.z) < 1e-3
        ? 'The magnet is at the centre of the coil: the flux is at its maximum, so d\u03A6/dt = 0 and the EMF passes through zero. (This is why a real search coil gives two opposite peaks.)'
        : 'The flux through the coil is not changing, so by Faraday\u2019s law the induced EMF is zero. Move the magnet to generate a current.';
    } else {
      const approaching = state.z * state.v < 0;
      dir = phys.emf > 0 ? 'CCW from the right' : 'CW from the right';
      lenz = approaching
        ? 'Flux is <b>increasing</b>. Lenz\u2019s law: the induced current flows so as to <b>oppose the increase</b> \u2014 it makes the coil\u2019s near face a <b>north</b> pole, which <b>repels</b> the approaching magnet. You must push harder; that extra mechanical work is exactly the electrical power I\u00B2R being dissipated.'
        : 'Flux is <b>decreasing</b>. Lenz\u2019s law: the induced current flows to <b>sustain the flux</b> \u2014 it makes the coil\u2019s near face a <b>south</b> pole, which <b>attracts</b> the departing magnet and resists its motion. Again, energy is conserved.';
    }
    if (dirEl && dirEl.textContent !== dir) dirEl.textContent = dir;
    if (lenzEl && lenz !== lastLenzHTML) { lenzEl.innerHTML = lenz; lastLenzHTML = lenz; }
  }

  /* ---- mode buttons ---------------------------------------------------- */
  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('[data-ind-mode]').forEach(b => {
      const on = b.dataset.indMode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (mode === 'oscillate') {
      // start the oscillation from wherever the magnet currently is
      state.oscPhase = Math.asin(clamp(state.z / state.oscAmp, -1, 1));
    }
  }
  document.querySelectorAll('[data-ind-mode]').forEach(b => {
    b.addEventListener('click', () => {
      const mode = b.dataset.indMode;
      if (mode === 'push') { state.z = -Z_MAX; state.v = 0; setMode('push'); }
      else if (mode === 'pull') { state.z = Z_MAX; state.v = 0; setMode('pull'); }
      else if (mode === 'oscillate') setMode('oscillate');
      else { state.v = 0; setMode('manual'); }
      stage.draw();
    });
  });

  /* ---- controls -------------------------------------------------------- */
  EMC.bindRange('ind-N', 'ind-Nv', v => { state.N = Math.round(v); stage.draw(); }, v => `${Math.round(v)} turns`);
  EMC.bindRange('ind-a', 'ind-av', v => { state.a = v / 100; stage.draw(); }, v => `${v.toFixed(1)} cm`);
  EMC.bindRange('ind-R', 'ind-Rv', v => { state.R = v; stage.draw(); }, v => `${v.toFixed(0)} \u03A9`);
  EMC.bindRange('ind-speed', 'ind-speedv', v => { state.speed = v; }, v => `${v.toFixed(2)} m/s`);
  EMC.bindRange('ind-osc', 'ind-oscv', v => { state.oscFreq = v; }, v => `${v.toFixed(1)} Hz`);

  // magnet strength: log slider 0.05 .. 2.0 A m^2
  const mSlider = el('ind-m');
  if (mSlider) {
    const fromS = s => Math.pow(10, -1.3 + (s / 1000) * (Math.log10(2) + 1.3));
    const toS = m => clamp((Math.log10(clamp(m, 0.05, 2)) + 1.3) / (Math.log10(2) + 1.3) * 1000, 0, 1000);
    mSlider.addEventListener('input', () => {
      state.m = fromS(parseFloat(mSlider.value));
      if (el('ind-mv')) el('ind-mv').textContent = `${state.m.toFixed(2)} A\u00B7m\u00B2`;
      stage.draw();
    });
    mSlider.value = String(toS(state.m));
    if (el('ind-mv')) el('ind-mv').textContent = `${state.m.toFixed(2)} A\u00B7m\u00B2`;
  }

  const symToggle = el('ind-symbols');
  if (symToggle) symToggle.addEventListener('change', () => { state.showSymbols = symToggle.checked; stage.draw(); });

  const resetBtn = el('ind-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    state.z = -0.075; state.v = 0; state.history = []; state.oscPhase = 0;
    setMode('manual'); stage.draw();
  });

  /* ---- drag the magnet ------------------------------------------------- */
  stage.onPointer(p => {
    const G = geom(stage.w, stage.h);
    if (p.type === 'down') {
      const hit = Math.abs(p.x - G.magnetX) < G.magLen / 2 + 14 && Math.abs(p.y - G.cy) < G.magThick + 16;
      if (hit) {
        dragging = true; setMode('manual');
        canvas.classList.add('grabbing');
        lastZ = state.z;
      }
    } else if (p.type === 'move' && dragging) {
      state.z = clamp((p.x - G.coilX) / G.pxPerM, -Z_MAX, Z_MAX);
    } else if (p.type === 'up' || p.type === 'leave' || p.type === 'cancel') {
      dragging = false;
      canvas.classList.remove('grabbing');
    }
  });

  /* ---- predict-then-run challenge (Faraday/Lenz, answered by the theory) -- */
  const IND_CHALLENGES = [
    {
      text: 'The magnet rests at the coil centre. Press <b>Push through →</b>. At which moment is the induced EMF exactly zero?',
      options: ['as the magnet crosses the coil centre', 'at the two ends of the travel', 'never — it is zero only before you press'],
      answer: 0,
      explain: 'At the centre the flux is at its <b>maximum</b>, and a maximum has zero slope: dΦ/dt = 0. That is why the chart shows two opposite peaks with a zero crossing between them.',
      apply: () => document.querySelector('[data-ind-mode="push"]')?.click()
    },
    {
      text: 'Double the <b>auto-move speed</b> and push again. The peak |EMF| will…',
      options: ['double', 'halve', 'stay the same'],
      answer: 0,
      explain: 'EMF = −N·dΦ/dz·v: the spatial derivative is unchanged, v doubles, so the whole trace scales by 2 — taller peaks, same area under them (same total flux change).',
      apply: () => {
        const sl = el('ind-speed');
        if (sl) { sl.value = String(Math.min(3, state.speed * 2)); sl.dispatchEvent(new Event('input')); }
        document.querySelector('[data-ind-mode="push"]')?.click();
      }
    },
    {
      text: 'Double the <b>circuit resistance R</b> and push again. The peak |EMF| will…',
      options: ['stay the same', 'double', 'halve'],
      answer: 0,
      explain: 'Faraday’s law contains no R: the EMF depends only on N and dΦ/dt. Doubling R halves the <b>current</b> (I = EMF/R) and quarters the heating — watch the mA readout, not the mV one.',
      apply: () => {
        const sl = el('ind-R');
        if (sl) { sl.value = String(Math.min(200, state.R * 2)); sl.dispatchEvent(new Event('input')); }
        document.querySelector('[data-ind-mode="push"]')?.click();
      }
    }
  ];
  let indChalIdx = 0, indChalDone = false;
  function showIndChallenge(i) {
    indChalIdx = ((i % IND_CHALLENGES.length) + IND_CHALLENGES.length) % IND_CHALLENGES.length;
    indChalDone = false;
    const c = IND_CHALLENGES[indChalIdx];
    const txt = el('ind-chal-text'), opts = el('ind-chal-opts'),
          fb = el('ind-chal-fb'), tryB = el('ind-chal-try');
    if (!txt || !opts) return;
    txt.innerHTML = c.text;
    if (fb) { fb.className = 'feedback is-hidden'; fb.innerHTML = ''; }
    if (tryB) tryB.hidden = true;
    opts.innerHTML = c.options.map((o, k) =>
      `<button class="btn btn-sm" type="button" data-k="${k}" aria-pressed="false">${o}</button>`).join('');
    opts.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      if (indChalDone) return;
      indChalDone = true;
      const k = Number(b.dataset.k), okk = k === c.answer;
      opts.querySelectorAll('button').forEach(x => {
        x.disabled = true;
        if (Number(x.dataset.k) === c.answer) x.classList.add('btn-primary');
        if (x === b && !okk) x.classList.add('btn-danger');
      });
      if (fb) { fb.className = 'feedback ' + (okk ? 'good' : 'bad'); fb.innerHTML = `<span><b>${okk ? 'Good prediction.' : 'Not quite.'}</b> ${c.explain}</span>`; }
      if (tryB) tryB.hidden = false;
    }));
  }
  if (el('ind-chal-text')) {
    showIndChallenge(0);
    const nb = el('ind-chal-new');
    if (nb) nb.addEventListener('click', () => showIndChallenge(indChalIdx + 1));
    const tb = el('ind-chal-try');
    if (tb) tb.addEventListener('click', () => IND_CHALLENGES[indChalIdx].apply());
  }

  setMode('manual');
  stage.draw();
})();
