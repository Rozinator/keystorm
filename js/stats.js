// Persistent player data: per-key mastery, XP/levels, streaks, history, achievements.
window.KS = window.KS || {};

KS.Stats = (() => {
  const STORE = 'keystorm.v1';
  // Home row first, then the most common letters, so real words appear early.
  const ORDER = 'fjdksla' + 'eirutonghcmpwybvxqz';
  const START_KEYS = 7;
  const MIN_SAMPLES = 15;
  const ACC_TARGET = 0.93;

  const RANKS = ['Hunt & Peck', 'Key Tapper', 'Home Row Hero', 'Word Smith', 'Swift Fingers',
    'Keyboard Ninja', 'Velocity Mage', 'Storm Typist', 'Living Legend'];

  const ACHIEVEMENTS = [
    { id: 'first', icon: '👣', name: 'First Steps', desc: 'Finish your first round', test: c => true },
    { id: 'wpm30', icon: '🚲', name: 'Cruising', desc: 'Reach 30 WPM', test: c => c.wpm >= 30 && c.acc >= .9 },
    { id: 'wpm50', icon: '🏎️', name: 'Fast Lane', desc: 'Reach 50 WPM', test: c => c.wpm >= 50 && c.acc >= .9 },
    { id: 'wpm70', icon: '🚀', name: 'Liftoff', desc: 'Reach 70 WPM', test: c => c.wpm >= 70 && c.acc >= .9 },
    { id: 'wpm100', icon: '⚡', name: 'Lightning', desc: 'Reach 100 WPM', test: c => c.wpm >= 100 && c.acc >= .9 },
    { id: 'perfect', icon: '💎', name: 'Flawless', desc: '100% accuracy on 50+ characters', test: c => c.acc === 1 && c.chars >= 50 },
    { id: 'combo50', icon: '🔥', name: 'On Fire', desc: '50-key combo', test: c => c.maxCombo >= 50 },
    { id: 'combo150', icon: '🌋', name: 'Unstoppable', desc: '150-key combo', test: c => c.maxCombo >= 150 },
    { id: 'keys12', icon: '🔑', name: 'Key Collector', desc: 'Unlock 12 keys in Training', test: (c, d) => d.unlocked >= 12 },
    { id: 'keysAll', icon: '👑', name: 'Full Keyboard', desc: 'Unlock all 26 letters', test: (c, d) => d.unlocked >= 26 },
    { id: 'wave5', icon: '🛡️', name: 'Defender', desc: 'Reach wave 5 in Word Rain', test: c => (c.wave || 0) >= 5 },
    { id: 'wave10', icon: '🌠', name: 'Sky Guardian', desc: 'Reach wave 10 in Word Rain', test: c => (c.wave || 0) >= 10 },
    { id: 'streak3', icon: '📅', name: 'Habit Forming', desc: '3-day streak', test: (c, d) => d.streak.count >= 3 },
    { id: 'streak7', icon: '🗓️', name: 'Week Warrior', desc: '7-day streak', test: (c, d) => d.streak.count >= 7 },
    { id: 'daily', icon: '✅', name: 'Goal Getter', desc: 'Hit your daily practice goal', test: (c, d) => d.today.seconds >= d.settings.goal * 60 },
    { id: 'hour', icon: '⏳', name: 'Dedicated', desc: 'Practice for 60 minutes total', test: (c, d) => d.totalSeconds >= 3600 },
  ];

  function defaults() {
    return {
      xp: 0,
      keys: {},
      unlocked: START_KEYS,
      history: [],
      best: { sprint15: 0, sprint30: 0, sprint60: 0, arcade: 0 },
      streak: { count: 0, last: null },
      today: { day: null, seconds: 0 },
      totalSeconds: 0,
      rounds: 0,
      achievements: {},
      settings: { sound: true, hints: true, stopOnError: true, target: 30, goal: 10 },
    };
  }

  let data;
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE));
      const d = defaults();
      data = raw ? { ...d, ...raw, settings: { ...d.settings, ...raw.settings }, best: { ...d.best, ...raw.best } } : d;
    } catch { data = defaults(); }
    rollDay();
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(data)); } catch {} }

  function dayStr(offset = 0) {
    const d = new Date(Date.now() + offset * 864e5);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function rollDay() {
    if (data.today.day !== dayStr()) data.today = { day: dayStr(), seconds: 0 };
    // Streak is broken if the last practice day was before yesterday.
    if (data.streak.last && data.streak.last !== dayStr() && data.streak.last !== dayStr(-1)) data.streak.count = 0;
  }

  // ---------- per-key stats ----------
  function keyStat(ch) {
    return data.keys[ch] || (data.keys[ch] = { n: 0, ms: 0, acc: 1, hits: 0, misses: 0 });
  }
  function recordKey(ch, ms, ok) {
    ch = ch.toLowerCase();
    if (!/^[a-z]$/.test(ch)) return;
    const k = keyStat(ch);
    if (ok) {
      k.hits++;
      if (ms > 0 && ms < 2500) {
        k.n++;
        const a = k.n < 8 ? 1 / k.n : 0.12;
        k.ms = k.ms ? k.ms + (ms - k.ms) * a : ms;
      }
      k.acc += (1 - k.acc) * 0.08;
    } else {
      k.misses++;
      k.acc += (0 - k.acc) * 0.08;
    }
  }
  function keyWpm(ch) { const k = data.keys[ch]; return k && k.ms ? 12000 / k.ms : 0; }
  function keyProgress(ch) {
    // 0..1 how close the key is to mastery (speed and accuracy combined)
    const k = data.keys[ch];
    if (!k || !k.n) return 0;
    const sp = Math.min(1, keyWpm(ch) / data.settings.target);
    const ac = Math.min(1, k.acc / ACC_TARGET);
    const confidence = Math.min(1, k.n / MIN_SAMPLES);
    return Math.min(sp, ac) * confidence;
  }
  function isMastered(ch) { return keyProgress(ch) >= 1; }
  function trainingKeys() { return ORDER.slice(0, data.unlocked).split(''); }
  function focusKey() {
    const keys = trainingKeys();
    const newest = keys[keys.length - 1];
    if (!isMastered(newest)) return newest;
    let worst = keys[0], low = Infinity;
    for (const ch of keys) { const p = keyProgress(ch); if (p < low) { low = p; worst = ch; } }
    return worst;
  }
  function checkUnlock() {
    if (data.unlocked >= ORDER.length) return null;
    if (trainingKeys().every(isMastered)) { data.unlocked++; save(); return ORDER[data.unlocked - 1]; }
    return null;
  }

  // ---------- levels ----------
  function levelInfo(xp = data.xp) {
    let level = 1, need = 120;
    while (xp >= need) { xp -= need; level++; need = Math.round(120 * Math.pow(level, 1.3)); }
    return { level, into: xp, need, rank: RANKS[Math.min(Math.floor((level - 1) / 3), RANKS.length - 1)] };
  }

  // ---------- end of round ----------
  function finishRound(r) {
    // r: { mode, wpm, acc, chars, seconds, maxCombo, wave?, score?, bestKey? }
    rollDay();
    const before = levelInfo();
    let xp = Math.round((r.chars / 5) * r.acc * r.acc * (1 + r.wpm / 40) + (r.maxCombo || 0) / 10);
    if (r.mode === 'arcade') xp = Math.round(r.score / 40 + (r.wave || 1) * 5);
    xp = Math.max(xp, 5);
    data.xp += xp;
    data.rounds++;
    data.today.seconds += r.seconds;
    data.totalSeconds += r.seconds;
    if (data.streak.last !== dayStr()) {
      data.streak.count = data.streak.last === dayStr(-1) ? data.streak.count + 1 : 1;
      data.streak.last = dayStr();
    }
    data.history.push({ t: Date.now(), mode: r.mode, wpm: Math.round(r.wpm), acc: Math.round(r.acc * 1000) / 10 });
    if (data.history.length > 300) data.history.shift();

    let pb = false;
    if (r.bestKey && r.bestValue > (data.best[r.bestKey] || 0)) {
      pb = (data.best[r.bestKey] || 0) > 0;
      data.best[r.bestKey] = r.bestValue;
    }
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (!data.achievements[a.id] && a.test(r, data)) { data.achievements[a.id] = Date.now(); fresh.push(a); }
    }
    save();
    const after = levelInfo();
    return { xp, before, after, leveled: after.level > before.level, achievements: fresh, pb };
  }

  function reset() { data = defaults(); rollDay(); save(); }

  load();
  return {
    get data() { return data; }, ORDER, ACHIEVEMENTS, MIN_SAMPLES, ACC_TARGET,
    save, recordKey, keyWpm, keyProgress, isMastered, trainingKeys, focusKey, checkUnlock,
    levelInfo, finishRound, reset, rollDay,
  };
})();
