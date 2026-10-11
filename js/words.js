// Word lists and text generators (adaptive training text, sprint text, arcade words).
window.KS = window.KS || {};

KS.Words = (() => {
  const COMMON = (`the be to of and a in that have it for not on with he as you do at this but his by from they we
say her she or an will my one all would there their what so up out if about who get which go me when make can like
time no just him know take people into year your good some could them see other than then now look only come its over
think also back after use two how our work first well way even new want because any these give day most us is was are
had has did said made find long down call side been here sea set off hand high home small large end read need near
land add age air ask kill feel fall full self lake leaf sad salad flask glad dull fill skill fast last still sell
tell less life left list line live sure turn true tree tire tide ride rode road raid rain riot root rule rest
desk disk risk dark rate late kind find mind fine line nine tone note done gone song long king ring thing think
night light right sight fight eight great grade trade train trust truth earth heart start story store score more
those these three there where while white write quite quiet quick quack queen equal extra next text exit fox box mix
jump just joke jolly major object project subject enjoy judge juice zero zone size prize lazy crazy frozen dozen amaze
value vivid voice very over cover never level seven move live give above wave brave every visit view village
water world word work worth would wild wind window wonder woman women week weak wake walk wall warm wash watch
yellow young year yard yes yet you your youth happy funny every early study ready money many easy enemy energy
black block blue blow board body book born both bottom brown build busy bring break bread bright brother bank
cool cold color come common cake calm camp case cause center chair chance change check child city clean clear
music magic market match matter maybe meal mean meet member memory metal middle might mother mouth much must
place plan plant plate play please point power press pretty price problem public pull push put paper party
game garden gather gentle ghost giant gift girl glass gold grand green group grow guard guess guide
house human hunt hurry hold hope horse hot hour huge hill history hit hello help hero hide
keyboard keystorm faster finger rhythm accuracy practice flow focus steady smooth sprint storm rocket galaxy
planet comet laser shield orbit pixel neon turbo combo bonus level quest dragon wizard castle knight forest
river ocean island jungle desert canyon valley thunder spark blaze frost crystal shadow silver golden`)
    .split(/\s+/).filter(Boolean);
  const UNIQUE = [...new Set(COMMON)];

  const pick = a => a[Math.floor(Math.random() * a.length)];
  const VOWELS = 'aeiouy';

  // Weighted random choice; weights is a function ch -> number
  function weighted(chars, weightFn) {
    let total = 0;
    const ws = chars.map(c => { const w = weightFn(c); total += w; return w; });
    let r = Math.random() * total;
    for (let i = 0; i < chars.length; i++) { r -= ws[i]; if (r <= 0) return chars[i]; }
    return chars[chars.length - 1];
  }

  // Pronounceable-ish pseudo word from allowed letters, biased to the focus/weak keys.
  function pseudo(allowed, focus, weightFn) {
    const vs = allowed.filter(c => VOWELS.includes(c));
    const cs = allowed.filter(c => !VOWELS.includes(c));
    const len = 3 + Math.floor(Math.random() * 4);
    let w = '', useV = Math.random() < 0.4;
    for (let i = 0; i < len; i++) {
      const pool = (useV && vs.length) ? vs : (cs.length ? cs : vs);
      let ch = weighted(pool, weightFn);
      // never the same letter twice in a row unless it's a common double (ll, ss, ee, oo...)
      for (let t = 0; t < 5 && ch === w[w.length - 1] && !'lsetfop'.includes(ch); t++) ch = weighted(pool, weightFn);
      if (ch === w[w.length - 1] && ch === w[w.length - 2]) ch = weighted(allowed.filter(c => c !== ch), weightFn);
      w += ch;
      // with few vowels available, allow consonant clusters more often
      const stay = vs.length <= 1 ? (useV ? 0 : 0.45) : 0.2;
      useV = Math.random() < stay ? useV : !useV;
    }
    if (!w.includes(focus) && Math.random() < 0.85) {
      const i = Math.floor(Math.random() * w.length);
      w = w.slice(0, i) + focus + w.slice(i + 1);
    }
    return w;
  }

  // Training lesson: mix of real words using only unlocked keys + pseudo words, weighted to weak keys.
  function training(allowed, focus, count = 14) {
    const set = new Set(allowed);
    const real = UNIQUE.filter(w => w.length > 1 && [...w].every(c => set.has(c)));
    const realFocus = real.filter(w => w.includes(focus));
    const weightFn = c => c === focus ? 6 : 1 + (1 - KS.Stats.keyProgress(c)) * 2;
    const out = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let w;
      if (realFocus.length >= 3 && r < 0.45) w = pick(realFocus);
      else if (real.length >= 10 && r < 0.6) w = pick(real);
      else w = pseudo(allowed, focus, weightFn);
      if (out[out.length - 1] === w) { i--; continue; }
      out.push(w);
    }
    return out.join(' ');
  }

  const PUNCT = [',', ',', '.', '.', '!', '?', ';', ':'];
  function sprint(count = 120, punctuation = false) {
    const out = [];
    let capNext = punctuation;
    for (let i = 0; i < count; i++) {
      let w = pick(UNIQUE);
      if (punctuation) {
        if (capNext) { w = w[0].toUpperCase() + w.slice(1); capNext = false; }
        if (Math.random() < 0.12) { const p = pick(PUNCT); w += p; capNext = '.!?'.includes(p); }
      }
      out.push(w);
    }
    return out.join(' ');
  }

  function arcade(wave) {
    const min = Math.min(2 + Math.floor(wave / 3), 6), max = Math.min(4 + wave, 11);
    const pool = UNIQUE.filter(w => w.length >= min && w.length <= max);
    return pick(pool);
  }
  const BOSS = ['practice makes perfect', 'keep your eyes up', 'speed follows accuracy', 'quick brown fox',
    'fingers on home row', 'storm of keys', 'type like the wind', 'never look down', 'smooth is fast'];
  function boss() { return pick(BOSS); }

  return { training, sprint, arcade, boss, UNIQUE };
})();
