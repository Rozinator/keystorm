// Sprint: classic timed speed test on real words, with live WPM sampling for the results graph.
KS.modes.sprint = (() => {
  let eng, kb, dur = 30, timer = null, samples = [], ended = false;

  $$('#spDur button').forEach(b => b.addEventListener('click', () => {
    dur = +b.dataset.d;
    $$('#spDur button').forEach(x => x.classList.toggle('on', x === b));
    b.blur();
    reset();
  }));
  $('#spPunct').addEventListener('change', e => { e.target.blur(); reset(); });

  function start() {
    kb = KS.Keyboard($('#spKb'));
    KS.applyHints($('#spKb'));
    reset();
  }

  function reset() {
    clearInterval(timer);
    timer = null; samples = []; ended = false;
    eng = new KS.TypingEngine($('#spText'), KS.Words.sprint(dur * 3, $('#spPunct').checked), {
      keyboard: kb, onUpdate: () => { if (!timer) begin(); live(); }, onDone: end,
    });
    $('#spTime').textContent = dur;
    live();
  }

  function begin() {
    let lastSample = 0;
    timer = setInterval(() => {
      const t = eng.elapsed();
      if (Math.floor(t) > lastSample) { lastSample = Math.floor(t); samples.push(Math.round(eng.wpm())); }
      $('#spTime').textContent = Math.max(0, Math.ceil(dur - t));
      live();
      if (t >= dur) end();
    }, 100);
  }

  function live() {
    $('#spWpm').textContent = Math.round(eng.wpm());
    $('#spAcc').textContent = Math.round(eng.acc() * 100) + '%';
    KS.setCombo($('#spCombo'), eng.combo);
  }

  function end() {
    if (ended) return;
    ended = true;
    clearInterval(timer); timer = null;
    const secs = Math.min(dur, eng.elapsed());
    const wpm = eng.wpm(secs);
    const rawWpm = (eng.keystrokes / 5) / (secs / 60);
    KS.showResults({
      mode: 'sprint', again: 'sprint', wpm, acc: eng.acc(), chars: eng.correctChars(), seconds: secs,
      maxCombo: eng.maxCombo, samples, hits: eng.hits, misses: eng.misses,
      bestKey: 'sprint' + dur, bestValue: Math.round(wpm),
      extra: [['Duration', dur + 's'], ['Raw WPM', Math.round(rawWpm)], ['Characters', eng.correctChars()],
        ['Errors', eng.errors], ['Best combo', eng.maxCombo], ['Personal best', Math.max(KS.Stats.data.best['sprint' + dur], Math.round(wpm))]],
    });
  }

  function onKey(e) {
    if (e.key === 'Escape') { KS.go('menu'); return; }
    if (e.key === 'Tab') { reset(); return; }
    eng.key(e);
  }

  function stop() { clearInterval(timer); timer = null; }

  return { start, stop, onKey };
})();
