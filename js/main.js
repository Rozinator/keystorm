// App shell: routing, header HUD, on-screen keyboard, shared typing engine, results/progress/settings screens.
window.KS = window.KS || {};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

KS.modes = {};
KS.active = null;

// ---------------- routing ----------------
KS.go = function (id, opts) {
  if (KS.active && KS.active.stop) KS.active.stop();
  KS.active = null;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  const mode = KS.modes[id];
  if (mode) { KS.active = mode; mode.start(opts); }
  if (id === 'menu') KS.renderMenu();
  if (id === 'progress') KS.renderProgress();
  if (id === 'settings') KS.renderSettings();
  KS.updateHeader();
  scrollTo(0, 0);
};

// ---------------- header ----------------
KS.updateHeader = function () {
  const S = KS.Stats, d = S.data, li = S.levelInfo();
  S.rollDay();
  $('#lvlBadge').textContent = li.level;
  $('#rankName').textContent = li.rank;
  $('#xpFill').style.width = (li.into / li.need * 100) + '%';
  $('#xpText').textContent = `${li.into} / ${li.need} XP`;
  $('#streak').textContent = d.streak.count;
  const mins = Math.floor(d.today.seconds / 60), goal = d.settings.goal;
  $('#dailyText').textContent = `${Math.min(mins, 999)}/${goal}`;
  $('#dailyRing').style.strokeDashoffset = 94.25 * (1 - Math.min(1, d.today.seconds / (goal * 60)));
  $('#soundBtn').textContent = d.settings.sound ? '🔊' : '🔇';
};

KS.renderMenu = function () {
  const d = KS.Stats.data;
  $('#trainTag').textContent = `${d.unlocked} / 26 keys unlocked`;
  $('#arcadeTag').textContent = `Best score: ${d.best.arcade}`;
  $('#sprintTag').textContent = `Best: ${Math.max(d.best.sprint15, d.best.sprint30, d.best.sprint60)} WPM`;
};

// ---------------- on-screen keyboard ----------------
const FINGER = {};
[['lp', '`1qaz'], ['lr', '2wsx'], ['lm', '3edc'], ['li', '45rfvtgb'], ['ri', '67yhnujm'],
  ['rm', '8ik,'], ['rr', '9ol.'], ['rp', "0-=p[];'/"], ['th', ' ']].forEach(([f, ks]) => [...ks].forEach(k => FINGER[k] = f));
const SHIFTED = { ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']' };
const LEFT_HAND = new Set(['lp', 'lr', 'lm', 'li']);

KS.Keyboard = function (container, opts = {}) {
  const rows = ['1234567890', 'qwertyuiop', "asdfghjkl;'", 'zxcvbnm,./'];
  const keys = {};
  container.innerHTML = '';
  rows.forEach((r, i) => {
    if (opts.noNumbers && i === 0) return;
    const row = document.createElement('div');
    row.className = 'row';
    if (i === 3) row.appendChild(mk('shiftL', 'shift', 'lp', true));
    [...r].forEach(ch => row.appendChild(mk(ch, ch, FINGER[ch])));
    if (i === 3) row.appendChild(mk('shiftR', 'shift', 'rp', true));
    container.appendChild(row);
  });
  const sp = document.createElement('div');
  sp.className = 'row';
  sp.appendChild(mk(' ', 'space', 'th'));
  keys[' '].classList.add('space');
  container.appendChild(sp);
  ['f', 'j'].forEach(k => keys[k] && keys[k].classList.add('home'));

  function mk(id, label, finger, wide) {
    const el = document.createElement('div');
    el.className = 'k' + (wide ? ' wide' : '');
    el.textContent = label;
    el.style.setProperty('--fc', `var(--f-${finger})`);
    keys[id] = el;
    return el;
  }
  let lit = [];
  function base(ch) { return SHIFTED[ch] || ch.toLowerCase(); }
  return {
    keys,
    next(ch) {
      lit.forEach(k => k.classList.remove('next'));
      lit = [];
      if (ch == null) return;
      const b = keys[base(ch)];
      if (b) { b.classList.add('next'); lit.push(b); }
      const needsShift = ch !== ch.toLowerCase() || SHIFTED[ch];
      if (needsShift) {
        // Use the shift key on the opposite hand
        const s = keys[LEFT_HAND.has(FINGER[base(ch)]) ? 'shiftR' : 'shiftL'];
        s.classList.add('next'); lit.push(s);
      }
    },
    press(ch, ok) {
      const k = keys[base(ch)];
      if (!k) return;
      k.classList.add('press');
      if (!ok) k.classList.add('err');
      setTimeout(() => k.classList.remove('press', 'err'), 140);
    },
    lock(allowed) {
      Object.entries(keys).forEach(([id, el]) => {
        el.classList.toggle('locked', id !== ' ' && !allowed.includes(id));
      });
    },
    heat(hits, misses) {
      Object.entries(keys).forEach(([id, el]) => {
        if (!/^[a-z]$/.test(id)) return;
        const h = hits[id] || 0, m = misses[id] || 0;
        if (!h && !m) { el.style.background = ''; return; }
        const rate = m / (h + m);
        el.style.background = rate === 0 ? '#10b98144' : `rgba(244,63,94,${Math.min(.9, .25 + rate * 3)})`;
        el.title = `${id}: ${m} miss${m === 1 ? '' : 'es'} / ${h + m}`;
      });
    },
  };
};

KS.applyHints = function (kbEl) {
  kbEl.classList.toggle('off', !KS.Stats.data.settings.hints);
};

// ---------------- shared typing engine ----------------
KS.TypingEngine = class {
  constructor(box, text, opts = {}) {
    this.box = box; this.text = text; this.opts = opts;
    this.pos = 0; this.state = new Array(text.length).fill(0); // 0 untyped, 1 ok, 2 fixed, 3 bad
    this.hadErr = new Array(text.length).fill(false);
    this.keystrokes = 0; this.errors = 0; this.combo = 0; this.maxCombo = 0;
    this.start = 0; this.last = 0; this.done = false;
    this.hits = {}; this.misses = {};
    this.stopOnError = KS.Stats.data.settings.stopOnError;
    this.render();
  }
  render() {
    const inner = document.createElement('div');
    inner.className = 'inner';
    this.spans = [];
    let word = null;
    [...this.text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'c';
      if (ch === ' ') {
        s.classList.add('sp'); s.innerHTML = '&nbsp;';
        inner.appendChild(s); word = null;
      } else {
        if (!word) { word = document.createElement('span'); word.className = 'w'; inner.appendChild(word); }
        s.textContent = ch; word.appendChild(s);
      }
      this.spans.push(s);
    });
    this.box.innerHTML = '';
    this.box.classList.remove('typing');
    this.box.appendChild(inner);
    this.inner = inner;
    this.updateCaret();
  }
  expected() { return this.text[this.pos]; }
  updateCaret() {
    if (this.curSpan) this.curSpan.classList.remove('cur');
    this.curSpan = this.spans[this.pos];
    if (this.curSpan) {
      this.curSpan.classList.add('cur');
      // keep the active line as the first or second visible line
      const lh = parseFloat(getComputedStyle(this.box).lineHeight) || 40;
      const line = Math.round((this.curSpan.offsetTop - this.spans[0].offsetTop) / lh);
      this.inner.style.transform = `translateY(${-Math.max(0, line - 1) * lh}px)`;
    }
    this.opts.keyboard && this.opts.keyboard.next(this.done ? null : this.expected());
  }
  key(e) {
    if (this.done) return;
    const now = performance.now();
    if (e.key === 'Backspace') {
      if (this.stopOnError || this.pos === 0) return;
      this.pos--;
      this.state[this.pos] = 0;
      this.spans[this.pos].classList.remove('ok', 'bad', 'fixed');
      this.updateCaret();
      return;
    }
    if (e.key.length !== 1) return;
    if (!this.start) { this.start = now; this.last = now; this.box.classList.add('typing'); }
    const exp = this.expected(), ok = e.key === exp;
    const ms = now - this.last;
    this.last = now;
    this.keystrokes++;
    const low = exp.toLowerCase();
    this.opts.keyboard && this.opts.keyboard.press(e.key, ok);

    if (ok) {
      if (!this.hadErr[this.pos]) KS.Stats.recordKey(exp, ms, true);
      this.hits[low] = (this.hits[low] || 0) + 1;
      this.state[this.pos] = this.hadErr[this.pos] ? 2 : 1;
      this.spans[this.pos].classList.add(this.hadErr[this.pos] ? 'fixed' : 'ok');
      this.spans[this.pos].classList.remove('bad');
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.pos++;
      KS.FX.sfx.key(this.combo);
      if (this.combo > 0 && this.combo % 25 === 0) this.comboFx();
      if (exp === ' ' || this.pos === this.text.length) this.opts.onWord && this.opts.onWord();
    } else {
      this.errors++;
      if (!this.hadErr[this.pos]) KS.Stats.recordKey(exp, ms, false);
      this.misses[low] = (this.misses[low] || 0) + 1;
      this.hadErr[this.pos] = true;
      if (this.combo >= 10) KS.FX.floatText(KS.FX.centerOf(this.spans[this.pos]).x, KS.FX.centerOf(this.spans[this.pos]).y - 20, 'combo lost', '#f43f5e', 14);
      this.combo = 0;
      KS.FX.sfx.error();
      const sp = this.spans[this.pos];
      if (this.stopOnError) {
        sp.classList.remove('flash'); void sp.offsetWidth; sp.classList.add('flash', 'bad');
      } else {
        this.state[this.pos] = 3;
        sp.classList.add('bad');
        this.pos++;
      }
      this.box.classList.remove('shake'); void this.box.offsetWidth; this.box.classList.add('shake');
    }
    if (this.pos >= this.text.length) this.done = true;
    this.updateCaret();
    this.opts.onUpdate && this.opts.onUpdate();
    if (this.done) this.opts.onDone && this.opts.onDone();
  }
  comboFx() {
    const c = KS.FX.centerOf(this.spans[Math.max(0, this.pos - 1)]);
    KS.FX.burst(c.x, c.y, ['#facc15', '#fb923c', '#f43f5e'], 26, 6);
    KS.FX.floatText(c.x, c.y - 24, `${this.combo} combo!`, '#facc15', 20);
    KS.FX.sfx.combo();
  }
  elapsed() { return this.start ? (performance.now() - this.start) / 1000 : 0; }
  correctChars() { return this.state.reduce((n, s) => n + (s === 1 || s === 2 ? 1 : 0), 0); }
  wpm(sec = this.elapsed()) { return sec > 0.5 ? (this.correctChars() / 5) / (sec / 60) : 0; }
  acc() { return this.keystrokes ? (this.keystrokes - this.errors) / this.keystrokes : 1; }
};

KS.setCombo = function (el, n) {
  el.textContent = n;
  el.classList.toggle('hot', n >= 25 && n < 75);
  el.classList.toggle('fire', n >= 75);
};

// ---------------- chart ----------------
KS.lineChart = function (canvas, values, opts = {}) {
  const dpr = devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight || +canvas.getAttribute('height');
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  c.clearRect(0, 0, w, h);
  const pad = { l: 34, r: 10, t: 10, b: 22 };
  if (values.length < 2) {
    c.fillStyle = '#8d94c4'; c.font = '14px Space Grotesk, sans-serif'; c.textAlign = 'center';
    c.fillText(opts.empty || 'Not enough data yet — play a few rounds!', w / 2, h / 2);
    return;
  }
  const max = Math.max(10, ...values) * 1.15;
  const x = i => pad.l + i / (values.length - 1) * (w - pad.l - pad.r);
  const y = v => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  c.strokeStyle = '#2a3160'; c.fillStyle = '#8d94c4'; c.font = '11px JetBrains Mono, monospace'; c.lineWidth = 1;
  c.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = max / 4 * i, yy = y(v);
    c.beginPath(); c.moveTo(pad.l, yy); c.lineTo(w - pad.r, yy); c.stroke();
    c.fillText(Math.round(v), pad.l - 6, yy + 4);
  }
  if (opts.xLabel) { c.textAlign = 'center'; c.fillText(opts.xLabel, (w + pad.l) / 2, h - 4); }
  const grad = c.createLinearGradient(0, pad.t, 0, h - pad.b);
  grad.addColorStop(0, '#7c5cff66'); grad.addColorStop(1, '#7c5cff00');
  c.beginPath(); c.moveTo(x(0), y(values[0]));
  values.forEach((v, i) => c.lineTo(x(i), y(v)));
  c.lineTo(x(values.length - 1), h - pad.b); c.lineTo(x(0), h - pad.b); c.closePath();
  c.fillStyle = grad; c.fill();
  c.beginPath();
  values.forEach((v, i) => i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v)));
  c.strokeStyle = '#22d3ee'; c.lineWidth = 2.5; c.lineJoin = 'round'; c.stroke();
  const li = values.length - 1;
  c.fillStyle = '#22d3ee'; c.beginPath(); c.arc(x(li), y(values[li]), 4, 0, 7); c.fill();
};

// ---------------- results ----------------
KS.showResults = function (r) {
  // r: { mode, wpm, acc, chars, seconds, maxCombo, samples, hits, misses, extra:[[label,val]], again, bestKey, bestValue, wave, score }
  const res = KS.Stats.finishRound(r);
  KS.lastResult = r;
  KS.go('results');
  $('#rsWpm').textContent = Math.round(r.wpm);
  $('#rsAcc').textContent = (r.acc * 100).toFixed(1) + '%';
  $('#rsExtra').innerHTML = '';
  (r.extra || []).forEach(([l, v]) => {
    const d = document.createElement('div');
    d.innerHTML = `<small>${l}</small><b>${v}</b>`;
    $('#rsExtra').appendChild(d);
  });
  $('#rsPb').classList.toggle('hidden', !res.pb);
  if (res.pb) setTimeout(() => KS.FX.confetti(80), 300);

  // XP bar animates from old to new
  $('#rsXp').textContent = `+${res.xp} XP`;
  $('#rsLvl').textContent = res.leveled ? `Level ${res.after.level}! ${res.after.rank}` : `Level ${res.after.level} · ${res.after.rank}`;
  const fill = $('#rsXpFill');
  fill.style.transition = 'none';
  fill.style.width = (res.leveled ? 0 : res.before.into / res.before.need * 100) + '%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.transition = '';
    fill.style.width = (res.after.into / res.after.need * 100) + '%';
  }));
  if (res.leveled) setTimeout(() => KS.FX.levelUp(res.after.level, res.after.rank), 500);

  KS.lineChart($('#rsChart'), r.samples || [], { xLabel: 'seconds', empty: 'Speed graph appears for timed rounds' });
  const kb = KS.Keyboard($('#rsKb'), { noNumbers: true });
  kb.heat(r.hits || {}, r.misses || {});
  const worst = Object.keys(r.misses || {}).filter(k => /^[a-z]$/.test(k))
    .sort((a, b) => r.misses[b] - r.misses[a]).slice(0, 3);
  $('#rsTip').innerHTML = worst.length
    ? `Most missed: <b>${worst.map(k => k.toUpperCase()).join(', ')}</b>. Training mode automatically drills your weakest keys.`
    : `No missed letters — great control! Try pushing your speed a little.`;

  $('#rsAch').innerHTML = '';
  res.achievements.forEach((a, i) => {
    setTimeout(() => { KS.FX.toast(a.icon, `Achievement: ${a.name}`, a.desc); KS.FX.sfx.power(); }, 900 + i * 700);
    const el = document.createElement('div');
    el.className = 'ach got';
    el.innerHTML = `<div class="ico">${a.icon}</div><div><b>${a.name}</b><small>${a.desc}</small></div>`;
    $('#rsAch').appendChild(el);
  });
  KS.updateHeader();
  // keep header XP bar at the pre-round value until the results animation is seen
};

// ---------------- progress ----------------
KS.renderProgress = function () {
  const S = KS.Stats, d = S.data;
  const hist = d.history;
  const avg = n => { const h = hist.slice(-n); return h.length ? Math.round(h.reduce((s, x) => s + x.wpm, 0) / h.length) : 0; };
  const top = hist.reduce((m, x) => Math.max(m, x.wpm), 0);
  const tot = [
    ['Level', S.levelInfo().level], ['Total XP', d.xp], ['Rounds', d.rounds], ['Practice time', Math.round(d.totalSeconds / 60) + ' min'],
    ['Best WPM', top], ['Avg (last 10)', avg(10)], ['Streak', d.streak.count + ' 🔥'], ['Keys unlocked', d.unlocked + '/26'],
  ];
  $('#pgTotals').innerHTML = tot.map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join('');
  KS.lineChart($('#pgChart'), hist.filter(h => h.mode !== 'arcade').slice(-60).map(h => h.wpm), { xLabel: 'rounds (training + sprint)' });

  const unlocked = S.trainingKeys();
  $('#pgKeys').innerHTML = 'abcdefghijklmnopqrstuvwxyz'.split('').map(ch => {
    const k = d.keys[ch];
    const p = S.keyProgress(ch);
    let cls = !unlocked.includes(ch) && !(k && k.n) ? 'm-locked' : p >= 1 ? 'm-good' : p >= .7 ? 'm-mid' : k && k.n ? 'm-bad' : '';
    const info = k && k.n ? `${Math.round(S.keyWpm(ch))} wpm<br>${Math.round(k.acc * 100)}%` : unlocked.includes(ch) ? 'new' : 'locked';
    return `<div class="${cls}"><b>${ch}</b><small>${info}</small></div>`;
  }).join('');

  $('#pgAchs').innerHTML = S.ACHIEVEMENTS.map(a => {
    const got = d.achievements[a.id];
    return `<div class="ach ${got ? 'got' : 'locked'}"><div class="ico">${a.icon}</div><div><b>${a.name}</b><small>${a.desc}</small></div></div>`;
  }).join('');
};

// ---------------- settings ----------------
KS.renderSettings = function () {
  const s = KS.Stats.data.settings;
  $('#setSound').checked = s.sound;
  $('#setHints').checked = s.hints;
  $('#setStop').checked = s.stopOnError;
  $('#setTarget').value = s.target;
  $('#setGoal').value = s.goal;
};

// ---------------- init ----------------
KS.init = function () {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (b) { KS.go(b.dataset.go); b.blur(); }
  });
  $('#soundBtn').addEventListener('click', e => {
    const s = KS.Stats.data.settings; s.sound = !s.sound; KS.Stats.save(); KS.updateHeader(); e.currentTarget.blur();
  });
  const bind = (id, key, fn = el => el.checked) => $(id).addEventListener('change', e => {
    KS.Stats.data.settings[key] = fn(e.target); KS.Stats.save(); KS.updateHeader();
  });
  bind('#setSound', 'sound'); bind('#setHints', 'hints'); bind('#setStop', 'stopOnError');
  bind('#setTarget', 'target', el => +el.value); bind('#setGoal', 'goal', el => +el.value);
  $('#setReset').addEventListener('click', () => {
    if (confirm('Reset ALL progress, XP, achievements and key stats? This cannot be undone.')) { KS.Stats.reset(); KS.go('menu'); }
  });
  $('#rsAgain').addEventListener('click', () => KS.lastResult && KS.go(KS.lastResult.again));

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'select' || tag === 'input' && e.target.type !== 'checkbox') return;
    if (KS.active && KS.active.onKey) {
      if (e.key === ' ' || e.key === "'" || e.key === '/' || e.key === 'Backspace' || e.key === 'Tab') e.preventDefault();
      KS.active.onKey(e);
      return;
    }
    const screen = $('.screen.active').id;
    if (screen === 'results') {
      if (e.key === 'Enter') { e.preventDefault(); KS.lastResult && KS.go(KS.lastResult.again); }
      if (e.key === 'Escape') KS.go('menu');
    } else if (screen !== 'menu' && e.key === 'Escape') KS.go('menu');
  });
  KS.go('menu');
};
