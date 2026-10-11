// Training Path: adaptive lessons that unlock keys progressively and drill the weakest one.
KS.modes.training = (() => {
  let eng, kb, waiting = false, timer = null;

  function start() {
    kb = KS.Keyboard($('#trKb'));
    KS.applyHints($('#trKb'));
    $('#trTarget').textContent = KS.Stats.data.settings.target;
    newLesson();
  }

  function renderChips(focus) {
    const S = KS.Stats, keys = S.trainingKeys();
    $('#keyChips').innerHTML = S.ORDER.split('').map(ch => {
      const cls = [keys.includes(ch) ? 'on' : '', S.isMastered(ch) ? 'mastered' : '', ch === focus ? 'focus' : ''].join(' ');
      return `<span class="${cls}" title="${ch}">${ch}</span>`;
    }).join('');
    $('#focusKey').textContent = focus;
    const k = S.data.keys[focus];
    $('#focusStats').textContent = k && k.n
      ? `${Math.round(S.keyWpm(focus))} wpm · ${Math.round(k.acc * 100)}% · ${Math.round(S.keyProgress(focus) * 100)}% mastered`
      : 'new key — take it slow';
  }

  function newLesson() {
    waiting = false;
    $('#trDone').classList.add('hidden');
    const S = KS.Stats, keys = S.trainingKeys(), focus = S.focusKey();
    renderChips(focus);
    kb.lock(keys);
    // Fade the keyboard as the player levels up, to wean them off looking at it
    $('#trKb').classList.toggle('faded', S.levelInfo().level >= 8);
    const text = KS.Words.training(keys, focus, 12);
    eng = new KS.TypingEngine($('#trText'), text, { keyboard: kb, onUpdate: live, onDone: finish });
    live();
    clearInterval(timer);
    timer = setInterval(live, 500);
  }

  function live() {
    if (!eng) return;
    $('#trWpm').textContent = Math.round(eng.wpm());
    $('#trAcc').textContent = Math.round(eng.acc() * 100) + '%';
    KS.setCombo($('#trCombo'), eng.combo);
  }

  function finish() {
    clearInterval(timer);
    const S = KS.Stats;
    const r = {
      mode: 'training', wpm: eng.wpm(), acc: eng.acc(), chars: eng.text.length, seconds: eng.elapsed(),
      maxCombo: eng.maxCombo,
    };
    const res = S.finishRound(r);
    const unlocked = S.checkUnlock();
    KS.updateHeader();

    const box = $('#trDone');
    box.className = 'lesson-done' + (unlocked ? ' unlock' : '');
    box.innerHTML = `
      ${unlocked ? `<div><small>NEW KEY UNLOCKED</small><div class="unlock-key">${unlocked.toUpperCase()}</div></div>` : ''}
      <div class="stat"><b>${Math.round(r.wpm)}</b><small>WPM</small></div>
      <div class="stat"><b>${Math.round(r.acc * 100)}%</b><small>accuracy</small></div>
      <div class="stat"><b style="color:var(--accent2)">+${res.xp}</b><small>XP</small></div>
      <div class="grow tip">${feedback(r)}</div>
      <button class="btn" id="trNext">Next lesson <kbd>Space</kbd></button>`;
    $('#trNext').onclick = newLesson;
    waiting = true;

    const c = KS.FX.centerOf(box);
    KS.FX.burst(c.x, c.y, ['#7c5cff', '#22d3ee', '#34d399'], 30, 6);
    if (unlocked) {
      KS.FX.confetti(100);
      KS.FX.sfx.unlock();
      renderChips(unlocked);
      kb.lock(S.trainingKeys());
      kb.next(unlocked);
    } else KS.FX.sfx.word();
    if (res.leveled) setTimeout(() => KS.FX.levelUp(res.after.level, res.after.rank), 400);
    res.achievements.forEach((a, i) => setTimeout(() => KS.FX.toast(a.icon, `Achievement: ${a.name}`, a.desc), 600 + i * 700));
  }

  function feedback(r) {
    const S = KS.Stats, target = S.data.settings.target;
    if (r.acc < 0.9) return 'Slow down a touch — accuracy below 90% builds bad habits. Smooth beats fast.';
    if (r.wpm < target * 0.7) return `Good accuracy! Now try to keep a steady rhythm toward ${target} WPM.`;
    const left = S.trainingKeys().filter(k => !S.isMastered(k));
    if (left.length) return `Keep going — still polishing: <b>${left.slice(0, 6).join(' ')}</b>${left.length > 6 ? '…' : ''}`;
    return 'Every key mastered. Next lesson brings a new one!';
  }

  function onKey(e) {
    if (e.key === 'Escape') { KS.go('menu'); return; }
    if (waiting) {
      if (e.key === ' ' || e.key === 'Enter') newLesson();
      return;
    }
    eng.key(e);
  }

  function stop() { clearInterval(timer); eng = null; }

  return { start, stop, onKey };
})();
