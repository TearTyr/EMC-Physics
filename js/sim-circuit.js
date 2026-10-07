/* ==========================================================================
   Simulation 4 — Simple Circuit Builder (series / parallel / combination)
   File: js/sim-circuit.js   (used on topics/current.html)

   PHYSICS
   -------
   Series bank      R_eq = R1 + R2 + ... + Rn      same CURRENT through each
   Parallel bank    1/R_eq = 1/R1 + 1/R2 + ...     same VOLTAGE across each
   Combination      R_eq = R1 + (R2*R3)/(R2+R3)
   Whole circuit    I_total = V / (R_eq + R_bulb)  (Kirchhoff + Ohm)
   Power            P = I^2 R = V I                bulb brightness ~ P

   The bulb is modelled as an ohmic resistor in series with the bank. (A real
   filament is non-ohmic: its resistance rises as it heats up. That caveat is
   stated in the tutorial text next to the simulation.)

   INTERACTION
   -----------
   * choose a topology, add/remove resistors, edit every value by slider
   * click a resistor on the canvas to select and edit it
   * animated charge flow: dot density and speed in each branch are
     proportional to the current in that branch
   ========================================================================== */
(function () {
  const canvas = document.getElementById('sim-circuit');
  if (!canvas) return;

  const { clamp, lerp, label, eng, unit, fixed } = EMC;

  /* ---- state ---------------------------------------------------------- */
  const LIMITS = { series: [1, 4], parallel: [2, 4], combo: [3, 3] };
  const state = {
    topology: 'series',
    V: 12,
    resistors: [10, 22, 47],
    bulbR: 15,
    includeBulb: true,
    selected: 0
  };

  /* ---- circuit analysis ------------------------------------------------ */
  function analyze() {
    const R = state.resistors.slice();
    const top = state.topology;
    let Rbank = 0, breakdown = '', per = [];

    if (top === 'series') {
      Rbank = R.reduce((a, b) => a + b, 0);
      breakdown = `R(eq) = ${R.map(r => fixed(r, 0)).join(' + ')} = ${fixed(Rbank, 2)} \u03A9`;
    } else if (top === 'parallel') {
      const sumG = R.reduce((a, b) => a + 1 / b, 0);
      Rbank = 1 / sumG;
      breakdown = `1/R(eq) = ${R.map(r => `1/${fixed(r, 0)}`).join(' + ')} = ${fixed(sumG, 4)} S  \u21D2  R(eq) = ${fixed(Rbank, 2)} \u03A9`;
    } else { // combo: R1 in series with (R2 || R3)
      const [r1, r2, r3] = R;
      const Rp = (r2 * r3) / (r2 + r3);
      Rbank = r1 + Rp;
      breakdown = `R\u209A = (${fixed(r2, 0)} \u00D7 ${fixed(r3, 0)}) / (${fixed(r2, 0)} + ${fixed(r3, 0)}) = ${fixed(Rp, 2)} \u03A9   \u21D2   R(eq) = ${fixed(r1, 0)} + ${fixed(Rp, 2)} = ${fixed(Rbank, 2)} \u03A9`;
    }

    const Rbulb = state.includeBulb ? state.bulbR : 0;
    const Rtotal = Rbank + Rbulb;
    const Itotal = state.V / Rtotal;
    const Vbank = Itotal * Rbank;
    const Vbulb = Itotal * Rbulb;
    const Pbulb = Itotal * Itotal * Rbulb;

    if (top === 'series') {
      per = R.map((r, i) => ({ i, r, I: Itotal, V: Itotal * r, P: Itotal * Itotal * r }));
    } else if (top === 'parallel') {
      per = R.map((r, i) => ({ i, r, I: Vbank / r, V: Vbank, P: (Vbank * Vbank) / r }));
    } else {
      const [r1, r2, r3] = R;
      const V1 = Itotal * r1;
      const Vp = Vbank - V1;
      per = [
        { i: 0, r: r1, I: Itotal, V: V1, P: Itotal * Itotal * r1 },
        { i: 1, r: r2, I: Vp / r2, V: Vp, P: (Vp * Vp) / r2 },
        { i: 2, r: r3, I: Vp / r3, V: Vp, P: (Vp * Vp) / r3 }
      ];
    }
    return { Rbank, Rtotal, Itotal, Vbank, Vbulb, Pbulb, per, breakdown };
  }

  /* ---- layout ---------------------------------------------------------- */
  /**
   * Builds the geometry for the current topology.
   * @returns {{frame:Object, comps:Array, paths:Array, hits:Array}}
   *   comps: components to draw; paths: {points, current} for charge animation;
   *   hits:  clickable rectangles mapped to resistor indices.
   */
  function buildLayout(w, h, A) {
    const bx = Math.max(40, w * 0.075), rx = w - Math.max(40, w * 0.075);
    const ty = Math.max(38, h * 0.16), by = h - Math.max(40, h * 0.17);
    const bulbX = bx + (rx - bx) * 0.16;
    const frame = { bx, rx, ty, by, bulbX };
    const comps = [], hits = [], paths = [];

    comps.push({ type: 'battery', x: bx, y: (ty + by) / 2, V: state.V });
    if (state.includeBulb) comps.push({ type: 'bulb', x: bulbX, y: by, P: A.Pbulb });

    const branchPath = xi => ({ points: [[bx, ty], [xi, ty], [xi, by], [bx, by], [bx, ty]] });

    if (state.topology === 'series') {
      const n = state.resistors.length;
      const start = bx + 64, end = rx - 30;
      A.per.forEach((p, i) => {
        const x = lerp(start, end, (i + 0.5) / n);
        comps.push({ type: 'R', x, y: ty, angle: 0, idx: i, R: p.r, I: p.I, V: p.V });
        hits.push({ idx: i, x: x - 52, y: ty - 26, w: 104, h: 52 });
      });
      paths.push({ points: branchPath(rx).points, current: A.Itotal });

    } else if (state.topology === 'parallel') {
      const n = state.resistors.length;
      const x1 = bx + (rx - bx) * 0.34, x2 = rx - 26;
      A.per.forEach((p, i) => {
        const x = lerp(x1, x2, (i + 0.5) / n);
        comps.push({ type: 'R', x, y: (ty + by) / 2, angle: Math.PI / 2, idx: i, R: p.r, I: p.I, V: p.V });
        comps.push({ type: 'node', x, y: ty }); comps.push({ type: 'node', x, y: by });
        hits.push({ idx: i, x: x - 24, y: (ty + by) / 2 - 46, w: 48, h: 92 });
        paths.push({ points: branchPath(x).points, current: p.I });
      });

    } else { // combo: R1 in series with (R2 || R3)
      const xR1 = bx + (rx - bx) * 0.24;
      const jx = bx + (rx - bx) * 0.44;
      const b1 = jx + (rx - 26 - jx) * 0.33;
      const b2 = jx + (rx - 26 - jx) * 0.75;
      const p = A.per;
      comps.push({ type: 'R', x: xR1, y: ty, angle: 0, idx: 0, R: p[0].r, I: p[0].I, V: p[0].V });
      hits.push({ idx: 0, x: xR1 - 52, y: ty - 26, w: 104, h: 52 });
      [[b1, 1], [b2, 2]].forEach(([x, j]) => {
        comps.push({ type: 'R', x, y: (ty + by) / 2, angle: Math.PI / 2, idx: j, R: p[j].r, I: p[j].I, V: p[j].V });
        comps.push({ type: 'node', x, y: ty }); comps.push({ type: 'node', x, y: by });
        hits.push({ idx: j, x: x - 24, y: (ty + by) / 2 - 46, w: 48, h: 92 });
        paths.push({ points: branchPath(x).points, current: p[j].I });
      });
      // label the series element
      comps.push({ type: 'note', x: xR1, y: ty + 40, text: 'in series with the bank' });
    }
    return { frame, comps, paths, hits };
  }

  /* ---- component painters --------------------------------------------- */
  function drawWires(ctx, F) {
    ctx.save();
    ctx.strokeStyle = '#5b7299'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(F.bx, F.ty); ctx.lineTo(F.rx, F.ty); ctx.lineTo(F.rx, F.by);
    ctx.lineTo(F.bx, F.by); ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawResistor(ctx, x, y, angle, R, selected, hot) {
    const w = 58, h = 12, lead = 16;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    if (selected) {
      ctx.save();
      ctx.strokeStyle = 'rgba(34,211,238,.85)'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]);
      EMC.roundRect(ctx, -w / 2 - lead - 6, -h - 8, w + 2 * lead + 12, 2 * h + 16, 8);
      ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = hot ? '#fda4af' : '#e2e8f0';
    ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (hot) { ctx.shadowColor = 'rgba(251,113,133,.85)'; ctx.shadowBlur = 14; }
    ctx.beginPath();
    ctx.moveTo(-w / 2 - lead, 0); ctx.lineTo(-w / 2, 0);
    const peaks = 5, pw = w / peaks;
    for (let i = 0; i < peaks; i++) {
      const sx = -w / 2 + i * pw;
      ctx.lineTo(sx + pw * 0.25, -h); ctx.lineTo(sx + pw * 0.75, h); ctx.lineTo(sx + pw, 0);
    }
    ctx.lineTo(w / 2 + lead, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawBattery(ctx, x, y, V) {
    ctx.save();
    ctx.strokeStyle = '#e8eefb'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 14, y - 10); ctx.lineTo(x + 14, y - 10); ctx.stroke();
    ctx.lineWidth = 4.6;
    ctx.beginPath(); ctx.moveTo(x - 7, y - 2); ctx.lineTo(x + 7, y - 2); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 14, y + 8); ctx.lineTo(x + 14, y + 8); ctx.stroke();
    ctx.lineWidth = 4.6;
    ctx.beginPath(); ctx.moveTo(x - 7, y + 16); ctx.lineTo(x + 7, y + 16); ctx.stroke();
    ctx.restore();
    label(ctx, '+', x + 21, y - 12, { color: '#fb7185', size: 13, weight: '800' });
    label(ctx, `${fixed(V, 1)} V`, x - 8, y + 38, { color: '#fcd34d', size: 12, weight: '700', align: 'center' });
  }

  function drawBulb(ctx, x, y, P) {
    const b = clamp(P / 3, 0, 1);      // 3 W = reference "full brightness"
    const r = 15;
    ctx.save();
    if (b > 0.02) {
      const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * (1.8 + b * 3.6));
      g.addColorStop(0, `rgba(255,226,150,${0.12 + b * 0.6})`);
      g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * (1.8 + b * 3.6), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,${Math.round(216 + b * 39)},${Math.round(150 + b * 105)},${0.12 + b * 0.6})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = b > 0.02 ? `hsl(${45 - b * 22} 100% ${58 + b * 34}%)` : '#7b8db0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y + r * 0.7); ctx.lineTo(x - r * 0.2, y - r * 0.2);
    ctx.lineTo(x + r * 0.2, y + r * 0.2); ctx.lineTo(x + r * 0.7, y - r * 0.7);
    ctx.stroke();
    ctx.restore();
    label(ctx, `bulb ${fixed(state.bulbR, 0)}\u03A9`, x, y + r + 17, { color: '#a9bad6', size: 10.5, weight: '600' });
  }

  function drawNode(ctx, x, y) {
    ctx.save(); ctx.fillStyle = '#93a7c8';
    ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  /** Animated charge flow along a polyline. Density + speed scale with current. */
  function drawFlow(ctx, points, current, Imax, t) {
    if (!(current > 0)) return;
    const lens = []; let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const l = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      lens.push(l); total += l;
    }
    if (total <= 0) return;
    const frac = clamp(current / (Imax || current), 0.05, 1);
    const n = Math.round(clamp(4 + 24 * frac, 4, 28));
    const speed = clamp(50 + 320 * frac, 30, 380);     // px per second
    const phase = (t * speed / total) % 1;
    ctx.save();
    ctx.fillStyle = 'rgba(251,191,36,.95)';
    for (let i = 0; i < n; i++) {
      let d = (((i / n) + phase) % 1) * total, px = points[0][0], py = points[0][1];
      for (let s = 0; s < lens.length; s++) {
        if (d <= lens[s]) {
          const k = lens[s] === 0 ? 0 : d / lens[s];
          px = points[s][0] + (points[s + 1][0] - points[s][0]) * k;
          py = points[s][1] + (points[s + 1][1] - points[s][1]) * k;
          break;
        }
        d -= lens[s];
      }
      ctx.beginPath(); ctx.arc(px, py, 2.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* ---- main render ----------------------------------------------------- */
  let lastHits = [];
  function render(ctx, w, h, stage) {
    ctx.clearRect(0, 0, w, h);
    const A = analyze();
    const L = buildLayout(w, h, A);
    lastHits = L.hits;

    drawWires(ctx, L.frame);
    // charge flow (drawn under the components so symbols stay legible)
    for (const p of L.paths) drawFlow(ctx, p.points, p.current, A.Itotal, stage.t);

    for (const c of L.comps) {
      if (c.type === 'R') {
        drawResistor(ctx, c.x, c.y, c.angle, c.R, c.idx === state.selected, c.V * c.I > 2);
        const vertical = Math.abs(c.angle) > 0.1;
        const lx = vertical ? c.x + 34 : c.x;
        const ly = vertical ? c.y - 4 : c.y - 26;
        label(ctx, `R${c.idx + 1} = ${fixed(c.R, 0)} \u03A9`, lx, ly,
          { color: c.idx === state.selected ? '#67e8f9' : '#a5f3fc', size: 11.5, weight: '700',
            align: vertical ? 'left' : 'center' });
        label(ctx, `I = ${eng(c.I, 2)} A`, lx, ly + (vertical ? 16 : -16),
          { color: '#fcd34d', size: 10.5, weight: '600', align: vertical ? 'left' : 'center' });
      } else if (c.type === 'battery') drawBattery(ctx, c.x, c.y, c.V);
      else if (c.type === 'bulb') drawBulb(ctx, c.x, c.y, c.P);
      else if (c.type === 'node') drawNode(ctx, c.x, c.y);
      else if (c.type === 'note') label(ctx, c.text, c.x, c.y, { color: 'rgba(148,163,184,.75)', size: 10.5, weight: '500' });
    }

    // headline numbers on the canvas
    label(ctx, `I(total) = ${eng(A.Itotal, 3)} A`, w / 2, h - 12,
      { color: '#67e8f9', size: 12.5, weight: '800' });
    label(ctx, `R(eq) = ${fixed(A.Rbank, 2)} \u03A9`, w - 12, 16,
      { color: '#a7f3d0', size: 12, weight: '800', align: 'right' });
  }

  const stage = new EMC.Stage(canvas, render, { animate: true });

  /* ---- HTML readouts + resistor table ---------------------------------- */
  const el = id => document.getElementById(id);
  function updateReadouts() {
    const A = analyze();
    const set = (id, v) => { if (el(id)) el(id).textContent = v; };
    set('circ-req', `${fixed(A.Rbank, 2)} \u03A9`);
    set('circ-rtotal', `${fixed(A.Rtotal, 2)} \u03A9`);
    set('circ-itotal', unit(A.Itotal, 'A', 3));
    // 3 significant figures so that Kirchhoff's voltage law visibly adds up:
    // V(bank) + V(bulb) must equal the supply voltage on screen.
    set('circ-vbank', unit(A.Vbank, 'V', 3));
    set('circ-vbulb', state.includeBulb ? unit(A.Vbulb, 'V', 3) : 'bypassed');
    set('circ-pbulb', state.includeBulb ? unit(A.Pbulb, 'W', 3) : '\u2014');
    set('circ-ptotal', unit(state.V * A.Itotal, 'W', 3));
    set('circ-breakdown', A.breakdown);

    const tb = el('circ-table');
    if (tb) {
      // the table header already states the units, so the cells hold plain
      // 3-significant-figure numbers in those units (never prefixed strings)
      const n3 = v => String(Number(v.toPrecision(3)));
      tb.innerHTML = A.per.map(p =>
        `<tr><td class="txt">R${p.i + 1}</td><td>${n3(p.r)}</td><td>${n3(p.V)}</td>` +
        `<td>${n3(p.I)}</td><td>${n3(p.P)}</td></tr>`).join('') +
        (state.includeBulb
          ? `<tr><td class="txt">bulb</td><td>${n3(state.bulbR)}</td><td>${n3(A.Vbulb)}</td>` +
            `<td>${n3(A.Itotal)}</td><td>${n3(A.Pbulb)}</td></tr>` : '');
    }

    // per-row V/I/P readouts in the control list
    A.per.forEach(p => {
      const n = el(`circ-r${p.i}-info`);
      if (n) n.textContent = `V = ${eng(p.V, 3)} V   \u00B7   I = ${eng(p.I, 3)} A   \u00B7   P = ${eng(p.P, 3)} W`;
    });
    // rule reminder that changes with topology
    const rule = el('circ-rule');
    if (rule) {
      rule.innerHTML = {
        series: '<b>Series:</b> the same <b>current</b> flows through every resistor; voltages <b>divide</b> in proportion to R. R(eq) is always <b>larger</b> than the biggest single resistor.',
        parallel: '<b>Parallel:</b> every branch has the same <b>voltage</b>; currents <b>divide</b> (the smaller R gets more current). R(eq) is always <b>smaller</b> than the smallest branch.',
        combo: '<b>Combination:</b> simplify the parallel pair first, then add the series resistor. Total current flows through R1, then splits between R2 and R3.'
      }[state.topology];
    }
  }

  /* ---- control list (one row per resistor) ----------------------------- */
  function renderRows() {
    const host = el('circ-rows');
    if (!host) return;
    host.innerHTML = state.resistors.map((r, i) => `
      <div class="row-item${i === state.selected ? ' selected' : ''}" data-row="${i}">
        <span class="row-chip">R${i + 1}</span>
        <div style="min-width:0">
          <input class="range" type="range" min="1" max="100" step="1" value="${r}"
                 id="circ-r${i}" aria-label="Resistance of R${i + 1} in ohms">
          <div class="tiny faint mono" id="circ-r${i}-info">\u200B</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-end">
          <span class="ctl-value" id="circ-r${i}-v">${fixed(r, 0)} \u03A9</span>
          ${state.topology === 'combo'
            ? '<span class="tag tag-amber">' + (i === 0 ? 'series' : 'parallel') + '</span>'
            : `<button class="btn btn-sm btn-danger" data-del="${i}" aria-label="Remove R${i + 1}"${
                state.resistors.length <= LIMITS[state.topology][0] ? ' disabled' : ''}>\u00D7</button>`}
        </div>
      </div>`).join('');

    // wire up the freshly created inputs
    state.resistors.forEach((r, i) => {
      const input = el(`circ-r${i}`);
      if (input) {
        input.addEventListener('input', () => {
          state.resistors[i] = parseFloat(input.value);
          const v = el(`circ-r${i}-v`); if (v) v.textContent = `${fixed(state.resistors[i], 0)} \u03A9`;
          refresh();
        });
      }
      const row = host.querySelector(`[data-row="${i}"]`);
      if (row) row.addEventListener('click', e => {
        if (e.target.closest('input,button')) return;
        state.selected = i; renderRows(); stage.draw();
      });
    });
    host.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => {
        const i = Number(b.dataset.del);
        if (state.resistors.length <= LIMITS[state.topology][0]) return;
        state.resistors.splice(i, 1);
        state.selected = clamp(state.selected, 0, state.resistors.length - 1);
        renderRows(); refresh();
      });
    });
  }

  function refresh() { stage.draw(); updateReadouts(); }

  /* ---- buttons --------------------------------------------------------- */
  const topo = el('circ-topology');
  if (topo) EMC.bindSegment(topo, value => {
    state.topology = value;
    const [lo, hi] = LIMITS[value];
    // reshape the resistor list to fit the new topology
    if (value === 'combo') state.resistors = [state.resistors[0] ?? 22, state.resistors[1] ?? 33, state.resistors[2] ?? 68].slice(0, 3);
    while (state.resistors.length < lo) state.resistors.push(20);
    while (state.resistors.length > hi) state.resistors.pop();
    state.selected = clamp(state.selected, 0, state.resistors.length - 1);
    const addBtn = el('circ-add');
    if (addBtn) addBtn.disabled = state.resistors.length >= LIMITS[state.topology][1];
    renderRows(); refresh();
  });

  const addBtn = el('circ-add');
  if (addBtn) addBtn.addEventListener('click', () => {
    if (state.resistors.length >= LIMITS[state.topology][1]) return;
    state.resistors.push(20);
    state.selected = state.resistors.length - 1;
    addBtn.disabled = state.resistors.length >= LIMITS[state.topology][1];
    renderRows(); refresh();
  });

  EMC.bindRange('circ-V', 'circ-Vv', v => { state.V = v; refresh(); }, v => `${fixed(v, 1)} V`);
  EMC.bindRange('circ-bulbR', 'circ-bulbv', v => { state.bulbR = v; refresh(); }, v => `${fixed(v, 0)} \u03A9`);
  const bulbToggle = el('circ-includeBulb');
  if (bulbToggle) bulbToggle.addEventListener('change', () => {
    state.includeBulb = bulbToggle.checked;
    const s = el('circ-bulbR'); if (s) s.disabled = !state.includeBulb;
    refresh();
  });

  /* ---- click a resistor on the canvas to select it --------------------- */
  stage.onPointer(p => {
    if (p.type !== 'down') return;
    const hit = lastHits.find(h => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h);
    if (hit) {
      state.selected = hit.idx;
      renderRows(); refresh();
      EMC.scrollToEl(document.querySelector(`[data-row="${hit.idx}"]`), { behavior: 'smooth', block: 'nearest' });
    }
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const over = lastHits.some(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    canvas.style.cursor = over ? 'pointer' : 'default';
  });

  /* ---- boot ------------------------------------------------------------ */
  renderRows();
  if (addBtn) addBtn.disabled = state.resistors.length >= LIMITS[state.topology][1];
  refresh();
})();
