// Word Rain: words fall toward the city; type them to fire the laser. Waves, combos, power-ups, bosses.
KS.modes.arcade = (() => {
  const canvas = $('#arCanvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0;
  let g = null;
  const stars = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() * .8 + .2 }));
  const skyline = Array.from({ length: 28 }, (_, i) => ({ x: i / 28, w: 1 / 28 * (0.7 + Math.random() * .5), h: 20 + Math.random() * 50, win: Math.random() }));
  const MAX_LIVES = 5;
  const POWERS = { freeze: '#67e8f9', bomb: '#fb7185', heal: '#86efac' };

  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', () => { if (g) size(); });

  function start() {
    size();
    g = {
      words: [], lasers: [], score: 0, lives: MAX_LIVES, wave: 1, waveKills: 0, killsNeeded: 8,
      combo: 0, maxCombo: 0, target: null, keystrokes: 0, correct: 0, errors: 0, chars: 0,
      t: 0, spawnT: 1, slow: 0, shake: 0, paused: false, over: false, bossOut: false, flash: 0,
      hits: {}, misses: {},
    };
    $('#arOverlay').classList.add('hidden');
    banner('WAVE 1');
    hud();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function banner(text) {
    const b = $('#arBanner');
    b.textContent = text;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  }

  function hud() {
    $('#arScore').textContent = g.score;
    $('#arWave').textContent = g.wave;
    $('#arMult').textContent = '×' + mult();
    KS.setCombo($('#arCombo'), g.combo);
    $('#arLives').textContent = '❤'.repeat(g.lives) + '♡'.repeat(MAX_LIVES - g.lives);
  }
  const mult = () => Math.min(8, 1 + Math.floor(g.combo / 15));
  const font = w => w.kind === 'boss' ? 'bold 26px "JetBrains Mono", monospace' : '600 20px "JetBrains Mono", monospace';

  function spawn() {
    let text, kind = 'normal';
    const r = Math.random();
    if (g.wave >= 2 && r < 0.07) kind = ['freeze', 'bomb', 'heal'][Math.floor(Math.random() * 3)];
    if (kind !== 'normal') text = kind;
    else text = KS.Words.arcade(g.wave);
    // avoid two on-screen words starting with the same letter (keeps lock-on unambiguous)
    if (g.words.some(w => w.text[0] === text[0])) {
      for (let i = 0; i < 6 && g.words.some(w => w.text[0] === text[0]); i++) text = KS.Words.arcade(g.wave);
      if (g.words.some(w => w.text[0] === text[0])) return;
    }
    addWord(text, kind);
  }
  function addWord(text, kind) {
    ctx.font = font({ kind });
    const tw = ctx.measureText(text).width;
    const speed = (kind === 'boss' ? 14 : 26 + g.wave * 5 + Math.random() * 14) * (H / 560);
    g.words.push({ text, kind, typed: 0, w: tw, x: 20 + Math.random() * Math.max(10, W - tw - 40), y: -10, vy: speed, wobble: Math.random() * 6 });
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!g.paused && !g.over) update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function update(dt) {
    g.t += dt;
    g.slow = Math.max(0, g.slow - dt);
    g.shake = Math.max(0, g.shake - dt);
    g.flash = Math.max(0, g.flash - dt);
    const sf = g.slow > 0 ? 0.3 : 1;
    g.spawnT -= dt;
    if (g.spawnT <= 0 && !g.bossOut) {
      spawn();
      g.spawnT = Math.max(0.6, 2.1 - g.wave * 0.14) * (0.8 + Math.random() * 0.4);
    }
    const ground = H - 70;
    for (let i = g.words.length - 1; i >= 0; i--) {
      const w = g.words[i];
      w.y += w.vy * dt * sf;
      if (w.y >= ground) {
        g.words.splice(i, 1);
        if (g.target === w) g.target = null;
        if (w.kind === 'boss') g.bossOut = false;
        if (POWERS[w.kind]) continue; // missing a power-up doesn't hurt
        g.lives -= w.kind === 'boss' ? 2 : 1;
        g.combo = 0; g.shake = 0.4; g.flash = 0.3;
        KS.FX.sfx.hurt();
        const rc = canvas.getBoundingClientRect();
        KS.FX.burst(rc.left + w.x + w.w / 2, rc.top + ground, ['#f43f5e', '#fb923c'], 30, 7);
        hud();
        if (g.lives <= 0) return gameOver();
      }
    }
    g.lasers = g.lasers.filter(l => (l.life -= dt) > 0);
  }

  function nextWave() {
    g.wave++; g.waveKills = 0; g.killsNeeded = 8 + g.wave * 2;
    if (g.wave % 4 === 0) {
      banner(`BOSS · WAVE ${g.wave}`);
      g.bossOut = true;
      setTimeout(() => g && !g.over && addWord(KS.Words.boss(), 'boss'), 1200);
    } else banner(`WAVE ${g.wave}`);
    KS.FX.sfx.levelup();
  }

  function destroy(w) {
    const idx = g.words.indexOf(w);
    if (idx >= 0) g.words.splice(idx, 1);
    g.target = null;
    const pts = w.text.replace(/ /g, '').length * 10 * mult() * (w.kind === 'boss' ? 5 : 1);
    g.score += pts;
    g.waveKills++;
    const cx = w.x + w.w / 2, cy = w.y;
    g.lasers.push({ x: cx, y: cy, life: 0.18, color: POWERS[w.kind] || (w.kind === 'boss' ? '#facc15' : '#22d3ee') });
    const rc = canvas.getBoundingClientRect();
    const colors = w.kind === 'boss' ? ['#facc15', '#fb923c', '#fff'] : [POWERS[w.kind] || '#22d3ee', '#7c5cff', '#fff'];
    KS.FX.burst(rc.left + cx, rc.top + cy, colors, w.kind === 'boss' ? 80 : 26, w.kind === 'boss' ? 9 : 6);
    KS.FX.floatText(rc.left + cx, rc.top + cy - 10, '+' + pts, '#facc15', w.kind === 'boss' ? 28 : 18);
    KS.FX.sfx.laser(); KS.FX.sfx.explode();
    if (w.kind === 'freeze') { g.slow = 5; KS.FX.sfx.power(); banner('❄ FREEZE'); }
    if (w.kind === 'heal') { g.lives = Math.min(MAX_LIVES, g.lives + 1); KS.FX.sfx.power(); }
    if (w.kind === 'bomb') {
      KS.FX.sfx.power();
      g.words.slice().forEach(o => {
        if (POWERS[o.kind] || o.kind === 'boss') return;
        g.score += o.text.length * 5;
        KS.FX.burst(rc.left + o.x + o.w / 2, rc.top + o.y, ['#fb7185', '#facc15'], 18, 5);
        g.words.splice(g.words.indexOf(o), 1);
        g.waveKills++;
      });
      g.shake = 0.3;
    }
    if (w.kind === 'boss') { g.bossOut = false; g.shake = 0.5; KS.FX.confetti(60); }
    if (g.waveKills >= g.killsNeeded && !g.bossOut) nextWave();
    hud();
  }

  function onKey(e) {
    if (e.key === 'Escape') { g.over ? KS.go('menu') : togglePause(); return; }
    if (g.paused || g.over) {
      if (g.paused && (e.key === 'Enter' || e.key === ' ')) togglePause();
      if (g.paused && e.key.toLowerCase() === 'q') KS.go('menu');
      return;
    }
    if (e.key === 'Backspace') { if (g.target) { g.target.typed = 0; g.target = null; } return; }
    if (e.key.length !== 1) return;
    const ch = e.key.toLowerCase();
    g.keystrokes++;
    let ok = false;
    if (!g.target) {
      if (ch === ' ') { g.keystrokes--; return; } // stray spaces between words are free
      const cands = g.words.filter(w => w.text[0] === ch).sort((a, b) => b.y - a.y);
      if (cands.length) { g.target = cands[0]; g.target.typed = 1; ok = true; }
    } else if (g.target.text[g.target.typed] === ch) { g.target.typed++; ok = true; }

    const expected = g.target ? g.target.text[g.target.typed - (ok ? 1 : 0)] : ch;
    const key = (expected || ch).toLowerCase();
    if (ok) {
      g.correct++; g.combo++; g.maxCombo = Math.max(g.maxCombo, g.combo);
      g.hits[key] = (g.hits[key] || 0) + 1;
      KS.Stats.recordKey(key, 0, true);
      KS.FX.sfx.key(g.combo);
      if (g.combo % 30 === 0) { KS.FX.sfx.combo(); const rc = canvas.getBoundingClientRect(); KS.FX.floatText(rc.left + W / 2, rc.top + H - 110, `${g.combo} COMBO · ×${mult()}`, '#facc15', 24); }
      if (g.target.typed >= g.target.text.length) destroy(g.target);
    } else {
      g.errors++;
      g.misses[key] = (g.misses[key] || 0) + 1;
      if (g.target) KS.Stats.recordKey(key, 0, false);
      g.combo = 0;
      g.flash = 0.12;
      KS.FX.sfx.error();
    }
    hud();
  }

  function togglePause() {
    g.paused = !g.paused;
    const o = $('#arOverlay');
    o.classList.toggle('hidden', !g.paused);
    o.innerHTML = `<div><h2>Paused</h2><p>Press <kbd>Enter</kbd> to resume or <kbd>Q</kbd> to quit</p></div>`;
    last = performance.now();
  }

  function gameOver() {
    g.over = true;
    KS.FX.sfx.gameover();
    const secs = g.t;
    const wpm = (g.correct / 5) / (secs / 60);
    const acc = g.keystrokes ? g.correct / g.keystrokes : 1;
    const o = $('#arOverlay');
    o.classList.remove('hidden');
    o.innerHTML = `<div><h2>City breached!</h2><p>Score ${g.score} · Wave ${g.wave}</p></div>`;
    const prevBest = KS.Stats.data.best.arcade;
    setTimeout(() => {
      if (!g || KS.active !== KS.modes.arcade) return;
      KS.showResults({
        mode: 'arcade', again: 'arcade', wpm, acc, chars: g.correct, seconds: secs, maxCombo: g.maxCombo,
        hits: g.hits, misses: g.misses, wave: g.wave, score: g.score, bestKey: 'arcade', bestValue: g.score,
        extra: [['Score', g.score], ['Wave', g.wave], ['Best combo', g.maxCombo], ['Best score', Math.max(prevBest, g.score)], ['Time', Math.round(secs) + 's']],
      });
    }, 1600);
  }

  // ---------- drawing ----------
  function draw() {
    if (!g) return;
    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - .5) * 14 * g.shake, (Math.random() - .5) * 14 * g.shake);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05060f'); sky.addColorStop(1, g.slow > 0 ? '#0c2a3a' : '#1a1240');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
    for (const s of stars) {
      const y = (s.y * H + g.t * 12 * s.z) % H;
      ctx.fillStyle = `rgba(255,255,255,${s.z * .8})`;
      ctx.fillRect(s.x * W, y, s.z * 2, s.z * 2);
    }
    const ground = H - 70;
    // skyline
    for (const b of skyline) {
      const bx = b.x * W, bw = b.w * W, by = H - b.h - 10;
      ctx.fillStyle = '#0f1430'; ctx.fillRect(bx, by, bw, b.h + 10);
      ctx.fillStyle = `rgba(250,204,21,${.25 + b.win * .4})`;
      for (let wy = by + 6; wy < H - 14; wy += 10) for (let wx = bx + 3; wx < bx + bw - 4; wx += 7) if ((wx * wy + b.win * 99) % 3 < 1.2) ctx.fillRect(wx, wy, 2, 3);
    }
    // shield line
    const sh = g.lives / MAX_LIVES;
    ctx.strokeStyle = `rgba(${sh > .4 ? '34,211,238' : '244,63,94'},${.35 + .4 * Math.sin(g.t * 4) ** 2})`;
    ctx.lineWidth = 3; ctx.shadowColor = sh > .4 ? '#22d3ee' : '#f43f5e'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(W, ground); ctx.stroke();
    ctx.shadowBlur = 0;
    // cannon
    const cx = W / 2, cy = H - 30;
    const tgt = g.target || g.lasers[0];
    const ang = tgt ? Math.atan2((tgt.y) - cy, (tgt.x + (tgt.w || 0) / 2) - cx) : -Math.PI / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = '#7c5cff'; ctx.fillRect(-5, -34, 10, 30);
    ctx.restore();
    ctx.fillStyle = '#2a3160'; ctx.beginPath(); ctx.arc(cx, cy, 20, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(cx, cy - 4, 6, 0, 7); ctx.fill();
    // lasers
    for (const l of g.lasers) {
      ctx.strokeStyle = l.color; ctx.lineWidth = 4 * (l.life / .18); ctx.shadowColor = l.color; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(l.x, l.y); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // words
    for (const w of g.words) {
      ctx.font = font(w);
      const x = w.x + Math.sin(g.t * 1.5 + w.wobble) * 3, y = w.y;
      const isT = w === g.target;
      const col = POWERS[w.kind] || (w.kind === 'boss' ? '#facc15' : '#e8ebff');
      const pad = 8, hgt = w.kind === 'boss' ? 38 : 30;
      ctx.fillStyle = isT ? 'rgba(124,92,255,.35)' : 'rgba(18,22,43,.8)';
      ctx.strokeStyle = isT ? '#22d3ee' : (POWERS[w.kind] || (w.kind === 'boss' ? '#facc15' : '#2a3160'));
      ctx.lineWidth = isT ? 2 : 1;
      if (isT) { ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 16; }
      roundRect(x - pad, y - hgt + 8, w.w + pad * 2, hgt, 8); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      const done = w.text.slice(0, w.typed);
      ctx.fillStyle = '#22d3ee'; ctx.fillText(done, x, y);
      ctx.fillStyle = col; ctx.fillText(w.text.slice(w.typed), x + ctx.measureText(done).width, y);
      // danger glow near the ground
      if (y > ground - 120) { ctx.fillStyle = `rgba(244,63,94,${(y - (ground - 120)) / 400})`; roundRect(x - pad, y - hgt + 8, w.w + pad * 2, hgt, 8); ctx.fill(); }
    }
    if (g.flash > 0) { ctx.fillStyle = `rgba(244,63,94,${g.flash})`; ctx.fillRect(0, 0, W, H); }
    if (g.slow > 0) { ctx.fillStyle = '#67e8f9'; ctx.font = '600 14px "Space Grotesk"'; ctx.fillText(`❄ slow-mo ${g.slow.toFixed(1)}s`, 14, 24); }
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function stop() { cancelAnimationFrame(raf); g = null; }

  return { start, stop, onKey };
})();
