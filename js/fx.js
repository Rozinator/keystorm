// Visual + audio effects: particle bursts, floating text, toasts, synthesized sounds.
window.KS = window.KS || {};

KS.FX = (() => {
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');
  const parts = [];
  let dpr = 1, running = false;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  }
  addEventListener('resize', resize);
  resize();

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= 1 / 60;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.g; p.vx *= 0.98; p.vy *= 0.98;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const a = Math.min(1, p.life / p.max * 1.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x * dpr, p.y * dpr);
      ctx.rotate(p.rot);
      if (p.square) ctx.fillRect(-p.size * dpr / 2, -p.size * dpr / 4, p.size * dpr, p.size * dpr / 2);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size * dpr * a, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(loop);
    else running = false;
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(loop); } }

  // x/y are viewport (client) coordinates
  function burst(x, y, color = '#22d3ee', n = 18, speed = 5) {
    const colors = Array.isArray(color) ? color : [color];
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, s = Math.random() * speed + 1;
      parts.push({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, g: 0.08, life: 0.6 + Math.random() * 0.5,
        max: 1.1, size: 2 + Math.random() * 3, color: colors[i % colors.length], rot: 0, vr: 0 });
    }
    kick();
  }
  function confetti(n = 140) {
    const colors = ['#7c5cff', '#22d3ee', '#facc15', '#34d399', '#f472b6', '#fb923c'];
    for (let i = 0; i < n; i++) {
      parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - .5) * 4,
        vy: Math.random() * 3 + 2, g: 0.05, life: 3 + Math.random() * 1.5, max: 4.5, size: 6 + Math.random() * 6,
        color: colors[i % colors.length], square: true, rot: Math.random() * 6, vr: (Math.random() - .5) * .3 });
    }
    kick();
  }
  function floatText(x, y, text, color = '#facc15', size = 18) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.cssText = `left:${x}px;top:${y}px;color:${color};font-size:${size}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function toast(icon, title, desc) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="ico">${icon}</div><div><b></b><small></small></div>`;
    el.querySelector('b').textContent = title;
    el.querySelector('small').textContent = desc;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3800);
  }
  function levelUp(level, rank) {
    const el = document.createElement('div');
    el.className = 'levelup';
    el.innerHTML = `<div><span>Level up</span><b>${level}</b><span>${rank}</span></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
    confetti();
    sfx.levelup();
  }

  // ---------- sound (Web Audio, no assets) ----------
  let actx = null;
  function ac() {
    if (!KS.Stats || !KS.Stats.data.settings.sound) return null;
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur = 0.08, type = 'square', vol = 0.05, slideTo = null, delay = 0) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur = 0.3, vol = 0.15, filterFreq = 1200) {
    const a = ac(); if (!a) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    src.buffer = buf; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  }
  const sfx = {
    key(combo = 0) { tone(600 + Math.min(combo, 60) * 8, 0.03, 'triangle', 0.035); },
    error() { tone(140, 0.12, 'sawtooth', 0.05, 90); },
    word() { tone(880, 0.06, 'triangle', 0.04); tone(1320, 0.08, 'triangle', 0.035, null, 0.05); },
    laser() { tone(1400, 0.12, 'sawtooth', 0.03, 300); },
    explode() { noise(0.35, 0.18, 1600); tone(120, 0.25, 'sine', 0.1, 40); },
    hurt() { noise(0.5, 0.25, 500); tone(90, 0.4, 'sawtooth', 0.08, 40); },
    combo() { [660, 880, 1100].forEach((f, i) => tone(f, 0.08, 'square', 0.035, null, i * 0.06)); },
    power() { [520, 780, 1040, 1560].forEach((f, i) => tone(f, 0.1, 'triangle', 0.05, null, i * 0.05)); },
    levelup() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, 'triangle', 0.06, null, i * 0.09)); },
    unlock() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.04, null, i * 0.07)); },
    gameover() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.05, null, i * 0.18)); },
  };

  return { burst, confetti, floatText, centerOf, toast, levelUp, sfx };
})();
