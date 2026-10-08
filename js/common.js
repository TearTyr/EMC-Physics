/* EMC Lab shared engine (window.EMC): physical constants, maths + SI-prefix formatting, HiDPI canvas Stage (rAF loop, resize, unified pointer input), drawing helpers, safe localStorage, progress tracking, control binding, page UI (nav/reveal/toasts), KaTeX typesetting and licensed-font loading. */
'use strict';

window.EMC = (function () {

  /* ------------------------------------------------------------------------ 1. Physical constants (SI units, CODATA 2018 exact values where defined) ------------------------------------------------------------------------ */
  const CONST = {
    /* Coulomb constant k = 1/(4*pi*eps0) [N m^2 C^-2] */
    K: 8.987551787e9,
    /* Permittivity of free space eps0 [F/m] (exact) */
    EPS0: 8.8541878128e-12,
    /* Permeability of free space mu0 [T m/A] */
    MU0: 1.25663706212e-6,
    /* Elementary charge e [C] (exact) */
    E: 1.602176634e-19,
    /* Electron mass [kg] */
    M_ELECTRON: 9.1093837015e-31,
    /* Proton mass [kg] */
    M_PROTON: 1.67262192369e-27
  };

  /* ------------------------------------------------------------------------ 2. Math helpers ------------------------------------------------------------------------ */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const roundTo = (v, dp) => { const p = Math.pow(10, dp); return Math.round(v * p) / p; };
  /* Map a value from one range to another (used for canvas scaling). */
  const mapRange = (v, a1, a2, b1, b2) => b1 + ((v - a1) / (a2 - a1)) * (b2 - b1);
  /* Smooth exponential approach — frame-rate independent damping. */
  const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

  /* ------------------------------------------------------------------------ 3. Number formatting ------------------------------------------------------------------------ */
  /* SI prefixes used by the engineering formatter, from femto to tera. */
  const PREFIX = [
    { e: -15, s: 'f' }, { e: -12, s: 'p' }, { e: -9, s: 'n' }, { e: -6, s: '\u00B5' },
    { e: -3, s: 'm' }, { e: 0, s: '' }, { e: 3, s: 'k' }, { e: 6, s: 'M' },
    { e: 9, s: 'G' }, { e: 12, s: 'T' }
  ];

  /* * Format a number with an SI prefix, keeping `sig` significant figures. * Values outside the prefix table fall back to exponential notation, so a * prefix is never stacked on top of another one. * * eng(0.0034) -> "3.40 m" eng(399.45) -> "399" * eng(12345) -> "12.3 k" eng(1.6e-14) -> "16.0 f" * eng(1e-20) -> "1.00e-20" eng(0) -> "0" * * @param {number} v value in base SI units * @param {number} sig significant figures (default 3) * @returns {string} */
  function eng(v, sig = 3) {
    if (v === null || v === undefined || !isFinite(v)) return '\u2014';
    if (v === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(v)) / 3) * 3;
    e = clamp(e, -15, 12);
    let scaled = v / Math.pow(10, e);
    const pre = PREFIX.find(p => p.e === e);
    if (!pre) return v.toExponential(Math.max(0, sig - 1));

    // Rounding can push 999.6 up to 1000, so re-scale when that happens.
    let decimals = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(scaled))));
    if (decimals > 4) return v.toExponential(Math.max(0, sig - 1));   // below femto
    if (Math.abs(Number(scaled.toFixed(decimals))) >= 1000) {
      scaled /= 1000; e += 3;
      const pre2 = PREFIX.find(p => p.e === e);
      if (!pre2) return v.toExponential(Math.max(0, sig - 1));
      decimals = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(scaled))));
      return scaled.toFixed(decimals) + (pre2.s ? ' ' + pre2.s : '');
    }
    return scaled.toFixed(decimals) + (pre.s ? '\u00A0' + pre.s : '');
  }

  /* * eng() plus a unit, following the SI convention that there is no space * between a prefix and its unit: 399 mN, 54.0 mV, 3.00 A, 12.3 kΩ. */
  function unit(v, u, sig = 3) {
    const s = eng(v, sig);
    if (!u) return s;
    const parts = s.split(' ');
    // parts = [number, prefix] when a prefix was applied, else [number]
    return parts.length === 2 ? `${parts[0]}\u00A0${parts[1]}${u}` : `${s}\u00A0${u}`;
  }

  /* Fixed-decimal formatting that never returns "-0.0". */
  function fixed(v, dp = 2) {
    if (!isFinite(v)) return '\u2014';
    const r = Number(v.toFixed(dp));
    return (Object.is(r, -0) ? 0 : r).toFixed(dp);
  }

  /* ------------------------------------------------------------------------ 4. Stage — HiDPI canvas wrapper with an optional rAF loop ------------------------------------------------------------------------ */
  /* * @param {HTMLCanvasElement} canvas * @param {(ctx:CanvasRenderingContext2D, w:number, h:number, stage:Stage)=>void} render * @param {{animate?:boolean}} [opts] animate=true keeps a rAF loop running * (it auto-pauses when the canvas scrolls out of view to save CPU). */
  class Stage {
    constructor(canvas, render, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.render = render;
      this.animate = !!opts.animate;
      this.w = 0; this.h = 0; this.dpr = 1;
      this.t = 0;                 // accumulated time in seconds (animation)
      this.pointer = { x: 0, y: 0, down: false, inside: false };
      this._raf = 0; this._last = 0; this._visible = true; this._running = false;

      this.resize();
      this._observeResize();
      this._observeVisibility();
      if (this.animate) this.start(); else this.draw();
    }

    /* Re-read the CSS size and scale the backing store for crisp rendering. */
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      if (w === this.w && h === this.h && dpr === this.dpr) return false;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      // All drawing code below works in CSS pixels.
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }

    _observeResize() {
      if (typeof ResizeObserver === 'function') {
        this._ro = new ResizeObserver(() => { this.resize(); this.draw(); });
        this._ro.observe(this.canvas);
      } else {                                    // graceful fallback
        window.addEventListener('resize', () => { this.resize(); this.draw(); });
      }
    }

    /* Pause the animation loop when the canvas is off-screen (battery/CPU). */
    _observeVisibility() {
      if (typeof IntersectionObserver !== 'function') return;
      this._io = new IntersectionObserver(entries => {
        for (const en of entries) {
          this._visible = en.isIntersecting;
          if (this._visible && this._running) { this._last = 0; this._tick(); }
        }
      }, { threshold: 0.01 });
      this._io.observe(this.canvas);
    }

    draw() { if (this.w && this.h) this.render(this.ctx, this.w, this.h, this); }

    start() {
      if (this._running) return;
      this._running = true; this._last = 0;
      this._tick();
    }
    stop() { this._running = false; if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }

    _tick() {
      if (!this._running) return;
      this._raf = requestAnimationFrame(now => {
        if (!this._running) return;
        if (!this._last) this._last = now;
        // Clamp dt so a backgrounded tab does not produce a huge time jump.
        const dt = clamp((now - this._last) / 1000, 0, 0.05);
        this._last = now;
        this.t += dt;
        this.resize();
        this.render(this.ctx, this.w, this.h, this, dt);
        if (this._visible) this._tick(); else this._raf = 0;
      });
    }

    /* * Attach unified mouse + touch input. Coordinates are delivered in the * same CSS-pixel space the render function uses. * @param {(p:{x:number,y:number,down:boolean,type:string,e:PointerEvent})=>void} handler */
    onPointer(handler) {
      const toLocal = (e) => {
        const r = this.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      this.canvas.addEventListener('pointerdown', e => {
        const p = toLocal(e);
        this.pointer = { ...p, down: true, inside: true };
        // Keep receiving move events even if the pointer leaves the canvas.
        if (this.canvas.setPointerCapture) { try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {} }
        handler({ ...p, down: true, type: 'down', e });
        e.preventDefault();
      });
      this.canvas.addEventListener('pointermove', e => {
        const p = toLocal(e);
        this.pointer = { ...p, down: this.pointer.down, inside: true };
        handler({ ...p, down: this.pointer.down, type: 'move', e });
      });
      const up = e => {
        const p = toLocal(e);
        this.pointer.down = false;
        handler({ ...p, down: false, type: 'up', e });
      };
      this.canvas.addEventListener('pointerup', up);
      this.canvas.addEventListener('pointercancel', up);
      this.canvas.addEventListener('pointerleave', () => {
        this.pointer.inside = false; this.pointer.down = false;
        handler({ ...this.pointer, type: 'leave', e: null });
      });
      return this;
    }
  }

  /* ------------------------------------------------------------------------ 5. Drawing helpers (shared by several simulations) ------------------------------------------------------------------------ */
  /* Rounded rectangle that works even where ctx.roundRect is unavailable. */
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* Arrow from (x1,y1) to (x2,y2) with a filled head. */
  function arrow(ctx, x1, y1, x2, y2, { color = '#a8d3e0', width = 2.5, head = 9, dash = null } = {}) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.5) return;
    const shaft = Math.max(0, len - head * 0.85);
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + Math.cos(ang) * shaft, y1 + Math.sin(ang) * shaft);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang - 0.42) * head, y2 - Math.sin(ang - 0.42) * head);
    ctx.lineTo(x2 - Math.cos(ang + 0.42) * head, y2 - Math.sin(ang + 0.42) * head);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* Small label with a dark halo so it stays legible over any drawing. */
  function label(ctx, text, x, y, { color = '#e8eefb', size = 12, align = 'center', baseline = 'middle', halo = true, weight = '600' } = {}) {
    ctx.save();
    ctx.font = `${weight} ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = align; ctx.textBaseline = baseline;
    if (halo) {
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(4,8,16,.85)';
      ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  /* Draw a point charge as a flat sticker: pastel disc, cream ring, dark sign. No gradients and no glow, per the flat-art policy. */
  function chargeGlyph(ctx, x, y, r, q, { pulse = 0 } = {}) {
    const pos = q >= 0;
    ctx.save();
    ctx.fillStyle = pos ? '#f8aebe' : '#a8d3e0';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(246,241,229,.85)'; ctx.stroke();

    // sign
    ctx.strokeStyle = '#2b2d33'; ctx.lineWidth = Math.max(2, r * 0.18); ctx.lineCap = 'round';
    const s = r * 0.46;
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.stroke();
    if (pos) { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke(); }
    ctx.restore();
  }

  /* ------------------------------------------------------------------------ 6. Storage wrapper — localStorage can throw (private mode, sandboxed iframe, file:// in some browsers), so we fall back to memory. ------------------------------------------------------------------------ */
  const store = (function () {
    let mem = {};
    let ok = true;
    try {
      const k = '__emc_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
    } catch (err) { ok = false; }
    return {
      available: ok,
      get(key) {
        try { return ok ? window.localStorage.getItem(key) : (key in mem ? mem[key] : null); }
        catch (e) { return key in mem ? mem[key] : null; }
      },
      set(key, value) {
        try { if (ok) window.localStorage.setItem(key, value); else mem[key] = value; }
        catch (e) { mem[key] = value; }
      },
      remove(key) {
        try { if (ok) window.localStorage.removeItem(key); delete mem[key]; } catch (e) {}
      }
    };
  })();

  /* ------------------------------------------------------------------------ 7. Progress tracking ------------------------------------------------------------------------ */
  const TOPICS = ['charges', 'current', 'magnetism', 'induction'];
  const PROGRESS_KEY = 'emc.progress.v1';

  const Progress = {
    /* @returns {{topics:Object<string,boolean>,quizBest:number,quizAttempts:number,quizLast:number,updatedAt:string}} */
    read() {
      const blank = {
        topics: { charges: false, current: false, magnetism: false, induction: false },
        quizBest: 0, quizAttempts: 0, quizLast: 0,
        quizHistory: [],          // [{ pct, at }] — newest last, capped at 20
        updatedAt: null
      };
      const raw = store.get(PROGRESS_KEY);
      if (!raw) return blank;
      try {
        const p = JSON.parse(raw);
        return {
          topics: Object.assign(blank.topics, p.topics || {}),
          quizBest: Number(p.quizBest) || 0,
          quizAttempts: Number(p.quizAttempts) || 0,
          quizLast: Number(p.quizLast) || 0,
          quizHistory: Array.isArray(p.quizHistory) ? p.quizHistory.slice(-20) : [],
          updatedAt: p.updatedAt || null
        };
      } catch (e) { return blank; }
    },
    write(p) { p.updatedAt = new Date().toISOString(); store.set(PROGRESS_KEY, JSON.stringify(p)); },
    markTopic(id, done = true) {
      const p = this.read();
      if (id in p.topics) { p.topics[id] = !!done; this.write(p); }
      return p;
    },
    isTopicDone(id) { return !!this.read().topics[id]; },
    /* Record a quiz attempt. @param {number} pct percentage 0-100 */
    recordQuiz(pct) {
      const p = this.read();
      p.quizAttempts += 1;
      p.quizLast = pct;
      p.quizBest = Math.max(p.quizBest, pct);
      p.quizHistory = (p.quizHistory || []).concat([{ pct, at: new Date().toISOString() }]).slice(-20);
      // as promised on the home dashboard: a passing score counts as having
      // studied all four topics
      if (pct >= 70) TOPICS.forEach(t => { p.topics[t] = true; });
      this.write(p);
      return p;
    },
    /* 0-100 completion: 80% weight on topics read, 20% on best quiz score. */
    percent() {
      const p = this.read();
      const done = TOPICS.filter(t => p.topics[t]).length;
      return Math.round((done / TOPICS.length) * 80 + (p.quizBest / 100) * 20);
    },
    reset() { store.remove(PROGRESS_KEY); return this.read(); }
  };

  /* ------------------------------------------------------------------------ 8. Control binding helper (slider <-> readout <-> state) ------------------------------------------------------------------------ */
  /* * Wire an <input type="range"> to a display element and a callback. * @param {string|HTMLInputElement} el slider (or its id) * @param {string|HTMLElement} out element that shows the value (or id) * @param {(value:number)=>void} onChange * @param {(value:number)=>string} [format] formatter for the readout */
  function bindRange(el, out, onChange, format) {
    const input = typeof el === 'string' ? document.getElementById(el) : el;
    const target = typeof out === 'string' ? document.getElementById(out) : out;
    if (!input) return null;
    const fmt = format || (v => String(v));
    const apply = () => {
      const v = parseFloat(input.value);
      if (target) target.textContent = fmt(v);
      if (onChange) onChange(v);
    };
    input.addEventListener('input', apply);
    apply();
    return { input, set(v) { input.value = String(v); apply(); }, get: () => parseFloat(input.value) };
  }

  /* Radio-style segmented control: buttons inside a container with data-value. */
  function bindSegment(container, onChange) {
    const root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root) return null;
    const btns = Array.from(root.querySelectorAll('.seg-btn'));
    const select = (btn) => {
      btns.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      if (onChange) onChange(btn.dataset.value, btn);
    };
    btns.forEach(b => {
      b.addEventListener('click', () => select(b));
      if (b.getAttribute('aria-pressed') === 'true') { /* keep initial */ }
    });
    return {
      get: () => (btns.find(b => b.getAttribute('aria-pressed') === 'true') || {}).dataset?.value,
      set: (v) => { const b = btns.find(x => x.dataset.value === v); if (b) select(b); },
      buttons: btns
    };
  }

  /* Toggle button group (aria-pressed) */
  function bindToggles(rootSel, onChange) {
    const root = typeof rootSel === 'string' ? document.getElementById(rootSel) : rootSel;
    if (!root) return;
    root.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(on));
        if (onChange) onChange(btn.dataset.toggle, on, btn);
      });
    });
  }

  /* ------------------------------------------------------------------------ 9. Page UI: nav, reveal, reading progress, toasts, topic completion ------------------------------------------------------------------------ */
  const UI = {
    initNav() {
      const toggle = document.getElementById('navToggle');
      const menu = document.getElementById('navMenu');
      if (toggle && menu) {
        toggle.addEventListener('click', () => {
          const open = menu.classList.toggle('open');
          toggle.setAttribute('aria-expanded', String(open));
        });
        // Close the mobile menu after choosing a destination.
        menu.addEventListener('click', e => {
          if (e.target.closest('a')) { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
        });
        document.addEventListener('keydown', e => {
          if (e.key === 'Escape' && menu.classList.contains('open')) {
            menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
          }
        });
      }
      // Topics dropdown: click to toggle, close on outside click / Escape / pick
      const dropBtn = document.getElementById('topicsBtn');
      const dropMenu = document.getElementById('topicsMenu');
      if (dropBtn && dropMenu) {
        const setOpen = open => {
          dropBtn.setAttribute('aria-expanded', String(open));
          dropMenu.classList.toggle('open', open);
        };
        dropBtn.addEventListener('click', e => { e.stopPropagation(); setOpen(!dropMenu.classList.contains('open')); });
        document.addEventListener('click', e => { if (!e.target.closest('.nav-drop')) setOpen(false); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
        dropMenu.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
      }
      // Highlight the link for the current page (incl. dropdown entries).
      const here = location.pathname.split('/').pop() || 'index.html';
      document.querySelectorAll('.nav-link, .dd-link').forEach(a => {
        const target = (a.getAttribute('href') || '').split('/').pop();
        if (target === here) {
          a.classList.add('active'); a.setAttribute('aria-current', 'page');
          if (a.classList.contains('dd-link') && dropBtn) dropBtn.classList.add('active');
        }
      });
    },

    initReveal() {
      const items = document.querySelectorAll('.reveal');
      if (!items.length) return;
      if (typeof IntersectionObserver !== 'function' ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        items.forEach(el => el.classList.add('in'));
        return;
      }
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
      items.forEach(el => io.observe(el));
    },

    initReadingBar() {
      const bar = document.getElementById('readingProgress');
      if (!bar) return;
      const onScroll = () => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const pct = max > 0 ? clamp((window.scrollY / max) * 100, 0, 100) : 0;
        bar.style.width = pct.toFixed(2) + '%';
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      onScroll();
    },

    /* Transient status message (used when progress is saved). */
    toast(message, kind = 'ok') {
      let host = document.getElementById('toastHost');
      if (!host) {
        host = document.createElement('div');
        host.id = 'toastHost';
        host.setAttribute('aria-live', 'polite');
        host.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:200;display:grid;gap:.4rem;justify-items:center;pointer-events:none';
        document.body.appendChild(host);
      }
      const el = document.createElement('div');
      const color = kind === 'ok' ? '#b5d777' : kind === 'warn' ? '#f6d36b' : '#a8d3e0';
      el.style.cssText = `background:#141414;border:1px solid ${color};color:#fff;
        padding:.55rem .95rem;border-radius:999px;font-size:.86rem;font-weight:600;
        box-shadow:0 16px 34px -18px #000;opacity:0;transform:translateY(8px);
        transition:opacity .25s ease,transform .25s ease;max-width:90vw;text-align:center`;
      el.textContent = message;
      host.appendChild(el);
      requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'none'; });
      setTimeout(() => {
        el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
        setTimeout(() => el.remove(), 320);
      }, 2600);
    },

    /* "Mark this topic complete" buttons -> Progress.markTopic */
    initTopicButtons() {
      document.querySelectorAll('[data-complete-topic]').forEach(btn => {
        const id = btn.dataset.completeTopic;
        const sync = () => {
          const done = Progress.isTopicDone(id);
          btn.classList.toggle('btn-primary', !done);
          btn.innerHTML = done
            ? '<svg class="mascot-cheer" viewBox="0 0 60 56" aria-hidden="true"><path d="M19 13 C17 4 23 2 24.5 8" fill="#f6f1e5" stroke="#3a3d45" stroke-width="2"/><path d="M41 13 C43 4 37 2 35.5 8" fill="#f6f1e5" stroke="#3a3d45" stroke-width="2"/><ellipse cx="30" cy="32" rx="21" ry="20" fill="#f6f1e5" stroke="#3a3d45" stroke-width="2"/><path d="M20 30 q3 -4 6 0" stroke="#2b2d33" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M34 30 q3 -4 6 0" stroke="#2b2d33" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M27 37 q3 3 6 0" stroke="#2b2d33" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="15" cy="35" r="3" fill="#f8aebe" opacity=".85"/><circle cx="45" cy="35" r="3" fill="#f8aebe" opacity=".85"/></svg> Topic completed!'
            : 'Mark topic as complete';
          btn.setAttribute('aria-pressed', String(done));
        };
        btn.addEventListener('click', () => {
          const nowDone = !Progress.isTopicDone(id);
          Progress.markTopic(id, nowDone);
          sync();
          document.dispatchEvent(new CustomEvent('emc:progress', { detail: Progress.read() }));
          UI.toast(nowDone ? 'Progress saved \u2014 topic marked complete' : 'Topic marked as not complete');
        });
        sync();
      });
    },

    /* Show a warning banner when localStorage is unavailable. */
    initStorageNotice() {
      if (store.available) return;
      const host = document.getElementById('storageNotice');
      if (host) {
        host.hidden = false;
        host.innerHTML = '<strong>Note:</strong> this browser is blocking local storage, so progress will reset when you close the tab. Everything else works normally.';
      }
    },

    initYear() {
      document.querySelectorAll('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
    }
  };

  /* * scrollIntoView that cannot throw: it is missing in some embedded webviews * and in test environments, and smooth scrolling is never worth crashing for. */
  function scrollToEl(el, opts = { behavior: 'smooth', block: 'center' }) {
    if (el && typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView(opts); } catch (err) { /* ignore */ }
    }
  }

  /* * Typeset every [data-tex] element with KaTeX (the project's LaTeX formatter). * Each element keeps hand-readable plain text as its content, so if the KaTeX * CDN is unreachable the equation still renders legibly — just un-typeset. */
  function katexify(root) {
    if (!window.katex) return 0;
    let n = 0;
    (root || document).querySelectorAll('[data-tex]').forEach(elm => {
      if (elm.dataset.texDone) return;
      try {
        window.katex.render(elm.dataset.tex, elm, {
          displayMode: elm.hasAttribute('data-display'),
          throwOnError: false
        });
        elm.dataset.texDone = '1';
        n++;
      } catch (err) { /* keep the plain-text fallback */ }
    });
    return n;
  }

  /* * Optional: activate PRIVATELY licensed faces listed in vendor/fonts/manifest.json. * The site's own fonts (G8321 Bold + Lilita One, both SIL OFL) are committed * woff2 files declared in css/fonts.css - they render on any host with no * runtime work. This hook exists for faces you may NOT redistribute: drop the * file into vendor/fonts/ (gitignored), list it in the manifest, and it gets * registered locally via the FontFace API - a missing file degrades with ZERO * console noise (a plain @font-face would log a 404 on every page load). */
  function loadLicensedFont() {
    // vendor/fonts/manifest.json (always committed, always 200) lists the
    // licensed faces present locally, so we never probe for files that
    // might not exist: no 404 noise on hosts without them.
    const cssLink = document.querySelector('link[href$="css/site.css"]') ||
                  document.querySelector('link[href$="css/fonts.css"]');
    const base = cssLink ? cssLink.getAttribute('href').replace(/css\/[^/]+$/, '') : '';
    const note = msg => console.info('[EMC] ' + msg);
    const mark = state => { document.documentElement.dataset.licensedFont = state; };
    if (typeof window.fetch !== 'function') {          // e.g. jsdom test harness
      mark('bundled');
      return;
    }
    fetch(base + 'vendor/fonts/manifest.json', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { licensed: [] }))
      .then(man => {
        const cuts = (man && Array.isArray(man.licensed) ? man.licensed : [])
          .filter(c => c && typeof c.file === 'string');
        if (!cuts.length) {
          // normal state: the committed OFL faces ARE the site fonts
          mark('bundled');
          return;
        }
        if (typeof window.FontFace !== 'function') { mark('fallback'); return; }
        // the manifest may list alternates for one family+weight (subset woff2
        // first, full ttf second): register only the first entry that loads
        const claimed = new Set();
        cuts.forEach(c => {
          const url = base + 'vendor/fonts/' + c.file;
          const family = c.family || 'Licensed Face';
          const fmt = /\.woff2$/i.test(c.file) ? 'woff2'
                    : /\.woff$/i.test(c.file) ? 'woff'
                    : /\.otf$/i.test(c.file) ? 'opentype' : 'truetype';
          const face = new window.FontFace(family, `url(${url}) format('${fmt}')`,
            { weight: String(c.weight || 400), style: 'normal', display: 'swap' });
          face.load()
            .then(loaded => {
              const w = c.weight || 400;
              if (claimed.has(family + w)) return;      // an alternate won
              claimed.add(family + w);
              document.fonts.add(loaded);
              mark('active');
              note(`licensed font active: ${family} ${w} (${c.file})`);
            })
            .catch(() => note(`licensed cut not loadable (${c.file}) - keeping the bundled faces`));
        });
      })
      .catch(() => {
        mark('fallback');
        note('font manifest unreadable - keeping the bundled faces');
      });
  }

  /* Boot everything that is page-independent. */
  function boot() {
    UI.initNav();
    UI.initReveal();
    UI.initReadingBar();
    UI.initTopicButtons();
    UI.initStorageNotice();
    UI.initYear();
    loadLicensedFont();
    katexify(document);
    // KaTeX loads with `defer`, i.e. after this boot runs: typeset again once
    // the whole page (including deferred scripts) has finished loading.
    window.addEventListener('load', () => katexify(document));
    // Let individual pages react to progress changes (home dashboard).
    document.dispatchEvent(new CustomEvent('emc:ready', { detail: Progress.read() }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ------------------------------------------------------------------------ 10. Public API ------------------------------------------------------------------------ */
  return {
    CONST, TOPICS, PROGRESS_KEY,
    clamp, lerp, dist, roundTo, mapRange, damp,
    eng, unit, fixed,
    Stage, roundRect, arrow, label, chargeGlyph, scrollToEl, katexify, loadLicensedFont,
    store, Progress,
    bindRange, bindSegment, bindToggles,
    UI, toast: UI.toast
  };
})();
