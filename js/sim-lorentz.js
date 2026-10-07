/* Sim 6 - Lorentz force. F = qv x B; exact circular solution p(t) = c + Rot(Omega t)(p0 - c) with Omega = -q Bz/m; r = mv/|q|B, T = 2pi m/|q|B. Rotation direction is physical; the rate is slowed and the slow-down factor is printed on the canvas. */
(function () {
  const canvas = document.getElementById('sim-lorentz');
  if (!canvas) return;

  const { CONST, clamp, arrow, label, eng, unit, fixed } = EMC;
  const e = CONST.E;

  const PARTICLES = {
    proton:   { name: 'proton',   q: +e,   m: CONST.M_PROTON,   color: '#f8aebe' },
    electron: { name: 'electron', q: -e,   m: CONST.M_ELECTRON, color: '#a8d3e0' },
    alpha:    { name: 'alpha (He\u00B2\u207A)', q: +2 * e, m: 6.644657e-27, color: '#f6d36b' }
  };
  const DIRS = { right: 0, up: 90, left: 180, down: 270 };   // degrees, physics axes
  const REV_PER_SEC = 0.16;                                   // visual rotation rate

  const state = {
    particle: 'proton',
    v: 2e5,             // m/s
    B: 0.5,             // T
    Bdir: 'out',        // 'out' (+z) | 'in' (-z)
    vdir: 'right',
    showVectors: true,
    showPath: true,
    playing: true,
    phase: 0,           // accumulated visual phase [rad]
    challenge: null
  };

  const P = () => PARTICLES[state.particle];
  const Bz = () => (state.Bdir === 'out' ? 1 : -1) * state.B;

  /* ---- derived physics ------------------------------------------------- */
  function physics() {
    const p = P();
    const q = p.q, m = p.m, B = state.B, v = state.v;
    const F = Math.abs(q) * v * B;               // sin(90 deg) = 1
    const r = m * v / (Math.abs(q) * B);
    const T = 2 * Math.PI * m / (Math.abs(q) * B);
    const omega = Math.abs(q) * B / m;
    const KE = 0.5 * m * v * v;
    // signed rotation rate of the velocity vector (physics axes, y up)
    const Omega = -(q * Bz()) / m;
    return { q, m, F, r, T, omega, KE, Omega, v, B };
  }

  /* Unit vector of the magnetic force at t = 0, in physics axes. */
  function forceDirection() {
    const th = DIRS[state.vdir] * Math.PI / 180;
    const vx = Math.cos(th), vy = Math.sin(th);
    const s = Math.sign(P().q) * Math.sign(Bz());
    // F is proportional to q*(v x B) = q*Bz*(vy, -vx)
    let fx = s * vy, fy = s * (-vx);
    const n = Math.hypot(fx, fy) || 1;
    return { x: fx / n, y: fy / n };
  }
  function forceLabel() {
    const f = forceDirection();
    if (Math.abs(f.x) > Math.abs(f.y)) return f.x > 0 ? 'right' : 'left';
    return f.y > 0 ? 'up' : 'down';
  }

  /* ---- background: B field symbols ------------------------------------- */
  function drawBSymbols(ctx, w, h) {
    const out = state.Bdir === 'out';
    const step = w < 560 ? 54 : 46;
    ctx.save();
    ctx.strokeStyle = 'rgba(167,139,250,.42)';
    ctx.fillStyle = 'rgba(167,139,250,.42)';
    ctx.lineWidth = 1.4;
    const s = 5.2;
    for (let x = step / 2; x < w; x += step) {
      for (let y = step / 2; y < h; y += step) {
        if (out) {                       // dot = arrow tip coming at you
          ctx.beginPath(); ctx.arc(x, y, 2.3, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = .35;
          ctx.beginPath(); ctx.arc(x, y, 5.4, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        } else {                         // cross = arrow tail going away
          ctx.beginPath();
          ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
          ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    label(ctx, out ? 'B out of the page (toward you)' : 'B into the page (away from you)',
      w - 10, 16, { color: 'rgba(196,181,253,.9)', size: 11.5, align: 'right', weight: '700' });
    label(ctx, `|B| = ${fixed(state.B, 2)} T`, w - 10, 33,
      { color: 'rgba(196,181,253,.75)', size: 11, align: 'right', weight: '600' });
  }

  /* ---- main render ----------------------------------------------------- */
  function render(ctx, w, h, stage, dt) {
    ctx.clearRect(0, 0, w, h);
    const ph = physics();

    // advance the visual phase in the physically correct sense of rotation
    if (state.playing && dt) state.phase += Math.sign(ph.Omega) * 2 * Math.PI * REV_PER_SEC * dt;

    drawBSymbols(ctx, w, h);

    // auto-fit: make the orbit radius about 30% of the smaller canvas side
    const cx = w / 2, cy = h / 2;
    const ppm = (0.30 * Math.min(w, h)) / ph.r;          // pixels per metre

    // start point and circle centre in physics coords (metres, y up)
    const th = DIRS[state.vdir] * Math.PI / 180;
    const p0 = { x: 0, y: 0 };
    const v0 = { x: ph.v * Math.cos(th), y: ph.v * Math.sin(th) };
    const c = { x: p0.x - (1 / ph.Omega) * v0.y, y: p0.y + (1 / ph.Omega) * v0.x };

    const toCanvas = (p) => ({ x: cx + (p.x - c.x) * ppm, y: cy - (p.y - c.y) * ppm });
    // centre of the orbit on screen == canvas centre (we translate by -c)
    const C = { x: cx, y: cy };
    const rel0 = { x: p0.x - c.x, y: p0.y - c.y };
    const phi0 = Math.atan2(rel0.y, rel0.x);
    const Rpx = Math.hypot(rel0.x, rel0.y) * ppm;

    // full orbit guide
    if (state.showPath) {
      ctx.save();
      ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(148,163,184,.42)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(C.x, C.y, Rpx, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // traversed arc (fading trail)
      const swept = state.phase;
      const N = 90;
      ctx.save();
      ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (let i = 0; i < N; i++) {
        const a1 = phi0 + swept * (i / N), a2 = phi0 + swept * ((i + 1) / N);
        const fade = i / N;
        ctx.strokeStyle = `rgba(34,211,238,${0.05 + fade * 0.75})`;
        ctx.beginPath();
        // canvas y is flipped, so the arc angle is negated
        ctx.arc(C.x, C.y, Rpx, -a1, -a2, swept > 0);
        ctx.stroke();
      }
      ctx.restore();
      label(ctx, 'orbit', C.x, C.y - Rpx - 12, { color: 'rgba(148,163,184,.8)', size: 10.5, weight: '600' });
    }

    // current position
    const phi = phi0 + state.phase;
    const posPhys = { x: c.x + Math.hypot(rel0.x, rel0.y) * Math.cos(phi), y: c.y + Math.hypot(rel0.x, rel0.y) * Math.sin(phi) };
    const X = toCanvas(posPhys);

    // radius line + centre marker
    ctx.save();
    ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(251,191,36,.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(X.x, X.y); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(251,191,36,.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(C.x - 5, C.y); ctx.lineTo(C.x + 5, C.y);
    ctx.moveTo(C.x, C.y - 5); ctx.lineTo(C.x, C.y + 5); ctx.stroke();
    ctx.restore();
    label(ctx, `r = ${eng(ph.r, 2)} m`, (C.x + X.x) / 2 + 6, (C.y + X.y) / 2 - 8,
      { color: '#f6d36b', size: 11, align: 'left', weight: '700' });

    // velocity + force vectors (both are unit directions in PHYSICS axes;
    // a physics vector (x, y) is drawn on canvas as (x, -y))
    if (state.showVectors) {
      const sgn = Math.sign(ph.Omega) || 1;
      // tangent to the orbit: d/dphi of (cos phi, sin phi) = (-sin phi, cos phi),
      // times the sign of the rotation rate.
      const tx = -Math.sin(phi) * sgn, ty = Math.cos(phi) * sgn;
      const vlen = 46;
      arrow(ctx, X.x, X.y, X.x + tx * vlen, X.y - ty * vlen, { color: '#b5d777', width: 3, head: 11 });
      label(ctx, 'v', X.x + tx * (vlen + 13), X.y - ty * (vlen + 13), { color: '#cdeaa8', size: 13, weight: '800' });

      // The force always points at the centre, so it rotates with the particle.
      const fdir = forceDirection();               // unit force vector at t = 0
      const ca = Math.cos(state.phase), sa = Math.sin(state.phase);
      const fx = fdir.x * ca - fdir.y * sa;
      const fy = fdir.x * sa + fdir.y * ca;
      arrow(ctx, X.x, X.y, X.x + fx * 44, X.y - fy * 44, { color: '#f8aebe', width: 3, head: 11 });
      label(ctx, 'F', X.x + fx * 57, X.y - fy * 57, { color: '#fac0cd', size: 13, weight: '800' });
    }

    // the particle
    const col = P().color;
    ctx.save();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(X.x, X.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(246,241,229,.85)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    label(ctx, P().name, X.x, X.y - 19, { color: '#e8eefb', size: 11.5, weight: '700' });

    // captions
    const slowDown = (1 / REV_PER_SEC) / ph.T;      // how much the animation is stretched
    label(ctx, `|F| = ${eng(ph.F, 3)} N    r = ${eng(ph.r, 2)} m    T = ${eng(ph.T, 3)} s    (animation slowed \u00D7${eng(slowDown, 1)})`,
      w / 2, h - 12, { color: 'rgba(169,186,214,.92)', size: 11, weight: '600' });
  }

  const stage = new EMC.Stage(canvas, render, { animate: true });

  /* ---- readouts -------------------------------------------------------- */
  const el = id => document.getElementById(id);
  function updateReadouts() {
    const ph = physics();
    if (el('lor-force')) el('lor-force').textContent = unit(ph.F, 'N', 3);
    if (el('lor-radius')) el('lor-radius').textContent = unit(ph.r, 'm', 3);
    if (el('lor-period')) el('lor-period').textContent = unit(ph.T, 's', 3);
    if (el('lor-omega')) el('lor-omega').textContent = unit(ph.omega, 'rad/s', 3);
    // electronvolts are the natural unit here; joules go in the sub-line
    if (el('lor-ke')) el('lor-ke').textContent = unit(ph.KE / e, 'eV', 3);
    if (el('lor-kev')) el('lor-kev').textContent = `${eng(ph.KE, 3)} J`;
    if (el('lor-q')) el('lor-q').textContent = `${ph.q > 0 ? '+' : '\u2212'}${eng(Math.abs(ph.q) / e, 3)} e`;
    if (el('lor-dir')) {
      const map = { up: 'up \u2191', down: 'down \u2193', left: 'left \u2190', right: 'right \u2192' };
      el('lor-dir').textContent = map[forceLabel()];
    }
    if (el('lor-rule')) {
      const q = ph.q;
      el('lor-rule').textContent = q > 0
        ? 'Right-hand rule: fingers along v, curl toward B, thumb = force on a POSITIVE charge.'
        : 'Negative charge: use the right-hand rule, then REVERSE the result (or use your left hand).';
    }
  }
  function refresh() { stage.draw(); updateReadouts(); refreshChallengePrompt(); }

  /* ---- controls -------------------------------------------------------- */
  const partGroup = el('lor-particle');
  if (partGroup) EMC.bindSegment(partGroup, v => { state.particle = v; refresh(); });

  // speed: logarithmic slider 1e4 .. 1e7 m/s
  const vSlider = el('lor-v');
  if (vSlider) {
    const fromS = s => Math.pow(10, 4 + (s / 1000) * 3);
    const toS = v => clamp((Math.log10(clamp(v, 1e4, 1e7)) - 4) / 3 * 1000, 0, 1000);
    const show = () => {
      const t = el('lor-vv');
      if (t) t.textContent = state.v >= 1e6
        ? `${(state.v / 1e6).toFixed(2)}\u00D710^6 m/s`
        : `${(state.v / 1000).toFixed(0)} km/s`;
    };
    vSlider.addEventListener('input', () => { state.v = fromS(parseFloat(vSlider.value)); show(); refresh(); });
    vSlider.value = String(toS(state.v));
    show();
  }
  EMC.bindRange('lor-B', 'lor-Bv', v => { state.B = Math.max(0.05, v); refresh(); }, v => `${fixed(v, 2)} T`);
  const bdir = el('lor-bdir'); if (bdir) EMC.bindSegment(bdir, v => { state.Bdir = v; refresh(); });
  const vdir = el('lor-vdir'); if (vdir) EMC.bindSegment(vdir, v => { state.vdir = v; refresh(); });

  const playBtn = el('lor-play');
  if (playBtn) playBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(!state.playing));
  });
  const resetBtn = el('lor-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => { state.phase = 0; stage.draw(); });

  EMC.bindToggles('lor-toggles', (key, on) => {
    if (key === 'vectors') state.showVectors = on;
    if (key === 'path') state.showPath = on;
    stage.draw();
  });

  /* ---- "predict the direction" mini-challenge -------------------------- */
  function refreshChallengePrompt() {
    const host = el('lor-challenge-text');
    if (!host) return;
    const q = P().q;
    host.innerHTML =
      `A <b>${P().name}</b> (${q > 0 ? 'positive' : 'negative'} charge) moves <b>${state.vdir}</b> ` +
      `through a field pointing <b>${state.Bdir === 'out' ? 'out of the page (toward you)' : 'into the page (away from you)'}</b>. ` +
      `Which way does the magnetic force push it?`;
    const fb = el('lor-challenge-feedback');
    if (fb) { fb.innerHTML = ''; fb.className = 'feedback is-hidden'; }
    document.querySelectorAll('[data-lor-answer]').forEach(b => {
      b.disabled = false;
      b.classList.remove('correct', 'wrong');
      b.setAttribute('aria-pressed', 'false');
    });
  }

  document.querySelectorAll('[data-lor-answer]').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = forceLabel();
      const chosen = btn.dataset.lorAnswer;
      const fb = el('lor-challenge-feedback');
      document.querySelectorAll('[data-lor-answer]').forEach(b => {
        b.disabled = true;
        b.classList.toggle('correct', b.dataset.lorAnswer === answer);
        if (b === btn && chosen !== answer) b.classList.add('wrong');
      });
      if (fb) {
        const ok = chosen === answer;
        fb.className = 'feedback ' + (ok ? 'good' : 'bad');
        fb.innerHTML = ok
          ? `<b>Correct \u2014 the force points ${answer}.</b> F = q v \u00D7 B, and because F is always perpendicular to v the particle curves into a circle of radius r = mv/(|q|B) instead of speeding up.`
          : `<b>Not quite \u2014 it points ${answer}.</b> Point your right-hand fingers along v (${state.vdir}), curl them toward B (${state.Bdir === 'out' ? 'out of the page' : 'into the page'}); your thumb gives the force on a <i>positive</i> charge. ${P().q < 0 ? 'This particle is negative, so reverse that direction.' : ''}`;
      }
    });
  });

  const newBtn = el('lor-challenge-new');
  if (newBtn) newBtn.addEventListener('click', () => {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const bd = pick(['out', 'in']), vd = pick(Object.keys(DIRS));
    const setSeg = (groupId, value) => {
      const g = el(groupId);
      if (!g) return;
      const b = g.querySelector(`[data-value="${value}"]`);
      if (b) b.click();
    };
    setSeg('lor-bdir', bd);
    setSeg('lor-vdir', vd);
    // 50% chance of flipping the particle between proton and electron
    if (Math.random() < 0.5) setSeg('lor-particle', pick(['proton', 'electron']));
    refreshChallengePrompt();
  });

  refresh();
})();
