#!/usr/bin/env node
/* ==========================================================================
   EMC Lab — runtime smoke test
   File: tools/smoke-test.mjs

   Optional developer tool. The website itself has ZERO dependencies; this
   harness only needs jsdom and is used to prove that every page boots,
   every simulation renders, every readout computes the right physics and the
   quiz scores correctly — without opening a browser.

       npm install          # installs jsdom (dev only)
       node tools/smoke-test.mjs

   If jsdom is not installed the script prints a skip notice and exits 0, so
   it is safe to wire into CI.

   Exits 1 if any assertion fails.
   ========================================================================== */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/* ---------- jsdom is optional ------------------------------------------- */
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch {
  console.log('jsdom is not installed — skipping the runtime smoke test.');
  console.log('Run `npm install` in the project root to enable it.');
  process.exit(0);
}

/* ---------- tiny assertion framework ------------------------------------ */
let pass = 0;
const failures = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`   \u2713 ${name}`); }
  else { failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`   \u2717 ${name}${extra ? ' — ' + extra : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, String(actual) === String(expected), `got "${actual}", expected "${expected}"`);
}
function numClose(name, actual, expected, tol = 0.02) {
  const a = Number(actual), e = Number(expected);
  ok(name, isFinite(a) && Math.abs(a - e) <= Math.abs(e) * tol, `got ${a}, expected \u2248${e}`);
}

/* ---------- canvas + layout mocks --------------------------------------- */
function installMocks(win) {
  // Give elements a realistic size (jsdom reports zeros for everything).
  win.Element.prototype.getBoundingClientRect = function () {
    const isCanvas = this.tagName === 'CANVAS';
    const w = isCanvas ? 900 : 1200, h = isCanvas ? 400 : 200;
    return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON() {} };
  };
  // Count drawing calls so we can prove a canvas really rendered.
  win.HTMLCanvasElement.prototype.getContext = function () {
    if (this.__stats) return this.__ctx;
    const stats = { calls: 0, text: [] };
    this.__stats = stats;
    const gradient = { addColorStop() {} };
    const target = {
      canvas: this,
      getLineDash: () => [],
      measureText: t => ({ width: String(t ?? '').length * 6 }),
      fillText: t => { stats.calls++; stats.text.push(String(t)); },
      strokeText: t => { stats.calls++; },
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient
    };
    this.__ctx = new Proxy(target, {
      get(t, prop) {
        if (prop in t) return t[prop];
        return () => { stats.calls++; };        // every other 2D method: no-op
      },
      set(t, prop, v) { t[prop] = v; return true; }
    });
    return this.__ctx;
  };
}
const drawCalls = (win, sel) => {
  const c = win.document.querySelector(sel);
  return c && c.__stats ? c.__stats.calls : 0;
};
const drawnText = (win, sel) => (win.document.querySelector(sel)?.__stats?.text || []);

/* ---------- page loader -------------------------------------------------- */
async function loadPage(relPath, globals = {}) {
  const file = join(ROOT, relPath);
  let html = readFileSync(file, 'utf8')
    // never fetch the Tailwind CDN inside the test
    .replace(/<script src="https:\/\/cdn\.tailwindcss\.com"[^>]*><\/script>/g, '');

  const problems = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => problems.push('jsdomError: ' + (e.message || e)));
  vc.on('error', (...a) => problems.push('console.error: ' + a.join(' ')));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,          // provides requestAnimationFrame
    url: 'http://localhost/',          // enables localStorage
    virtualConsole: vc
  });
  installMocks(dom.window);
  for (const [k, v] of Object.entries(globals)) dom.window[k] = v;

  // run the page's own local scripts, in document order
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)]
    .map(m => m[1]).filter(s => !/^https?:/.test(s));
  for (const src of scripts) {
    const code = readFileSync(resolve(dirname(file), src), 'utf8');
    dom.window.eval(code);
  }
  return { dom, win: dom.window, doc: dom.window.document, problems, scripts };
}

const frames = (win, n = 6) => new Promise(r => {
  let i = 0;
  const step = () => (++i >= n ? r() : win.requestAnimationFrame(step));
  win.requestAnimationFrame(step);
});
const setRange = (win, id, value) => {
  const el = win.document.getElementById(id);
  if (!el) throw new Error('missing slider #' + id);
  el.value = String(value);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  return el;
};
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const pointer = (win, el, type, x, y) =>
  el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
const txt = (win, id) => win.document.getElementById(id)?.textContent?.trim() ?? null;

/** Parse "399 mN" / "16.0 fN" / "131 ns" back into a base-SI number. */
const SI = { f: 1e-15, p: 1e-12, n: 1e-9, '\u00B5': 1e-6, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12 };
function parseSI(str) {
  if (str === null) return NaN;
  const m = /^(-?[\d.]+)(?:e([+-]?\d+))?\s*([fpn\u00B5umkMGT])?/.exec(String(str).trim());
  if (!m) return NaN;
  let v = parseFloat(m[1]);
  if (m[2]) v *= Math.pow(10, parseInt(m[2], 10));
  if (m[3]) v *= SI[m[3]];
  return v;
}

/* ======================================================================== */
console.log('\n' + '\u2500'.repeat(66));
console.log('EMC Lab — runtime smoke test (jsdom)');
console.log('\u2500'.repeat(66));

/* ---------------- index.html ---------------- */
{
  console.log('\n[index.html]');
  const { win, doc, problems } = await loadPage('index.html');
  await frames(win, 8);
  ok('no runtime errors', problems.length === 0, problems.join(' | '));
  ok('progress ring shows a percentage', /^\d+%$/.test(txt(win, 'ringPct') || ''), txt(win, 'ringPct'));
  eq('starts at 0% with empty storage', txt(win, 'ringPct'), '0%');
  eq('topic counter text', txt(win, 'dashTopicsDone'), '0 of 4 topics studied');
  eq('chip mirrors the counter', txt(win, 'dashTopicsChip'), '0 of 4 topics studied');
  ok('hero canvas rendered', drawCalls(win, '#heroCanvas') > 200, `${drawCalls(win, '#heroCanvas')} calls`);
  ok('hero animation draws field-line labels', drawnText(win, '#heroCanvas').some(t => t.includes('E = k q')), '');
  eq('storage status reported', txt(win, 'storageStatus'), 'enabled \u2014 your progress is saved in this browser');
  eq('year filled in', doc.querySelector('[data-year]').textContent, String(new Date().getFullYear()));

  // progress persistence: mark a topic, reload the same storage, re-render
  win.EMC.Progress.markTopic('charges', true);
  win.EMC.Progress.recordQuiz(85);
  eq('percent weights topics (80%) + quiz (20%)', win.EMC.Progress.percent(), Math.round(0.25 * 80 + 0.85 * 20));
  win.window?.close?.(); win.close();
}

/* ---------------- topics/charges.html ---------------- */
{
  console.log('\n[topics/charges.html]');
  const { win, doc, problems } = await loadPage('topics/charges.html');
  await frames(win, 4);
  ok('no runtime errors', problems.length === 0, problems.join(' | '));
  ok('coulomb canvas rendered', drawCalls(win, '#sim-coulomb') > 100);
  ok('field canvas rendered', drawCalls(win, '#sim-efield') > 300);

  // --- Coulomb physics: +2 uC / -2 uC at 0.30 m must give 0.399 N ---
  setRange(win, 'coul-q1', 2);
  setRange(win, 'coul-q2', -2);
  setRange(win, 'coul-r', 0.3);
  const K = 8.987551787e9;
  numClose('Coulomb force 2 uC/-2 uC @ 0.30 m', parseSI(txt(win, 'coul-force')), K * 4e-12 / 0.09, 0.005);
  ok('force reported as attractive', /Attractive/.test(txt(win, 'coul-nature')), txt(win, 'coul-nature'));
  ok('substitution line shows the working with real <sup> markup',
    /8\.99×10<sup>9<\/sup>/.test(doc.getElementById('coul-substitution').innerHTML),
    doc.getElementById('coul-substitution').innerHTML);

  // --- inverse square law: doubling r quarters F ---
  const F1 = parseSI(txt(win, 'coul-force'));
  setRange(win, 'coul-r', 0.6);
  numClose('doubling r quarters the force', parseSI(txt(win, 'coul-force')), F1 / 4, 0.01);

  setRange(win, 'coul-q2', 2);
  ok('like charges repel', /Repulsive/.test(txt(win, 'coul-nature')), txt(win, 'coul-nature'));

  // --- preset buttons drive the sliders ---
  click(win, doc.querySelector('[data-coul-preset="5,5,0.10"]'));
  eq('preset sets q1', doc.getElementById('coul-q1').value, '5');
  eq('preset sets r', doc.getElementById('coul-r').value, '0.1');

  // --- field explorer ---
  click(win, doc.querySelector('[data-ef-preset="like"]'));
  eq('two like charges counted', txt(win, 'ef-count'), '2');
  eq('net charge of the preset', txt(win, 'ef-net'), '+8.0 µC');
  click(win, doc.querySelector('[data-ef-preset="dipole"]'));
  eq('dipole net charge is zero', txt(win, 'ef-net'), '0.0 µC');
  pointer(win, doc.getElementById('sim-efield'), 'pointermove', 300, 200);
  ok('probe reports a field magnitude', /N\/C/.test(txt(win, 'ef-emag') || ''), txt(win, 'ef-emag'));
  ok('probe reports a force on +1 nC', /N/.test(txt(win, 'ef-force') || ''), txt(win, 'ef-force'));
  // adding a charge with the + tool
  const plus = doc.querySelector('#ef-brush [data-value="add+"]');
  click(win, plus);
  pointer(win, doc.getElementById('sim-efield'), 'pointerdown', 500, 250);
  eq('clicking with the + tool adds a charge', txt(win, 'ef-count'), '3');
  click(win, doc.getElementById('ef-clear'));
  eq('clear empties the canvas', txt(win, 'ef-count'), '0');
  win.close();
}

/* ---------------- topics/current.html ---------------- */
{
  console.log('\n[topics/current.html]');
  const { win, doc, problems } = await loadPage('topics/current.html');
  await frames(win, 6);
  ok('no runtime errors', problems.length === 0, problems.join(' | '));
  ok('ohm canvas rendered', drawCalls(win, '#sim-ohm') > 100);
  ok('I-V chart rendered', drawCalls(win, '#sim-ohm-chart') > 50);
  ok('circuit canvas rendered', drawCalls(win, '#sim-circuit') > 150);

  // --- Ohm's law: 12 V across 4 ohm must give exactly 3 A and 36 W ---
  setRange(win, 'ohm-V', 12);
  const rNum = doc.getElementById('ohm-Rnum');
  rNum.value = '4';
  rNum.dispatchEvent(new win.Event('change', { bubbles: true }));
  numClose('I = V/R = 12/4', parseSI(txt(win, 'ohm-I')), 3, 0.001);
  numClose('P = VI = 36 W', parseSI(txt(win, 'ohm-P')), 36, 0.001);
  ok('substitution line shows V, R and I', /12\.0 V ÷ 4\.00 Ω = 3\.000 A/.test(txt(win, 'ohm-sub')), txt(win, 'ohm-sub'));
  ok('sub-line reports the carrier rate, not a stacked prefix', /electrons\/s/.test(txt(win, 'ohm-ImA')), txt(win, 'ohm-ImA'));
  ok('power rating warning triggers at 36 W > 0.5 W', doc.getElementById('ohm-warn').hidden === false);
  eq('ammeter auto-ranges to 5 A', txt(win, 'ohm-range'), '5 A');

  setRange(win, 'ohm-V', 0);
  eq('zero volts gives zero current', parseSI(txt(win, 'ohm-I')), 0);
  ok('warning clears at 0 W', doc.getElementById('ohm-warn').hidden === true);

  // --- circuit builder: series 10 + 22 + 47 with a 15 ohm bulb at 12 V ---
  eq('series bank R = 79 ohm', txt(win, 'circ-req'), '79.00 Ω');
  eq('series total R = 94 ohm', txt(win, 'circ-rtotal'), '94.00 Ω');
  numClose('V across the bank + bulb = 12 V',
    parseSI(txt(win, 'circ-vbank')) + parseSI(txt(win, 'circ-vbulb')), 12, 0.005);
  numClose('series current = 12/94', parseSI(txt(win, 'circ-itotal')), 12 / 94, 0.005);
  eq('table lists 3 resistors + bulb', doc.querySelectorAll('#circ-table tr').length, 4);
  ok('series working is shown', txt(win, 'circ-breakdown').includes('10 + 22 + 47'), txt(win, 'circ-breakdown'));

  // --- parallel: 1/(1/10+1/22+1/47) = 6.00 ohm ---
  click(win, doc.querySelector('#circ-topology [data-value="parallel"]'));
  eq('parallel bank R = 6.00 ohm', txt(win, 'circ-req'), '6.00 Ω');
  ok('parallel working uses conductances', txt(win, 'circ-breakdown').includes('1/R'), txt(win, 'circ-breakdown'));

  // --- combination: R1 + (R2 || R3) ---
  click(win, doc.querySelector('#circ-topology [data-value="combo"]'));
  const r = [10, 22, 47];
  const expected = r[0] + (r[1] * r[2]) / (r[1] + r[2]);
  numClose('combo bank R', parseFloat(txt(win, 'circ-req')), expected, 0.005);
  eq('combo table has exactly 3 resistors + bulb', doc.querySelectorAll('#circ-table tr').length, 4);

  // --- Kirchhoff: series branch currents are identical ---
  click(win, doc.querySelector('#circ-topology [data-value="series"]'));
  const rows = [...doc.querySelectorAll('#circ-table tr')].slice(0, 3).map(tr => tr.children[3].textContent);
  ok('series current is the same through every resistor', new Set(rows).size === 1, rows.join(' / '));

  // --- predict-then-run strip grades against the simulator itself ---
  ok('circuit challenge strip is live', (txt(win, 'circ-chal-text') || '').length > 20, txt(win, 'circ-chal-text'));
  eq('three prediction choices offered', doc.querySelectorAll('#circ-chal-opts button').length, 3);
  doc.querySelector('#circ-chal-opts button').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('prediction feedback appears', doc.getElementById('circ-chal-fb').className.includes('feedback') &&
    !doc.getElementById('circ-chal-fb').className.includes('is-hidden'));
  ok('try-it button revealed after answering', doc.getElementById('circ-chal-try').hidden === false);

  // --- editing a resistor updates the analysis ---
  const firstSlider = doc.getElementById('circ-r0');
  firstSlider.value = '50';
  firstSlider.dispatchEvent(new win.Event('input', { bubbles: true }));
  eq('editing R1 to 50 ohm gives a 119 ohm bank', txt(win, 'circ-req'), '119.00 Ω');

  // --- the bulb can be bypassed ---
  const bypass = doc.getElementById('circ-includeBulb');
  bypass.checked = false;
  bypass.dispatchEvent(new win.Event('change', { bubbles: true }));
  eq('bypassing the bulb makes R_total = R_bank', txt(win, 'circ-rtotal'), txt(win, 'circ-req'));
  win.close();
}

/* ---------------- topics/magnetism.html ---------------- */
{
  console.log('\n[topics/magnetism.html]');
  const { win, doc, problems } = await loadPage('topics/magnetism.html');
  await frames(win, 6);
  ok('no runtime errors', problems.length === 0, problems.join(' | '));
  ok('magnet canvas rendered', drawCalls(win, '#sim-magnet') > 300);
  ok('lorentz canvas rendered', drawCalls(win, '#sim-lorentz') > 80);

  eq('dipole moment readout', txt(win, 'mag-moment'), '0.60 A·m²');
  ok('pole strength is m/l', /A·m/.test(txt(win, 'mag-pole')), txt(win, 'mag-pole'));
  const filingsBtn = doc.querySelector('[data-toggle="filings"]');
  click(win, filingsBtn);
  eq('filings layer toggles on', filingsBtn.getAttribute('aria-pressed'), 'true');
  setRange(win, 'mag-angle', 90);
  eq('angle slider updates the readout', txt(win, 'mag-anglev'), '90°');
  pointer(win, doc.getElementById('sim-magnet'), 'pointermove', 200, 120);
  ok('probe reports |B| in tesla', /T/.test(txt(win, 'mag-bprobe') || ''), txt(win, 'mag-bprobe'));
  ok('probe compares with Earth’s field', /Earth/.test(txt(win, 'mag-bprobe-uT') || ''), txt(win, 'mag-bprobe-uT'));

  // --- Lorentz force: proton, 2e5 m/s, 0.5 T ---
  // F = qvB = 1.602e-19*2e5*0.5 = 1.60e-14 N ; r = mv/qB = 4.18 mm ; T = 131 ns
  const e = 1.602176634e-19, mp = 1.67262192369e-27, v0 = 2e5, B0 = 0.5;
  numClose('|F| = qvB', parseSI(txt(win, 'lor-force')), e * v0 * B0, 0.01);
  numClose('orbit radius r = mv/qB', parseSI(txt(win, 'lor-radius')), mp * v0 / (e * B0), 0.01);
  numClose('period T = 2 pi m/qB', parseSI(txt(win, 'lor-period')), 2 * Math.PI * mp / (e * B0), 0.01);
  numClose('kinetic energy = 1/2 mv^2 (in eV)', parseSI(txt(win, 'lor-ke')), 0.5 * mp * v0 * v0 / e, 0.01);
  numClose('kinetic energy sub-line in joules', parseSI(txt(win, 'lor-kev')), 0.5 * mp * v0 * v0, 0.01);
  ok('prefixes are never stacked', !/(m|µ|n|p|k)(m|µ|n|p|k)[A-Z]/.test(txt(win, 'lor-force')));
  eq('force points down for v=right, B=out, q>0', txt(win, 'lor-dir'), 'down ↓');

  // flipping the field reverses the force
  click(win, doc.querySelector('#lor-bdir [data-value="in"]'));
  eq('reversing B reverses F', txt(win, 'lor-dir'), 'up ↑');
  // an electron reverses it again
  click(win, doc.querySelector('#lor-particle [data-value="electron"]'));
  eq('electron curves the other way', txt(win, 'lor-dir'), 'down ↓');
  ok('negative-charge rule is explained', /REVERSE/.test(txt(win, 'lor-rule')), txt(win, 'lor-rule'));
  click(win, doc.querySelector('#lor-particle [data-value="proton"]'));
  click(win, doc.querySelector('#lor-bdir [data-value="out"]'));

  // doubling B halves the radius
  const r0 = parseSI(txt(win, 'lor-radius'));
  setRange(win, 'lor-B', 1.0);
  numClose('doubling B halves r', parseSI(txt(win, 'lor-radius')), r0 / 2, 0.01);
  setRange(win, 'lor-B', 0.5);

  // --- right-hand-rule challenge ---
  click(win, doc.querySelector('[data-lor-answer="down"]'));
  ok('correct challenge answer is accepted', /Correct/.test(txt(win, 'lor-challenge-feedback')), txt(win, 'lor-challenge-feedback'));
  ok('the correct button is highlighted', doc.querySelector('[data-lor-answer="down"]').classList.contains('correct'));
  click(win, doc.getElementById('lor-challenge-new'));
  ok('a new scenario re-enables the buttons', doc.querySelectorAll('[data-lor-answer]:not([disabled])').length === 4);
  win.close();
}

/* ---------------- topics/induction.html ---------------- */
{
  console.log('\n[topics/induction.html]');
  const { win, doc, problems } = await loadPage('topics/induction.html');
  await frames(win, 4);
  ok('no runtime errors', problems.length === 0, problems.join(' | '));
  ok('induction canvas rendered', drawCalls(win, '#sim-induction') > 150);
  ok('p5.js lab lazy-loads (injects on approach, notice if blocked)',
    /could not be loaded/.test(doc.getElementById('p5-gen-host').textContent) ||
    doc.getElementById('p5-gen-host').dataset.p5 === 'loading');

  // stationary magnet -> no EMF at all
  eq('a stationary magnet induces nothing', parseSI(txt(win, 'ind-emf')), 0);
  eq('galvanometer reads zero', parseSI(txt(win, 'ind-I')), 0);
  eq('direction readout explains why', txt(win, 'ind-dir'), 'no induced current');
  ok('flux is non-zero while the magnet sits off-centre', parseSI(txt(win, 'ind-phi')) > 0, txt(win, 'ind-phi'));
  ok('Lenz panel explains the zero', /not changing/.test(txt(win, 'ind-lenz')), txt(win, 'ind-lenz'));

  // exact dipole flux check: Phi = mu0*m*a^2 / (2*(a^2+z^2)^1.5)
  const mu0 = 4 * Math.PI * 1e-7, m = 0.8, a = 0.02, z = -0.075;
  const phiExpected = mu0 * m * a * a / (2 * Math.pow(a * a + z * z, 1.5));
  numClose('Phi per turn matches the closed form', parseSI(txt(win, 'ind-phi')), phiExpected, 0.01);
  numClose('lambda = N * Phi', parseSI(txt(win, 'ind-lambda')), 800 * phiExpected, 0.01);
  ok('flux units are not double-prefixed', !/µm|mµ|nµ/.test(txt(win, 'ind-phi')), txt(win, 'ind-phi'));

  // push the magnet through: an EMF must appear and then change sign
  click(win, doc.querySelector('[data-ind-mode="push"]'));
  const emfs = [], dirs = [], currents = [];
  for (let i = 0; i < 90; i++) {
    await frames(win, 1);
    emfs.push(parseSI(txt(win, 'ind-emf')));
    dirs.push(txt(win, 'ind-dir') || '');
    currents.push(parseSI(txt(win, 'ind-I')));
  }
  const peak = Math.max(...emfs.map(Math.abs));
  ok('motion induces a measurable EMF', peak > 1e-3, `peak |EMF| = ${(peak * 1000).toFixed(1)} mV`);
  ok('the EMF changes sign as the magnet passes the centre',
    Math.min(...emfs) < 0 && Math.max(...emfs) > 0,
    `min ${(Math.min(...emfs) * 1000).toFixed(1)} mV / max ${(Math.max(...emfs) * 1000).toFixed(1)} mV`);
  ok('a current flows while the magnet moves', Math.max(...currents.map(Math.abs)) > 1e-5,
    `${(Math.max(...currents.map(Math.abs)) * 1000).toFixed(2)} mA peak`);
  ok('the strip chart recorded history', drawCalls(win, '#sim-induction-chart') > 40);
  ok('Lenz direction is stated during the motion',
    dirs.some(d => /\b(CW|CCW)\b/.test(d)), [...new Set(dirs)].join(' / '));
  ok('the sense reverses as flux switches from rising to falling',
    dirs.some(d => /\bCW\b/.test(d)) && dirs.some(d => /\bCCW\b/.test(d)),
    [...new Set(dirs)].join(' / '));
  ok('I = EMF/R at every sample', emfs.every((emf, i) => Math.abs(currents[i] - emf / 10) < 1e-9));

  ok('induction challenge strip is live', (txt(win, 'ind-chal-text') || '').length > 20, txt(win, 'ind-chal-text'));
  eq('three induction prediction choices', doc.querySelectorAll('#ind-chal-opts button').length, 3);

  // Faraday scaling: EMF is proportional to N. Use the deterministic
  // oscillation so both runs sample exactly the same motion.
  const runOscillation = async () => {
    click(win, doc.getElementById('ind-reset'));
    click(win, doc.querySelector('[data-ind-mode="oscillate"]'));
    const seen = [];
    for (let i = 0; i < 90; i++) { await frames(win, 1); seen.push(Math.abs(parseSI(txt(win, 'ind-emf')))); }
    click(win, doc.querySelector('[data-ind-mode="manual"]'));
    return Math.max(...seen);
  };
  setRange(win, 'ind-N', 800);
  const peak800 = await runOscillation();
  setRange(win, 'ind-N', 1600);
  const peak1600 = await runOscillation();
  numClose('EMF scales linearly with N (800 -> 1600 turns)', peak1600, peak800 * 2, 0.10);
  ok('oscillating the magnet produces an alternating EMF', peak800 > 1e-3, `${(peak800 * 1000).toFixed(1)} mV peak`);

  // R changes the current but not the EMF
  click(win, doc.getElementById('ind-reset'));
  click(win, doc.querySelector('[data-ind-mode="push"]'));
  await frames(win, 12);
  const emfR10 = parseSI(txt(win, 'ind-emf')), iR10 = parseSI(txt(win, 'ind-I'));
  setRange(win, 'ind-R', 40);
  numClose('quadrupling R leaves the EMF unchanged', parseSI(txt(win, 'ind-emf')), emfR10, 0.02);
  numClose('quadrupling R quarters the current', parseSI(txt(win, 'ind-I')), iR10 / 4, 0.02);
  win.close();
}

/* ---------------- quiz.html ---------------- */
{
  console.log('\n[quiz.html]');
  const { win, doc, problems } = await loadPage('quiz.html');
  await frames(win, 2);
  ok('no runtime errors', problems.length === 0, problems.join(' | '));
  const bank = win.EMC_QUIZ;
  eq('question bank size', bank.length, 25);
  eq('every question rendered', doc.querySelectorAll('.q-card').length, 25);
  eq('four options each', doc.querySelectorAll('.q-card').length * 4, doc.querySelectorAll('.opt').length);
  ok('every question has a valid answer index',
    bank.every(q => Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length));
  ok('every question has an explanation', bank.every(q => q.explain && q.explain.length > 20));
  ok('all four topics are covered',
    new Set(bank.map(q => q.topic)).size === 4, [...new Set(bank.map(q => q.topic))].join(','));
  eq('topic filter counts — charges', bank.filter(q => q.topic === 'charges').length, 6);
  eq('topic filter counts — current', bank.filter(q => q.topic === 'current').length, 7);
  eq('topic filter counts — magnetism', bank.filter(q => q.topic === 'magnetism').length, 5);
  eq('topic filter counts — induction', bank.filter(q => q.topic === 'induction').length, 7);

  const answerAll = (pickWrong) => {
    doc.querySelectorAll('.q-card').forEach(card => {
      const q = bank.find(x => x.id === Number(card.dataset.qid));
      const idx = pickWrong ? (q.answer + 1) % q.options.length : q.answer;
      card.querySelector(`.opt[data-opt="${idx}"]`).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    });
  };

  // blank guard: submitting with nothing answered must warn, not grade
  click(win, doc.getElementById('quiz-submit'));
  ok('submitting a blank quiz warns first', doc.getElementById('quiz-score').hidden === true);
  ok('progress text counts answers', /0 of 25 answered/.test(txt(win, 'quiz-progress-text')), txt(win, 'quiz-progress-text'));

  // all correct -> 100%
  answerAll(false);
  eq('all 25 recorded', txt(win, 'quiz-progress-text'), '25 of 25 answered');
  click(win, doc.getElementById('quiz-submit'));
  ok('score card is revealed', doc.getElementById('quiz-score').hidden === false);
  ok('without the Chart.js CDN the CSS-bar fallback is used',
    doc.getElementById('quiz-charts').hidden === true &&
    doc.getElementById('quiz-fallback-bars').hidden === false);
  ok('perfect score is 100%', txt(win, 'quiz-score').includes('100%'), txt(win, 'quiz-score').slice(0, 80));
  ok('every card marked correct', doc.querySelectorAll('.q-card.answered-correct').length === 25);
  ok('explanations are shown', doc.querySelectorAll('.feedback.good').length === 25);
  ok('options are locked after grading', doc.querySelectorAll('.opt:disabled').length === 100);

  // stored progress
  const stored = JSON.parse(win.localStorage.getItem('emc.progress.v1'));
  eq('best score saved to localStorage', stored.quizBest, 100);
  eq('attempt counter saved', stored.quizAttempts, 1);

  // retake, then all wrong -> 0%
  click(win, doc.getElementById('quiz-retake'));
  ok('retake clears the marks', doc.querySelectorAll('.q-card.answered-correct').length === 0);
  answerAll(true);
  click(win, doc.getElementById('quiz-submit'));
  ok('all-wrong score is 0%', txt(win, 'quiz-score').includes('0%'), txt(win, 'quiz-score').slice(0, 60));
  ok('wrong answers highlighted', doc.querySelectorAll('.q-card.answered-wrong').length === 25);
  ok('correct option still shown for learning', doc.querySelectorAll('.opt.correct').length === 25);
  const stored2 = JSON.parse(win.localStorage.getItem('emc.progress.v1'));
  eq('best score is kept across attempts', stored2.quizBest, 100);
  eq('attempts incremented', stored2.quizAttempts, 2);

  // review-incorrect filter
  click(win, doc.getElementById('quiz-wrong'));
  eq('review mode shows only the wrong ones', doc.querySelectorAll('.q-card').length, 25);

  // retake and check a partial score: 10 of 20 correct = 50%
  click(win, doc.getElementById('quiz-retake'));
  doc.querySelectorAll('.q-card').forEach((card, i) => {
    const q = bank.find(x => x.id === Number(card.dataset.qid));
    const idx = i < 10 ? q.answer : (q.answer + 1) % q.options.length;
    card.querySelector(`.opt[data-opt="${idx}"]`).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  });
  click(win, doc.getElementById('quiz-submit'));
  ok('10 of 25 correct scores 40%', txt(win, 'quiz-score').includes('40%'), txt(win, 'quiz-score').slice(0, 60));
  ok('10 of 25 reported', /10 \/ 25 correct/.test(txt(win, 'quiz-score')), '');
  ok('quiz clock was started by answering and frozen at submit',
    doc.getElementById('quiz-timer').hidden === false && /\d+:\d\d/.test(txt(win, 'quiz-timer')));
  ok('score card reports time and best-streak tags',
    /time \d+:\d\d/.test(txt(win, 'quiz-score')) && /best streak \u00D7/.test(txt(win, 'quiz-score')));

  // attempt history is stored for the Chart.js line chart
  const hist = win.EMC.Progress.read().quizHistory;
  eq('three attempts recorded in history', hist.length, 3);
  eq('history keeps the scores in order', hist.map(h => h.pct).join(','), '100,0,40');

  // shuffle keeps the bank intact
  click(win, doc.getElementById('quiz-retake'));
  click(win, doc.getElementById('quiz-shuffle'));
  eq('shuffle keeps all 25 questions', doc.querySelectorAll('.q-card').length, 25);

  // topic filter
  click(win, doc.querySelector('[data-quiz-filter="magnetism"]'));
  eq('magnetism filter shows 5 questions', doc.querySelectorAll('.q-card').length, 5);
  click(win, doc.querySelector('[data-quiz-filter="all"]'));
  eq('all filter restores 25', doc.querySelectorAll('.q-card').length, 25);

  // instant mode marks as you go
  click(win, doc.querySelector('#quiz-mode [data-value="instant"]'));
  const firstCard = doc.querySelector('.q-card');
  const firstQ = bank.find(x => x.id === Number(firstCard.dataset.qid));
  firstCard.querySelector(`.opt[data-opt="${firstQ.answer}"]`).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('instant mode marks immediately', doc.querySelectorAll('.q-card.answered-correct').length >= 1);
  // answer a second question correctly -> streak chip shows x2 + burst ring
  const cards2 = doc.querySelectorAll('.q-card');
  const q2 = bank.find(x => x.id === Number(cards2[1].dataset.qid));
  cards2[1].querySelector(`.opt[data-opt="${q2.answer}"]`).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  eq('streak chip shows x2', txt(win, 'quiz-streak'), 'streak \u00D72');
  ok('correct option got the burst ring', doc.querySelectorAll('.opt.burst').length >= 1);
  ok('graded feedback carries a reacting mascot', doc.querySelectorAll('.feedback .mreact').length >= 1);
  win.close();
}

/* ---------------- quiz.html with a stubbed Chart.js ---------------- */
{
  console.log('\n[quiz.html + stubbed Chart.js]');
  class FakeChart {
    constructor(canvas, config) { FakeChart.made.push({ id: canvas && canvas.id, type: config.type }); }
    destroy() { FakeChart.destroyed++; }
  }
  FakeChart.made = []; FakeChart.destroyed = 0; FakeChart.defaults = {};

  const { win, doc } = await loadPage('quiz.html', { Chart: FakeChart });
  doc.querySelectorAll('.q-card').forEach(card => {
    const q = win.EMC_QUIZ.find(x => x.id === Number(card.dataset.qid));
    card.querySelector(`.opt[data-opt="${q.answer}"]`).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  });
  doc.getElementById('quiz-submit').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  eq('three Chart.js instances created (doughnut, bar, line)', FakeChart.made.length, 3);
  eq('chart types', FakeChart.made.map(m => m.type).join(','), 'doughnut,bar,line');
  eq('charts target the score-card canvases',
    FakeChart.made.map(m => m.id).join(','), 'chart-score,chart-topics,chart-history');
  ok('with Chart.js present the CSS bars yield to the charts',
    doc.getElementById('quiz-charts').hidden === false &&
    doc.getElementById('quiz-fallback-bars').hidden === true);
  win.close();
}

/* ---------------- cross-page checks ---------------- */
{
  console.log('\n[cross-page]');
  const pages = ['index.html', 'quiz.html', 'topics/charges.html', 'topics/current.html',
    'topics/magnetism.html', 'topics/induction.html'];
  for (const p of pages) {
    const html = readFileSync(join(ROOT, p), 'utf8');
    ok(`${p}: declares a viewport`, /name="viewport"/.test(html));
    ok(`${p}: has a lang attribute`, /<html lang="en">/.test(html));
    ok(`${p}: has a skip link`, /class="skip-link"/.test(html));
    ok(`${p}: every canvas has an accessible label`,
      [...html.matchAll(/<canvas[^>]*>/g)].every(m => /aria-label=/.test(m[0])));
    ok(`${p}: links the compiled Tailwind pipeline (site.css) + font faces`,
      /css\/site\.css/.test(html) && /css\/fonts\.css/.test(html) && !/styles\.css/.test(html));
    ok(`${p}: exactly one <h1>`, (html.match(/<h1[\s>]/g) || []).length === 1);
    ok(`${p}: every script tag is defer (no render-blocking)`,
      [...html.matchAll(/<script[^>]*src=/g)].every(m => m[0].includes('defer')));
  }
  const fontsCss = readFileSync(join(ROOT, 'css/fonts.css'), 'utf8');
  ok('site fonts are committed OFL woff2 (no CDN, no licence risk)',
    /G8321/.test(fontsCss) && /M PLUS Rounded 1c/.test(fontsCss) &&
    /Lilita One/.test(fontsCss) &&
    ['g8321-700.woff2', 'm-plus-rounded-1c-700.woff2', 'lilita-one-400.woff2'].every(f =>
      existsSync(join(ROOT, 'vendor/fonts', f))));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'vendor/fonts/manifest.json'), 'utf8'));
  ok('font manifest parses and exposes the optional licensed[] slot',
    manifest && Array.isArray(manifest.licensed));
  ok('title + UI stacks lead with the committed G8321 Bold',
    /title: \['G8321'/.test(readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8')) &&
    /ui:    \['G8321'/.test(readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8')));
  ok('common.js can still activate optional licensed faces at runtime',
    /loadLicensedFont/.test(readFileSync(join(ROOT, 'js/common.js'), 'utf8')));

  const js = readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  ok('all simulation scripts are present', js.length >= 12, js.join(', '));
  // flat-art policy: no canvas gradients and no glow shadows anywhere
  const jsSrc = js.map(f => readFileSync(join(ROOT, 'js', f), 'utf8')).join('\n');
  ok('simulation art is flat (no gradients, no glow shadows)',
    !/createLinearGradient|createRadialGradient|shadowBlur/.test(jsSrc));
  // strip comments first: the policy note in the header mentions these words
  let cssSrc = readFileSync(join(ROOT, 'css/input.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  ok('type stacks lead with the two chosen faces',
    /title: \['G8321'/.test(readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8')) &&
    /sans:  \['LilitaOne-Regular'/.test(readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8')) &&
    /ui:    \['G8321'/.test(readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8')));
  ok('cascade is layer-based: base < components < utilities',
    /@layer base/.test(cssSrc) && /@layer components/.test(cssSrc) && /@tailwind utilities/.test(cssSrc));
  ok('type system is exactly the two specified families',
    /fontFamily:\s*{[\s\S]*title: \['G8321'[\s\S]*sans:  \['LilitaOne-Regular'[\s\S]*ui:    \['G8321'/
      .test(readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8')) &&
    /theme\('fontFamily\.title'\)/.test(cssSrc) && /theme\('fontFamily\.ui'\)/.test(cssSrc) && /theme\('fontFamily\.sans'\)/.test(cssSrc));
  // regression guard: an unquoted `M PLUS Rounded 1c` is an invalid declaration
  // (ident can't start with a digit) and browsers silently drop the whole
  // font-family rule. Valid compiled forms: quoted OR backslash-escaped.
  const compiledCss = readFileSync(join(ROOT, 'css/site.css'), 'utf8');
  ok('multi-word font families survive minification as valid CSS',
    /"M PLUS Rounded 1c"|M PLUS Rounded\\ 1c/.test(compiledCss) &&
    !/,M PLUS Rounded 1c[ ,;}]/.test(compiledCss));
  ok('mobile pass present (coarse-pointer targets, no sideways scroll)',
    /pointer: coarse/.test(cssSrc) && /overflow-x: clip/.test(cssSrc));
  ok('stylesheet contains no gradient/blur/glass effects',
    !/gradient|backdrop-filter|blur\(/.test(cssSrc));
  // flex or grid on a bullet li fragments <sub>/<sup> into separate items
  ok('bullet lists keep inline maths intact (marker is absolutely positioned)',
    /\.topic-list li \{ position: relative/.test(cssSrc) &&
    !/\.topic-list li \{[^}]*display: (flex|grid)/.test(cssSrc));
  ok('anchor offset defined exactly once (scroll-margin, not double offset)',
    /\[id\] \{ scroll-margin-top: calc\(var\(--header-h\)/.test(cssSrc) &&
    !/scroll-padding-top/.test(cssSrc));

  // regression guard: `blocklist` nested inside `content` makes the whole config
  // invalid — Tailwind logs the purge/content warning and silently drops the
  // blocklist, letting scanner accidents (`<table>` → .table) into site.css.
  const twCfg = readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8');
  ok('tailwind config: array-form content, top-level blocklist',
    /content: \[/.test(twCfg) && /blocklist: \[/.test(twCfg) && !/content: \{/.test(twCfg));
  const builtCss = readFileSync(join(ROOT, 'css/site.css'), 'utf8');
  ok('blocklisted prose words never leak into site.css as utilities',
    !/\.(grow|shrink|table|transform|filter|ring|container|collapse|resize|summary|content|order)\s*\{/
      .test(builtCss));
}

/* ---------------- summary ---------------- */
console.log('\n' + '\u2500'.repeat(66));
if (failures.length) {
  console.log(`\u274C ${failures.length} of ${pass + failures.length} assertions FAILED:`);
  failures.forEach(f => console.log('   - ' + f));
} else {
  console.log(`\u2705 All ${pass} assertions passed.`);
}
console.log('\u2500'.repeat(66) + '\n');
process.exit(failures.length ? 1 : 0);
