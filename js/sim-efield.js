/* Sim 2 - field explorer. E(P) = SUM k q (P-r)/|P-r|^3; field lines integrated along E from + charges, vector grid coloured by |E|, +1 nC test probe. */
(function () {
  const canvas = document.getElementById('sim-efield');
  if (!canvas) return;

  const { CONST, clamp, arrow, label, chargeGlyph, unit } = EMC;
  const k = CONST.K;
  const PX_PER_M = 220;              // canvas scale: 220 px = 1 metre
  const Q_TEST = 1e-9;               // test charge used for the probe: +1 nC

  /* ---- state ---------------------------------------------------------- */
  const state = {
    charges: [],                     // { q: microcoulombs, nx: 0..1, ny: 0..1 }
    brush: 'move',                   // 'move' | 'add+' | 'add-' | 'erase'
    size: 3,                         // |q| in microcoulombs used when adding
    mode: 'both',                    // 'lines' | 'vectors' | 'both'
    probe: null,                     // {x,y} in px while the pointer is inside
    dragIndex: -1,
    dragging: false
  };

  /* ---- presets --------------------------------------------------------- */
  const PRESETS = {
    'single-pos': [{ q: 4, nx: .5, ny: .5 }],
    'single-neg': [{ q: -4, nx: .5, ny: .5 }],
    'dipole': [{ q: 5, nx: .34, ny: .5 }, { q: -5, nx: .66, ny: .5 }],
    'like': [{ q: 4, nx: .34, ny: .5 }, { q: 4, nx: .66, ny: .5 }],
    'quad': [{ q: 4, nx: .34, ny: .32 }, { q: -4, nx: .66, ny: .32 },
             { q: -4, nx: .34, ny: .68 }, { q: 4, nx: .66, ny: .68 }],
    'unequal': [{ q: 8, nx: .36, ny: .5 }, { q: -2, nx: .68, ny: .5 }]
  };

  function loadPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    state.charges = p.map(c => ({ ...c }));
    refresh();
  }

  /* ---- field maths ----------------------------------------------------- */
  /* Convert normalised charge coords to pixels for the current canvas size. */
  function px(c, w, h) { return { x: c.nx * w, y: c.ny * h }; }

  /* Visual radius of a charge glyph (grows slowly with |q|). */
  const chargeRadius = q => 12 + 8 * Math.cbrt(Math.abs(q) / 3);

  /* * Net electric field at a pixel position. * @returns {{ex:number, ey:number, mag:number}} field in N/C */
  function fieldAt(x, y, w, h) {
    let ex = 0, ey = 0;
    for (const c of state.charges) {
      const p = px(c, w, h);
      // Convert the pixel offset to metres, then apply E = k q r_hat / r^2.
      const dxm = (x - p.x) / PX_PER_M;
      const dym = (y - p.y) / PX_PER_M;
      const r2 = dxm * dxm + dym * dym;
      if (r2 < 1e-6) continue;                       // ignore the singularity
      const r = Math.sqrt(r2);
      const E = k * (c.q * 1e-6) / r2;
      ex += E * (dxm / r);
      ey += E * (dym / r);
    }
    return { ex, ey, mag: Math.hypot(ex, ey) };
  }

  /* Colour ramp for field magnitude: deep blue -> cyan -> amber -> rose. */
  function magColor(mag) {
    // Point-charge fields here span roughly 1e3 .. 1e8 N/C; map that window.
    const n = clamp((Math.log10(Math.max(mag, 1e-6)) - 3) / 5, 0, 1);
    const hue = 205 - n * 205;                       // 205 (blue) -> 0 (red)
    return `hsl(${hue.toFixed(0)} 90% ${58 + n * 8}%)`;
  }

  /* ---- field-line tracing --------------------------------------------- */
  /* * Integrate along the field direction with a fixed pixel step. * Lines are seeded on positive charges (or negatives if there are none) so * each line is drawn exactly once. */
  function traceLines(ctx, w, h) {
    const seeds = state.charges.filter(c => c.q > 0);
    const sources = seeds.length ? seeds : state.charges.filter(c => c.q < 0);
    const step = 2.6, maxSteps = 900;

    ctx.save();
    ctx.lineWidth = 1.35;
    ctx.lineCap = 'round';

    for (const c of sources) {
      const p = px(c, w, h);
      const nLines = clamp(Math.round(3 * Math.abs(c.q)), 6, 26);
      const startR = chargeRadius(c.q) + 3;
      const offset = c.q > 0 ? 0 : Math.PI / nLines;

      for (let i = 0; i < nLines; i++) {
        const a = offset + (i / nLines) * Math.PI * 2;
        let x = p.x + Math.cos(a) * startR;
        let y = p.y + Math.sin(a) * startR;
        let terminatedOnCharge = false;
        const thisLine = [[x, y]];

        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < maxSteps; s++) {
          const f = fieldAt(x, y, w, h);
          if (f.mag < 1e-9) break;                   // null point: stop
          // Walk ALONG the field direction for + sources, AGAINST it for -.
          const sgn = c.q > 0 ? 1 : -1;
          x += sgn * (f.ex / f.mag) * step;
          y += sgn * (f.ey / f.mag) * step;
          if (x < -40 || x > w + 40 || y < -40 || y > h + 40) break;
          ctx.lineTo(x, y);
          thisLine.push([x, y]);
          // Stop when the line reaches an opposite charge.
          for (const other of state.charges) {
            if (other === c) continue;
            if (Math.sign(other.q) === Math.sign(c.q)) continue;
            const o = px(other, w, h);
            if (Math.hypot(x - o.x, y - o.y) < chargeRadius(other.q) + 2) { terminatedOnCharge = true; break; }
          }
          if (terminatedOnCharge) break;
        }
        ctx.strokeStyle = c.q > 0 ? 'rgba(248,174,190,.7)' : 'rgba(168,211,224,.7)';
        ctx.stroke();

        // Tangent arrow at a fixed fraction ALONG THE TRACED PATH (using the
        // straight midpoint of start/end piles every dipole arrow onto the axis)
        if (thisLine.length > 24) {
          const q = thisLine[Math.floor(thisLine.length * 0.32)];
          const mx = q[0], my = q[1];
          const f = fieldAt(mx, my, w, h);
          if (f.mag > 0) {
            const ux = f.ex / f.mag, uy = f.ey / f.mag;
            arrow(ctx, mx - ux * 6, my - uy * 6, mx + ux * 6, my + uy * 6,
              { color: 'rgba(165,243,252,.8)', width: 1.6, head: 5 });
          }
        }
      }
    }
    ctx.restore();
  }

  /* Grid of field vectors, length/colour coded by magnitude (log scale). */
  function drawVectorGrid(ctx, w, h) {
    const step = w < 520 ? 42 : 34;
    ctx.save();
    for (let x = step / 2; x < w; x += step) {
      for (let y = step / 2; y < h; y += step) {
        // Skip cells that sit on top of a charge.
        let onCharge = false;
        for (const c of state.charges) {
          const p = px(c, w, h);
          if (Math.hypot(x - p.x, y - p.y) < chargeRadius(c.q) + 6) { onCharge = true; break; }
        }
        if (onCharge) continue;
        const f = fieldAt(x, y, w, h);
        if (f.mag <= 0) continue;
        const len = clamp(5 + (Math.log10(f.mag) + 5) * 2.6, 3, step * 0.48);
        const ux = f.ex / f.mag, uy = f.ey / f.mag;
        arrow(ctx, x - ux * len / 2, y - uy * len / 2, x + ux * len / 2, y + uy * len / 2,
          { color: magColor(f.mag), width: 1.5, head: 4.5 });
      }
    }
    ctx.restore();
  }

  /* ---- main render ----------------------------------------------------- */
  function render(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);

    // faint background grid
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,.07)'; ctx.lineWidth = 1;
    const g = 40;
    for (let x = g; x < w; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = g; y < h; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.restore();

    if (state.charges.length === 0) {
      label(ctx, 'Pick a preset below, or choose the + / \u2212 tool and click to place charges',
        w / 2, h / 2, { color: 'rgba(169,186,214,.85)', size: 13, weight: '500' });
      return;
    }

    // While dragging, skip the expensive line tracing so the UI stays fluid.
    if (!state.dragging) {
      if (state.mode === 'lines' || state.mode === 'both') traceLines(ctx, w, h);
      if (state.mode === 'vectors' || state.mode === 'both') drawVectorGrid(ctx, w, h);
    } else {
      drawVectorGrid(ctx, w, h);
    }

    // probe (test charge) at the pointer
    if (state.probe) {
      const f = fieldAt(state.probe.x, state.probe.y, w, h);
      if (f.mag > 0) {
        const len = clamp(10 + (Math.log10(f.mag) + 5) * 5, 12, 54);
        const ux = f.ex / f.mag, uy = f.ey / f.mag;
        ctx.save();
        ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(251,191,36,.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(state.probe.x, state.probe.y, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        arrow(ctx, state.probe.x, state.probe.y, state.probe.x + ux * len, state.probe.y + uy * len,
          { color: '#f6d36b', width: 2.4, head: 8 });
        label(ctx, '+1 nC test charge', state.probe.x, state.probe.y - 18,
          { color: '#f6d36b', size: 10.5, weight: '500' });
      }
    }

    // charges on top
    for (const c of state.charges) {
      const p = px(c, w, h);
      chargeGlyph(ctx, p.x, p.y, chargeRadius(c.q), c.q);
      label(ctx, `${c.q > 0 ? '+' : ''}${c.q.toFixed(1)} \u00B5C`, p.x, p.y + chargeRadius(c.q) + 15,
        { color: c.q > 0 ? '#fac0cd' : '#cfe9f2', size: 11 });
    }
  }

  const stage = new EMC.Stage(canvas, render);

  /* ---- readouts -------------------------------------------------------- */
  const el = id => document.getElementById(id);
  function updateReadouts() {
    const w = stage.w, h = stage.h;
    const net = state.charges.reduce((s, c) => s + c.q, 0);
    if (el('ef-count')) el('ef-count').textContent = String(state.charges.length);
    if (el('ef-net')) {
      el('ef-net').textContent = `${net > 0 ? '+' : ''}${net.toFixed(1)} \u00B5C`;
      el('ef-net').className = 'stat-value ' + (net > 0 ? 'hl-rose' : net < 0 ? 'hl-cyan' : '');
    }
    if (state.probe) {
      const f = fieldAt(state.probe.x, state.probe.y, w, h);
      if (el('ef-emag')) el('ef-emag').textContent = unit(f.mag, 'N/C', 2);
      if (el('ef-edir')) {
        if (f.mag === 0) el('ef-edir').textContent = '\u2014';
        else {
          // Canvas y grows downward, so flip the sign for a maths-style angle.
          const deg = (-Math.atan2(f.ey, f.ex) * 180 / Math.PI + 360) % 360;
          el('ef-edir').textContent = `${deg.toFixed(0)}\u00B0 from +x`;
        }
      }
      if (el('ef-force')) el('ef-force').textContent = unit(f.mag * Q_TEST, 'N', 2);
    } else {
      ['ef-emag', 'ef-edir', 'ef-force'].forEach(id => { if (el(id)) el(id).textContent = 'hover the field'; });
    }
  }
  function refresh() { stage.draw(); updateReadouts(); }

  /* ---- controls -------------------------------------------------------- */
  const brushGroup = el('ef-brush');
  if (brushGroup) {
    EMC.bindSegment(brushGroup, value => {
      state.brush = value;
      canvas.style.cursor = value === 'move' ? 'grab' : value === 'erase' ? 'not-allowed' : 'copy';
      const hint = el('ef-hint');
      if (hint) {
        hint.textContent = {
          'move': 'Drag charges to move them. The field updates live.',
          'add+': 'Click anywhere to place a positive charge.',
          'add-': 'Click anywhere to place a negative charge.',
          'erase': 'Click a charge to remove it.'
        }[value];
      }
    });
  }
  const modeGroup = el('ef-mode');
  if (modeGroup) EMC.bindSegment(modeGroup, v => { state.mode = v; refresh(); });

  const sizeSlider = el('ef-size');
  if (sizeSlider) EMC.bindRange(sizeSlider, 'ef-sizev', v => { state.size = v; }, v => `${v.toFixed(1)} \u00B5C`);

  document.querySelectorAll('[data-ef-preset]').forEach(btn => {
    btn.addEventListener('click', () => { loadPreset(btn.dataset.efPreset); });
  });
  const clearBtn = el('ef-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => { state.charges = []; refresh(); });

  /* ---- pointer tools --------------------------------------------------- */
  function nearest(x, y, w, h, maxDist = 26) {
    let best = -1, bd = maxDist;
    state.charges.forEach((c, i) => {
      const p = px(c, w, h);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  stage.onPointer(p => {
    const w = stage.w, h = stage.h;
    if (p.type === 'down') {
      const idx = nearest(p.x, p.y, w, h);
      if (state.brush === 'move') {
        state.dragIndex = idx;
        state.dragging = idx >= 0;
        canvas.classList.toggle('grabbing', idx >= 0);
      } else if (state.brush === 'erase') {
        if (idx >= 0) { state.charges.splice(idx, 1); refresh(); }
      } else {
        const q = (state.brush === 'add+' ? 1 : -1) * state.size;
        state.charges.push({ q, nx: clamp(p.x / w, .04, .96), ny: clamp(p.y / h, .06, .94) });
        refresh();
      }
    } else if (p.type === 'move') {
      state.probe = { x: p.x, y: p.y };
      if (state.dragging && state.dragIndex >= 0) {
        const c = state.charges[state.dragIndex];
        if (c) { c.nx = clamp(p.x / w, .03, .97); c.ny = clamp(p.y / h, .05, .95); }
      }
      refresh();
    } else if (p.type === 'up') {
      state.dragging = false; state.dragIndex = -1;
      canvas.classList.remove('grabbing');
      refresh();
    } else if (p.type === 'leave') {
      state.probe = null; state.dragging = false; state.dragIndex = -1;
      canvas.classList.remove('grabbing');
      refresh();
    }
  });

  /* ---- boot ------------------------------------------------------------ */
  loadPreset('dipole');
  canvas.style.cursor = 'grab';
})();
