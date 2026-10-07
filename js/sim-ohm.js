/* ==========================================================================
   Simulation 3 — Ohm's Law bench  (V = I R)
   File: js/sim-ohm.js   (used on topics/current.html)

   PHYSICS
   -------
   Ohm's law            I = V / R            [A] = [V] / [ohm]
   Power dissipated     P = V I = I^2 R = V^2 / R   [W]
   For an ohmic resistor the I-V graph is a straight line through the
   origin whose gradient is 1/R. The chart canvas draws that line plus two
   ghost lines (R/2 and 2R) to make the "steeper = less resistance" idea
   visible.

   Two canvases:
     #sim-ohm        the circuit (battery, resistor, bulb, analogue ammeter)
     #sim-ohm-chart  the I-V characteristic
   ========================================================================== */
(function () {
  const canvas = document.getElementById('sim-ohm');
  if (!canvas) return;

  const { CONST, clamp, label, eng, unit, fixed } = EMC;

  /* ---- state ---------------------------------------------------------- */
  const state = {
    V: 9,            // volts
    R: 22,           // ohms
    ratedP: 0.5,     // resistor power rating in W (real-world safety check)
    electrons: false // false = conventional current, true = electron flow
  };
  const get = () => ({
    I: state.R > 0 ? state.V / state.R : 0,
    P: state.R > 0 ? (state.V * state.V) / state.R : 0
  });

  /* ---- analogue ammeter auto-ranging ----------------------------------- */
  const RANGES = [
    { max: 1e-3, txt: '1 mA' }, { max: 1e-2, txt: '10 mA' }, { max: 1e-1, txt: '100 mA' },
    { max: 1, txt: '1 A' }, { max: 5, txt: '5 A' }, { max: 25, txt: '25 A' }
  ];
  function pickRange(I) { return RANGES.find(r => I <= r.max) || RANGES[RANGES.length - 1]; }

  /* ---- circuit geometry ------------------------------------------------ */
  function layout(w, h) {
    const bx = Math.max(42, w * 0.09);
    const ty = Math.max(42, h * 0.20);
    const by = h - Math.max(46, h * 0.22);
    return {
      bx, ty, by, rx: w - bx,
      battery: { x: bx, y: h / 2 },
      resistor: { x: w / 2, y: ty },
      bulb: { x: w - bx, y: h / 2 },
      meter: { x: w / 2, y: by, r: clamp(Math.min(w, h) * 0.085, 24, 34) },
      // closed loop used for the moving-charge animation
      loop: [[bx, ty], [w - bx, ty], [w - bx, by], [bx, by], [bx, ty]]
    };
  }

  /** Point at fractional distance s (0..1) along a closed polyline. */
  function pointOnLoop(loop, s) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < loop.length - 1; i++) {
      const len = Math.hypot(loop[i + 1][0] - loop[i][0], loop[i + 1][1] - loop[i][1]);
      segs.push({ a: loop[i], b: loop[i + 1], len }); total += len;
    }
    let d = ((s % 1) + 1) % 1 * total;
    for (const sg of segs) {
      if (d <= sg.len) {
        const t = sg.len === 0 ? 0 : d / sg.len;
        return [sg.a[0] + (sg.b[0] - sg.a[0]) * t, sg.a[1] + (sg.b[1] - sg.a[1]) * t];
      }
      d -= sg.len;
    }
    return loop[0];
  }

  /* ---- component drawings --------------------------------------------- */
  function drawWires(ctx, L) {
    ctx.save();
    ctx.strokeStyle = '#5b7299'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(L.loop[0][0], L.loop[0][1]);
    for (let i = 1; i < L.loop.length; i++) ctx.lineTo(L.loop[i][0], L.loop[i][1]);
    ctx.stroke();
    ctx.restore();
  }

  function drawBattery(ctx, x, y, V) {
    ctx.save();
    ctx.strokeStyle = '#e8eefb'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    // two cells: long plate = + terminal (top), short plate = - terminal
    const gap = 7;
    for (let i = 0; i < 2; i++) {
      const cy = y - gap + i * gap * 2;
      ctx.beginPath(); ctx.moveTo(x - 15, cy - gap); ctx.lineTo(x + 15, cy - gap); ctx.stroke();      // long (+)
      ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(x - 8, cy - gap + 6); ctx.lineTo(x + 8, cy - gap + 6); ctx.stroke(); // short (-)
      ctx.lineWidth = 3;
    }
    label(ctx, '+', x + 22, y - 16, { color: '#f8aebe', size: 14, weight: '800' });
    label(ctx, '\u2212', x + 22, y + 14, { color: '#cfe9f2', size: 16, weight: '800' });
    label(ctx, `${fixed(V, 1)} V`, x - 6, y + 44, { color: '#f6d36b', size: 12.5, weight: '700' });
    ctx.restore();
  }

  /** Zig-zag resistor symbol drawn horizontally, centred on (x,y). */
  function drawResistor(ctx, x, y, R, hot) {
    const w = 74, h = 15, lead = 20;
    ctx.save();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - lead, y); ctx.lineTo(x - w / 2, y);
    const peaks = 6, pw = w / peaks;
    for (let i = 0; i < peaks; i++) {
      const sx = x - w / 2 + i * pw;
      ctx.lineTo(sx + pw * 0.25, y - h);
      ctx.lineTo(sx + pw * 0.75, y + h);
      ctx.lineTo(sx + pw, y);
    }
    ctx.lineTo(x + w / 2 + lead, y);
    if (hot) { ctx.strokeStyle = '#f8aebe'; ctx.lineWidth = 3.2; }
    ctx.stroke();
    ctx.restore();
    label(ctx, `R = ${eng(R, 3)}\u03A9`, x, y - 30, { color: '#cfe9f2', size: 12.5, weight: '700' });
  }

  /** Incandescent bulb: glow and filament colour scale with dissipated power. */
  function drawBulb(ctx, x, y, P) {
    const b = clamp(P / 6, 0, 1);            // 6 W = "full brightness" reference
    const r = 17;
    ctx.save();
    // flat halo: one translucent disc whose alpha tracks power (no gradient)
    if (b > 0.02) {
      ctx.fillStyle = `rgba(246,211,107,${0.05 + b * 0.16})`;
      ctx.beginPath(); ctx.arc(x, y, r * (1.9 + b * 1.6), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(246,211,107,${0.14 + b * 0.6})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    // filament
    ctx.strokeStyle = b > 0.02 ? `hsl(${45 - b * 20} 100% ${60 + b * 30}%)` : '#7b8db0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.72, y + r * 0.72);
    ctx.lineTo(x - r * 0.24, y - r * 0.2); ctx.lineTo(x + r * 0.24, y + r * 0.2);
    ctx.lineTo(x + r * 0.72, y - r * 0.72);
    ctx.stroke();
    ctx.restore();
    label(ctx, 'bulb', x, y + r + 18, { color: '#a9bad6', size: 11, weight: '600' });
  }

  /** Circular analogue ammeter with an auto-ranging scale. */
  function drawAmmeter(ctx, x, y, r, I) {
    const range = pickRange(I);
    const frac = clamp(I / range.max, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(8,15,28,.94)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5b7299'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

    // scale arc across the top half (180 deg sweep)
    ctx.strokeStyle = 'rgba(148,163,184,.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, r * 0.74, Math.PI, Math.PI * 2); ctx.stroke();
    for (let i = 0; i <= 4; i++) {
      const a = Math.PI + (i / 4) * Math.PI;
      const inner = r * 0.66, outer = r * 0.82;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
      ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
      ctx.stroke();
    }
    // needle
    const na = Math.PI + frac * Math.PI;
    ctx.strokeStyle = '#f8aebe'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(na) * r * 0.7, y + Math.sin(na) * r * 0.7); ctx.stroke();
    ctx.fillStyle = '#e8eefb'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    label(ctx, 'A', x, y + r * 0.44, { color: '#e8eefb', size: Math.max(10, r * 0.34), weight: '800' });
    label(ctx, `range ${range.txt}`, x, y + r + 15, { color: '#7b8db0', size: 10.5, weight: '600' });
  }

  /* ---- main render ----------------------------------------------------- */
  function render(ctx, w, h, stage) {
    ctx.clearRect(0, 0, w, h);
    const L = layout(w, h);
    const { I, P } = get();

    drawWires(ctx, L);

    // moving charges: speed and density scale with current
    const speed = clamp(70 * Math.pow(Math.abs(I), 0.32), 4, 340);
    const nDots = clamp(Math.round(10 + 26 * Math.min(1, Math.log10(1 + Math.abs(I) * 20) / 2)), 10, 34);
    const phase = (stage.t * speed) / 1200;
    const dir = state.electrons ? -1 : 1;
    ctx.save();
    for (let i = 0; i < nDots; i++) {
      const s = ((i / nDots) + phase * dir) % 1;
      const [px, py] = pointOnLoop(L.loop, s);
      ctx.fillStyle = state.electrons ? '#a8d3e0' : '#f6d36b';
      ctx.beginPath(); ctx.arc(px, py, 3.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    drawBattery(ctx, L.battery.x, L.battery.y, state.V);
    drawResistor(ctx, L.resistor.x, L.resistor.y, state.R, P > state.ratedP);
    drawBulb(ctx, L.bulb.x, L.bulb.y, P);
    drawAmmeter(ctx, L.meter.x, L.meter.y, L.meter.r, Math.abs(I));

    // current readout above the meter
    label(ctx, `I = ${unit(I, 'A', 3)}`, L.meter.x, L.meter.y - L.meter.r - 20,
      { color: '#cfe9f2', size: 13.5, weight: '800' });

    // flow-direction caption
    label(ctx, state.electrons ? 'electron flow (\u2212 \u2192 +)' : 'conventional current (+ \u2192 \u2212)',
      w / 2, h - 12, { color: 'rgba(148,163,184,.85)', size: 10.5, weight: '600' });

    if (P > state.ratedP) {
      label(ctx, '\u26A0 above the resistor power rating', L.resistor.x, L.resistor.y + 34,
        { color: '#fca5a5', size: 11, weight: '700' });
    }
  }

  const stage = new EMC.Stage(canvas, render, { animate: true });

  /* ---- I-V characteristic chart --------------------------------------- */
  const chartCanvas = document.getElementById('sim-ohm-chart');
  let chart = null;
  if (chartCanvas) {
    chart = new EMC.Stage(chartCanvas, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const pad = { l: 46, r: 14, t: 14, b: 26 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const { I } = get();
      const Vmax = 24;
      // Vertical scale adapts to the operating point (never below 10 mA).
      const Imax = Math.max(I * 1.3, 0.01);

      const X = v => pad.l + (v / Vmax) * pw;
      const Y = i => pad.t + ph - (i / Imax) * ph;

      // grid + axes
      ctx.save();
      ctx.strokeStyle = 'rgba(148,163,184,.16)'; ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const gx = X((g / 4) * Vmax), gy = Y((g / 4) * Imax);
        ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, pad.t + ph); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l + pw, gy); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(148,163,184,.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ph); ctx.lineTo(pad.l + pw, pad.t + ph); ctx.stroke();
      ctx.restore();

      // ghost lines for R/2 and 2R (slope = 1/R)
      const ghost = (R, color, text) => {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(Vmax), Y(Vmax / R)); ctx.stroke();
        ctx.restore();
        // keep the reference-line label inside the plot when the line is steep
        label(ctx, text, X(Vmax) - 6, clamp(Y(Vmax / R), pad.t + 10, pad.t + ph - 4) - 6,
          { color, size: 10, align: 'right', weight: '700' });
      };
      ghost(state.R * 2, 'rgba(167,139,250,.75)', '2R');
      ghost(state.R / 2, 'rgba(52,211,153,.75)', 'R/2');

      // the actual characteristic I = V/R
      ctx.save();
      ctx.strokeStyle = '#a8d3e0'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(Vmax), Y(Vmax / state.R)); ctx.stroke();
      ctx.restore();

      // operating point
      const ox = X(state.V), oy = Y(I);
      if (oy >= pad.t - 2) {
        ctx.save();
        ctx.fillStyle = '#f6d36b'; ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
        label(ctx, `(${fixed(state.V, 1)} V, ${eng(I, 2)} A)`, clamp(ox, pad.l + 40, w - 50), oy - 14,
          { color: '#f6d36b', size: 11, weight: '700' });
      }

      label(ctx, 'V (volts) \u2192', pad.l + pw / 2, h - 8, { color: '#7b8db0', size: 10.5, weight: '600' });
      label(ctx, eng(Imax, 1), pad.l - 6, pad.t + 8, { color: '#7b8db0', size: 9.5, align: 'right', weight: '600' });
      label(ctx, 'I (A)', pad.l - 6, pad.t + 21, { color: '#7b8db0', size: 10, align: 'right', weight: '600' });
      label(ctx, 'gradient = 1/R', pad.l + 8, pad.t + ph - 10, { color: 'rgba(148,163,184,.8)', size: 10, align: 'left', weight: '600' });
    });
  }

  /* ---- readouts -------------------------------------------------------- */
  const el = id => document.getElementById(id);
  function updateReadouts() {
    const { I, P } = get();
    if (el('ohm-I')) el('ohm-I').textContent = unit(I, 'A', 3);
    // Sub-line: the same current expressed as a charge-carrier rate. Writing
    // eng(I*1000)+' mA' would stack two prefixes ("3.00 k mA"), so we show the
    // physically meaningful electron flow instead.
    if (el('ohm-ImA')) {
      el('ohm-ImA').textContent = I === 0 ? 'no charge flow'
        : `${eng(I / CONST.E, 3)} electrons/s`;
    }
    if (el('ohm-P')) el('ohm-P').textContent = unit(P, 'W', 3);
    if (el('ohm-sub')) {
      el('ohm-sub').textContent = `I = V \u00F7 R = ${fixed(state.V, 1)} V \u00F7 ${eng(state.R, 3)} \u03A9 = ${eng(I, 4)} A`;
    }
    const warn = el('ohm-warn');
    if (warn) {
      const over = P > state.ratedP;
      warn.hidden = !over;
      if (over) {
        warn.innerHTML = `<b>Over-rated!</b> The resistor is dissipating ${eng(P, 2)} W but is only rated for ${state.ratedP} W. A real component this size would overheat \u2014 in practice you would use a higher-wattage resistor or raise R.`;
      }
    }
    if (el('ohm-range')) el('ohm-range').textContent = pickRange(Math.abs(I)).txt;
  }

  function refresh() { stage.draw(); if (chart) chart.draw(); updateReadouts(); }

  /* ---- controls -------------------------------------------------------- */
  EMC.bindRange('ohm-V', 'ohm-Vv', v => { state.V = v; refresh(); }, v => `${fixed(v, 1)} V`);

  // Resistance uses a LOGARITHMIC slider (0..1000 -> 1 ohm..1000 ohm) so that
  // low values are still easy to select precisely.
  const rSlider = el('ohm-R');
  if (rSlider) {
    const fromSlider = s => Math.pow(10, (s / 1000) * 3);      // 1 .. 1000 ohm
    const toSlider = R => clamp((Math.log10(clamp(R, 1, 1000)) / 3) * 1000, 0, 1000);
    const apply = () => {
      state.R = fromSlider(parseFloat(rSlider.value));
      if (el('ohm-Rv')) el('ohm-Rv').textContent = `${eng(state.R, 3)} \u03A9`;
      const num = el('ohm-Rnum');
      if (num && document.activeElement !== num) num.value = String(Math.round(state.R * 10) / 10);
      refresh();
    };
    rSlider.addEventListener('input', apply);
    rSlider.value = String(toSlider(state.R));
    apply();

    // exact numeric entry
    const num = el('ohm-Rnum');
    if (num) {
      num.addEventListener('change', () => {
        const v = parseFloat(num.value);
        if (isFinite(v) && v >= 0.1) { state.R = clamp(v, 0.1, 1e6); rSlider.value = String(toSlider(clamp(state.R, 1, 1000))); apply(); }
        else num.value = String(Math.round(state.R * 10) / 10);
      });
    }
    document.querySelectorAll('[data-ohm-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [V, R] = btn.dataset.ohmPreset.split(',').map(Number);
        const vEl = el('ohm-V');
        // Drive the real controls so readouts and state can never drift apart.
        if (vEl) { vEl.value = String(V); vEl.dispatchEvent(new Event('input')); }
        rSlider.value = String(toSlider(R));
        apply();
        EMC.toast(`Preset: V = ${fixed(V, 1)} V, R = ${eng(R, 3)} \u03A9`);
      });
    });
  }

  const rated = el('ohm-rated');
  if (rated) EMC.bindRange(rated, 'ohm-ratedv', v => { state.ratedP = v; refresh(); }, v => `${fixed(v, 2)} W`);

  const flowToggle = el('ohm-electrons');
  if (flowToggle) flowToggle.addEventListener('change', () => { state.electrons = flowToggle.checked; refresh(); });

  refresh();
})();
