/* ==========================================================================
   Quiz engine
   File: js/quiz.js   (used on quiz.html, after js/quiz-data.js)

   Features
   --------
   * 20 multiple-choice questions, filterable by topic
   * two marking modes:
       - "Exam mode"    nothing is marked until you press Submit
       - "Instant mode" each answer is marked the moment you choose it
   * automatic scoring with a per-topic breakdown and letter band
   * worked explanations for every question (right or wrong)
   * shuffle, review-only-wrong, retake
   * best score + attempt count persisted with EMC.Progress (localStorage)
   * fully keyboard operable: options are buttons in a role="radiogroup"
   ========================================================================== */
(function () {
  const host = document.getElementById('quiz-questions');
  if (!host || !window.EMC_QUIZ) return;

  const { Progress, toast } = EMC;
  const BANK = window.EMC_QUIZ.slice();
  const KEYS = ['A', 'B', 'C', 'D', 'E'];

  /* ---- state ---------------------------------------------------------- */
  let activeCharts = [];          // Chart.js instances (destroyed on re-grade)
  const S = {
    order: BANK.slice(),          // current question order (shuffle changes this)
    filter: 'all',                // 'all' | topic id | 'wrong'
    answers: new Map(),           // question id -> chosen option index
    marked: new Map(),            // question id -> true/false (only once graded)
    submitted: false,
    instant: false,
    blankWarned: false
  };

  const el = id => document.getElementById(id);
  const visible = () => S.order.filter(q => {
    if (S.filter === 'all') return true;
    if (S.filter === 'wrong') return S.marked.get(q.id) === false;
    return q.topic === S.filter;
  });

  /* ---- rendering ------------------------------------------------------- */
  function questionHTML(q, index) {
    const chosen = S.answers.has(q.id) ? S.answers.get(q.id) : -1;
    const isMarked = S.marked.has(q.id);
    const correct = S.marked.get(q.id);
    const topicClass = { charges: 'tag-rose', current: 'tag-amber', magnetism: 'tag-violet', induction: 'tag-cyan' }[q.topic] || '';

    const opts = q.options.map((text, i) => {
      let cls = 'opt';
      if (isMarked) {
        if (i === q.answer) cls += ' correct';
        else if (i === chosen) cls += ' wrong';
      }
      // worded marks: U+2713/U+2717 are absent from several common font stacks
      const mark = isMarked && i === q.answer ? '<span class="mark">correct</span>'
        : isMarked && i === chosen ? '<span class="mark">your answer</span>' : '';
      return `<button type="button" class="${cls}" role="radio" data-opt="${i}"
                aria-checked="${i === chosen}" ${isMarked ? 'disabled' : ''}>
                <span class="key">${KEYS[i]}</span><span>${text}</span>${mark}</button>`;
    }).join('');

    let fb = '';
    if (isMarked) {
      fb = `<div class="feedback ${correct ? 'good' : 'bad'}">
              <b>${correct ? 'Correct.' : 'Not quite.'}</b> ${q.explain}
            </div>`;
    } else if (chosen >= 0) {
      fb = `<div class="feedback">Answer recorded: <b>${KEYS[chosen]}</b>. ${
        S.instant ? '' : 'It will be marked when you submit the quiz.'}</div>`;
    }

    const cardClass = isMarked ? (correct ? 'answered-correct' : 'answered-wrong') : (chosen >= 0 ? 'answered' : '');
    return `<article class="q-card ${cardClass}" data-qid="${q.id}" id="q-${q.id}">
      <div class="q-head">
        <span class="q-num">${index + 1}</span>
        <div style="min-width:0">
          <p class="q-text">${q.q}</p>
          <span class="tag ${topicClass} q-topic">${q.label}</span>
        </div>
      </div>
      <div class="opts" role="radiogroup" aria-label="Answer options for question ${index + 1}">${opts}</div>
      ${fb}
    </article>`;
  }

  function render() {
    const list = visible();
    if (!list.length) {
      host.innerHTML = `<div class="card center muted">No questions match this filter
        ${S.filter === 'wrong' ? '(nothing was incorrect \u2014 well done!)' : ''}.</div>`;
    } else {
      host.innerHTML = list.map((q, i) => questionHTML(q, i)).join('');
    }
    renderMeta();
  }

  /** Answered-count bar, counters in the sticky panel. */
  function renderMeta() {
    const list = visible();
    const answered = list.filter(q => S.answers.has(q.id)).length;
    const total = list.length;
    const pct = total ? (answered / total) * 100 : 0;
    if (el('quiz-progress-fill')) el('quiz-progress-fill').style.width = pct.toFixed(1) + '%';
    if (el('quiz-progress-text')) el('quiz-progress-text').textContent = `${answered} of ${total} answered`;
    if (el('quiz-count')) el('quiz-count').textContent = `${total} question${total === 1 ? '' : 's'}`;

    // live score while in instant mode
    if (S.instant && el('quiz-live')) {
      const marked = list.filter(q => S.marked.has(q.id));
      const right = marked.filter(q => S.marked.get(q.id) === true).length;
      el('quiz-live').hidden = marked.length === 0;
      el('quiz-live').textContent = `Marked so far: ${right}/${marked.length}`;
    } else if (el('quiz-live')) {
      el('quiz-live').hidden = true;
    }

    const submitBtn = el('quiz-submit');
    if (submitBtn) {
      submitBtn.disabled = S.submitted;
      submitBtn.textContent = S.submitted ? 'Quiz submitted' : `Submit quiz (${total})`;
    }
  }

  /* ---- answering ------------------------------------------------------- */
  host.addEventListener('click', e => {
    const btn = e.target.closest('.opt');
    if (!btn || btn.disabled) return;
    const card = btn.closest('.q-card');
    const qid = Number(card.dataset.qid);
    const q = BANK.find(x => x.id === qid);
    if (!q || S.marked.has(qid)) return;

    S.answers.set(qid, Number(btn.dataset.opt));

    if (S.instant) {
      S.marked.set(qid, S.answers.get(qid) === q.answer);
      if (S.marked.get(qid)) toast('Correct!');
      render();
      EMC.scrollToEl(document.getElementById(`q-${qid}`));
    } else {
      // light-touch update: no full re-render, so scroll position is preserved
      card.querySelectorAll('.opt').forEach(b => b.setAttribute('aria-checked', String(b === btn)));
      let fb = card.querySelector('.feedback');
      if (!fb) { fb = document.createElement('div'); fb.className = 'feedback'; card.appendChild(fb); }
      fb.innerHTML = `Answer recorded: <b>${KEYS[S.answers.get(qid)]}</b>. It will be marked when you submit the quiz.`;
      card.classList.add('answered');
      renderMeta();
    }
  });

  /* keyboard: arrow keys move between options inside a group */
  host.addEventListener('keydown', e => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const btn = e.target.closest('.opt');
    if (!btn) return;
    const group = Array.from(btn.parentElement.querySelectorAll('.opt:not([disabled])'));
    const i = group.indexOf(btn);
    const next = group[(i + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1) + group.length) % group.length];
    if (next) { next.focus(); e.preventDefault(); }
  });

  /* ---- scoring --------------------------------------------------------- */
  const BANDS = [
    { min: 90, text: 'Outstanding', cls: 'accent-emerald', note: 'You have this module mastered \u2014 try explaining Lenz\u2019s law to someone else.' },
    { min: 75, text: 'Strong', cls: 'accent-cyan', note: 'Solid understanding. Review the questions you missed and re-run the relevant simulation.' },
    { min: 60, text: 'Getting there', cls: 'accent-amber', note: 'You know the core ideas. Work through the wrong answers below, then retake the quiz.' },
    { min: 40, text: 'Keep practising', cls: 'accent-amber', note: 'Re-read the tutorial sections flagged by your wrong answers and use the simulations to build intuition.' },
    { min: 0, text: 'Time to revisit', cls: 'accent-rose', note: 'Start again with Topic 1 and work through the simulations slowly \u2014 the concepts build on each other.' }
  ];
  const bandFor = pct => BANDS.find(b => pct >= b.min);

  function submit() {
    // The score always covers the FULL bank: a topic filter is a revision aid,
    // not a way to shrink the denominator. Blanks count as incorrect.
    const blanks = S.order.filter(q => !S.answers.has(q.id));

    // One-time guard so a stray click cannot silently cost marks.
    if (blanks.length && !S.blankWarned) {
      S.blankWarned = true;
      toast(`${blanks.length} question${blanks.length === 1 ? ' is' : 's are'} still blank (across all topics) \u2014 click Submit again to grade them as incorrect`, 'warn');
      // jump to the first blank one the user can actually see
      S.filter = 'all'; syncFilterButtons(); render();
      const first = document.getElementById(`q-${blanks[0].id}`);
      if (first) {
        EMC.scrollToEl(first);
        if (first.animate) {
          try {
            first.animate(
              [{ boxShadow: '0 0 0 0 rgba(251,191,36,0)' },
               { boxShadow: '0 0 0 4px rgba(251,191,36,.55)' },
               { boxShadow: '0 0 0 0 rgba(251,191,36,0)' }],
              { duration: 1400, iterations: 2 }
            );
          } catch (err) { /* Web Animations API unavailable - not critical */ }
        }
      }
      return;
    }

    S.submitted = true;
    S.filter = 'all';
    syncFilterButtons();
    S.order.forEach(q => { S.marked.set(q.id, S.answers.has(q.id) && S.answers.get(q.id) === q.answer); });
    render();

    // record FIRST so the score card can quote the updated best/attempts
    const scored = S.order.slice();
    const right = scored.filter(q => S.marked.get(q.id) === true).length;
    const pct = scored.length ? Math.round((right / scored.length) * 100) : 0;
    Progress.recordQuiz(pct);
    document.dispatchEvent(new CustomEvent('emc:progress', { detail: Progress.read() }));
    showScore();
  }

  function showScore() {
    const box = el('quiz-score');
    if (!box) return;
    const scored = S.order.slice();          // the full bank was graded on submit
    const right = scored.filter(q => S.marked.get(q.id) === true).length;
    const total = scored.length;
    const pct = total ? Math.round((right / total) * 100) : 0;
    const band = bandFor(pct);
    const prog = Progress.read();

    // per-topic breakdown
    const topics = ['charges', 'current', 'magnetism', 'induction'];
    const rows = topics.map(t => {
      const qs = scored.filter(q => q.topic === t);
      if (!qs.length) return '';
      const ok = qs.filter(q => S.marked.get(q.id) === true).length;
      const p = Math.round((ok / qs.length) * 100);
      const lbl = qs[0].label;
      return `<div class="grid gap-2 items-center" style="grid-template-columns:minmax(120px,1fr) 2fr auto">
                <span class="small muted">${lbl}</span>
                <span class="progress-track"><span class="progress-fill" style="width:${p}%"></span></span>
                <span class="mono small">${ok}/${qs.length}</span>
              </div>`;
    }).join('');

    box.hidden = false;
    box.innerHTML = `
      <div class="score-card">
        <div>
          <div class="grade ${band.cls}">${pct}%</div>
          <div class="small muted mono">${right} / ${total} correct</div>
        </div>
        <div class="score-bar">
          <div class="tag ${pct >= 75 ? 'tag-emerald' : pct >= 50 ? 'tag-amber' : 'tag-rose'}">${band.text}</div>
          <p class="small muted" style="margin:.5rem 0 .8rem">${band.note}</p>
          <div class="progress-track" style="margin-bottom:.9rem"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div id="quiz-fallback-bars" style="display:grid;gap:.4rem">${rows}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4" id="quiz-charts">
        <div class="card card-flat">
          <span class="tag tag-emerald">This attempt</span>
          <div style="height:170px;position:relative"><canvas id="chart-score" role="img"
            aria-label="Doughnut chart of correct versus incorrect answers"></canvas></div>
        </div>
        <div class="card card-flat">
          <span class="tag tag-cyan">Score by topic</span>
          <div style="height:170px;position:relative"><canvas id="chart-topics" role="img"
            aria-label="Bar chart of the percentage score in each topic"></canvas></div>
        </div>
        <div class="card card-flat">
          <span class="tag tag-amber">Attempt history</span>
          <div style="height:170px;position:relative"><canvas id="chart-history" role="img"
            aria-label="Line chart of the score across recent quiz attempts"></canvas></div>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-4">
        <button class="btn btn-primary" id="quiz-retake" type="button">Retake the quiz</button>
        <button class="btn" id="quiz-wrong" type="button">Review incorrect only</button>
        <a class="btn btn-ghost" href="index.html">Back to the module home</a>
        <span class="tiny faint self-center">Best score: ${prog.quizBest}% \u00B7 attempts: ${prog.quizAttempts}</span>
      </div>`;

    const wrongCount = scored.filter(q => S.marked.get(q.id) === false).length;
    const wrongBtn = el('quiz-wrong');
    if (wrongBtn) {
      if (!wrongCount) { wrongBtn.disabled = true; wrongBtn.textContent = 'No incorrect answers'; }
      wrongBtn.addEventListener('click', () => {
        S.filter = S.filter === 'wrong' ? 'all' : 'wrong';
        syncFilterButtons();
        render();
        EMC.scrollToEl(host, { behavior: 'smooth', block: 'start' });
      });
    }
    const retake = el('quiz-retake');
    if (retake) retake.addEventListener('click', () => {
      S.answers.clear(); S.marked.clear(); S.submitted = false; S.blankWarned = false;
      S.filter = 'all'; syncFilterButtons();
      activeCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
      activeCharts = [];
      box.hidden = true;
      render();
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { /* ignore */ }
      toast('Quiz reset \u2014 good luck!');
    });

    renderScoreCharts(right, total, scored);
    EMC.scrollToEl(box);
  }

  /* ---- Chart.js score visualisation (graceful fallback when CDN absent) -- */
  function renderScoreCharts(right, total, scored) {
    // always tear down previous instances first (Chart.js refuses to reuse a canvas)
    activeCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
    activeCharts = [];
    const chartsHost = el('quiz-charts');
    const fallback = el('quiz-fallback-bars');
    if (!chartsHost) return;

    if (!window.Chart) {
      // Offline / blocked CDN: keep the dependency-free CSS bars instead.
      chartsHost.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }
    chartsHost.hidden = false;
    if (fallback) fallback.hidden = true;   // the charts supersede the bars

    const C = window.Chart;
    C.defaults.color = '#a9bad6';
    C.defaults.borderColor = 'rgba(148,163,184,.14)';

    // 1. doughnut: correct vs incorrect
    activeCharts.push(new C(el('chart-score'), {
      type: 'doughnut',
      data: {
        labels: ['Correct', 'Incorrect'],
        datasets: [{
          data: [right, total - right],
          backgroundColor: ['#b5d777', '#f87171'],
          borderColor: '#0c1526', borderWidth: 3, hoverOffset: 6
        }]
      },
      options: {
        maintainAspectRatio: false, cutout: '66%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
      }
    }));

    // 2. horizontal bars: percentage per topic
    const topics = ['charges', 'current', 'magnetism', 'induction'];
    const labels = [], vals = [];
    topics.forEach(t => {
      const qs = scored.filter(q => q.topic === t);
      if (!qs.length) return;
      labels.push(qs[0].label);
      vals.push(Math.round((qs.filter(q => S.marked.get(q.id) === true).length / qs.length) * 100));
    });
    activeCharts.push(new C(el('chart-topics'), {
      type: 'bar',
      data: { labels, datasets: [{ data: vals, backgroundColor: '#a8d3e0', borderRadius: 5, maxBarThickness: 18 }] },
      options: {
        indexAxis: 'y', maintainAspectRatio: false,
        scales: { x: { min: 0, max: 100, ticks: { callback: v => v + '%' } } },
        plugins: { legend: { display: false } }
      }
    }));

    // 3. line: score across attempts (from stored history)
    const hist = Progress.read().quizHistory || [];
    activeCharts.push(new C(el('chart-history'), {
      type: 'line',
      data: {
        labels: hist.map((h, i) => '#' + (i + 1)),
        datasets: [{
          label: 'score %', data: hist.map(h => h.pct),
          borderColor: '#f6d36b', backgroundColor: 'rgba(251,191,36,.16)',
          fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#f6d36b'
        }]
      },
      options: {
        maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } },
        plugins: { legend: { display: false } }
      }
    }));
  }

  /* ---- toolbar --------------------------------------------------------- */
  function syncFilterButtons() {
    document.querySelectorAll('[data-quiz-filter]').forEach(b => {
      const on = b.dataset.quizFilter === S.filter;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  document.querySelectorAll('[data-quiz-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.filter = btn.dataset.quizFilter;
      if (S.filter !== 'wrong') S.blankWarned = false;
      syncFilterButtons();
      render();
    });
  });

  const shuffleBtn = el('quiz-shuffle');
  if (shuffleBtn) shuffleBtn.addEventListener('click', () => {
    // Fisher-Yates shuffle of the question order
    const a = S.order.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    S.order = a;
    render();
    toast('Questions shuffled');
  });

  const modeGroup = el('quiz-mode');
  if (modeGroup) EMC.bindSegment(modeGroup, v => {
    S.instant = v === 'instant';
    if (S.instant && !S.submitted) {
      // mark everything already answered so switching modes is not confusing
      S.order.forEach(q => {
        if (S.answers.has(q.id) && !S.marked.has(q.id)) {
          S.marked.set(q.id, S.answers.get(q.id) === q.answer);
        }
      });
    }
    render();
    toast(S.instant ? 'Instant mode: answers are marked as you go' : 'Exam mode: nothing is marked until you submit');
  });

  const submitBtn = el('quiz-submit');
  if (submitBtn) submitBtn.addEventListener('click', submit);

  /* ---- header stats ---------------------------------------------------- */
  const prog = Progress.read();
  if (el('quiz-best')) el('quiz-best').textContent = prog.quizBest ? `${prog.quizBest}%` : '\u2014';
  if (el('quiz-attempts')) el('quiz-attempts').textContent = String(prog.quizAttempts);
  if (el('quiz-total')) el('quiz-total').textContent = String(BANK.length);

  /* ---- boot ------------------------------------------------------------ */
  syncFilterButtons();
  render();
})();
