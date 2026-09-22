/* 今日小票 — a shareable receipt for the day.
   The whole thing is drawn into one canvas and the canvas is then fed out of a slot, so
   the picture on screen and the PNG a user posts are the same pixels rather than a DOM
   screenshot that drifts from it. The paper is the only part that moves: the printer body
   stays put and the slot clips it, which is what makes the stutter read as a mechanism
   rather than as a CSS transition.
   Colours, typefaces and the corner radius come from the material tokens, so a receipt
   printed under another material will pick up that material's paper and ink for free. */
(function () {
  'use strict';
  var doc = document;
  var W = 300;                 /* paper width in CSS px; the canvas is drawn at 2x */
  var SCALE = 2;
  var PAD = 18;
  var LINE = 18;

  function token(name, fallback) {
    var v = getComputedStyle(doc.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }
  /* a custom property whose value is a function (color-mix) resolves only through a
     painted element, so read it off a probe rather than the root */
  var probe = doc.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px';
  doc.documentElement.appendChild(probe);
  function colour(name, fallback) {
    probe.style.color = '';
    probe.style.color = 'var(' + name + ')';
    var v = getComputedStyle(probe).color;
    return v && v !== 'rgba(0, 0, 0, 0)' ? v : fallback;
  }

  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
  function hm(ms) {
    var t = Math.max(0, Math.round(ms / 60000));
    var h = Math.floor(t / 60), m = t % 60;
    return h ? h + ' 小时 ' + ('0' + m).slice(-2) + ' 分' : m + ' 分';
  }
  function live(e) {
    if (e.end) return Math.max(0, Number(e.ms) || 0);
    var s = new Date(e.start).getTime();
    return isFinite(s) ? Math.max(0, Date.now() - s) : 0;
  }

  /* ---- what goes on the paper ---- */
  function collect(state, showNames) {
    var t0 = startOfDay(new Date()), t1 = t0 + 86400000;
    var done = state.todos.filter(function (t) {
      var c = t.completedAt ? new Date(t.completedAt).getTime() : 0;
      return c >= t0 && c < t1;
    });
    var ms = 0, perTodo = {};
    (state.timeEntries || []).forEach(function (e) {
      var s = new Date(e.start).getTime();
      if (!(s >= t0 && s < t1)) return;
      var v = live(e);
      ms += v;
      perTodo[e.todoId] = (perTodo[e.todoId] || 0) + v;
    });
    var now = new Date();
    var lunar = '';
    try {
      var LN = window.NeonLunar;
      if (LN && LN.solarToLunar) {
        var l = LN.solarToLunar(now);
        lunar = l ? LN.lunarName(l.month, l.day, l.isLeap) : '';
      }
    } catch (e) { /* lunar table unavailable */ }
    var items = done.map(function (t) {
      return { text: t.title, right: perTodo[t.id] ? hm(perTodo[t.id]) : '✓' };
    });
    return {
      date: now.getFullYear() + ' / ' + ('0' + (now.getMonth() + 1)).slice(-2) + ' / ' + ('0' + now.getDate()).slice(-2),
      week: '星期' + '日一二三四五六'.charAt(now.getDay()),
      lunar: lunar,
      serial: ('00000' + (now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate())).slice(-6),
      count: done.length,
      ms: ms,
      items: showNames ? items : [],
      hidden: showNames ? 0 : done.length
    };
  }

  /* ---- the drawing ---- */
  function layout(d) {
    var h = PAD;
    h += 22 + 14;                       /* shop name + rule */
    h += LINE * (d.lunar ? 3 : 2) + 8;  /* date / serial block */
    h += 20;                            /* rule */
    h += LINE * 2 + 6;                  /* the two headline figures */
    h += 20;
    h += d.items.length ? LINE * d.items.length + 6 : 0;
    h += d.items.length ? 20 : 0;
    h += LINE * 2 + 10;                 /* total */
    h += 30 + 16;                       /* the thanks line and the stamp */
    h += 34;                            /* barcode */
    h += 16 + PAD;                      /* thank-you caption */
    return Math.round(h);
  }

  function draw(ctx, d) {
    var ink = colour('--ink', '#14120d');
    var paper = colour('--paper-hi', '#fffaf4');
    var faint = colour('--ink-3', '#7d766a');
    var brick = colour('--brick', '#8d3a27');
    var mono = token('--font-mono', 'monospace');
    var display = token('--font-display', mono);
    var cx = W / 2;

    ctx.save();
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.textBaseline = 'top';
    ctx.strokeStyle = ink;
    var pageH = layout(d);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, pageH);
    /* One vertical shade rising from the bottom edge, and nothing on the sides. A thermal
       sheet is lit from the machine: what it actually carries is a heavier bottom where it
       hung free, fading upward. The first version darkened all four edges inward, which is
       a vignette — it makes the paper look like a photograph of a receipt rather than one. */
    var curl = ctx.createLinearGradient(0, pageH, 0, pageH - Math.min(pageH * 0.55, 190));
    curl.addColorStop(0, 'rgba(0,0,0,.14)');
    curl.addColorStop(0.45, 'rgba(0,0,0,.05)');
    curl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = curl;
    ctx.fillRect(0, 0, W, pageH);
    ctx.fillStyle = ink;

    function rule(y, dash) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash(dash || [3, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD, y + 0.5); ctx.lineTo(W - PAD, y + 0.5);
      ctx.stroke();
      ctx.restore();
    }
    function line(y, text, size, align, face, colour_) {
      ctx.fillStyle = colour_ || ink;
      ctx.font = size + 'px ' + (face || mono);
      ctx.textAlign = align || 'center';
      ctx.fillText(text, align === 'left' ? PAD : align === 'right' ? W - PAD : cx, y);
      ctx.textAlign = 'center';
      ctx.fillStyle = ink;
    }
    function pair(y, left, right, size) {
      ctx.font = (size || 11) + 'px ' + mono;
      ctx.fillStyle = ink;
      ctx.textAlign = 'left'; ctx.fillText(left, PAD, y);
      ctx.textAlign = 'right'; ctx.fillText(right, W - PAD, y);
      ctx.textAlign = 'center';
    }

    var y = PAD;
    line(y, '· 今 日 打 卡 ·', 10, 'center', mono, faint); y += 18;
    line(y, '今日成果小票', 20, 'center', display); y += 28;
    line(y, 'A RECEIPT OF TODAY\'S WORK', 8, 'center', mono, faint); y += 14;
    rule(y); y += 12;

    pair(y, '日期', d.date); y += LINE;
    pair(y, '星期', d.week + (d.lunar ? ' · ' + d.lunar : '')); y += LINE;
    pair(y, '单号', 'NO.' + d.serial); y += LINE + 6;
    rule(y); y += 14;

    line(y, '—— 本 次 完 成 ——', 9, 'center', mono, faint); y += 16;
    ctx.font = '26px ' + display;
    ctx.fillStyle = brick;
    ctx.textAlign = 'center';
    ctx.fillText(d.count + ' 项', cx - 52, y);
    ctx.fillStyle = ink;
    ctx.font = '15px ' + display;
    ctx.textAlign = 'left';
    ctx.fillText(hm(d.ms), cx + 18, y + 8);
    ctx.textAlign = 'center';
    y += 30;
    rule(y); y += 12;

    if (d.items.length) {
      pair(y, '明细 / ITEMS', '计时', 9); y += LINE;
      d.items.forEach(function (it) {
        ctx.font = '10.5px ' + mono;
        ctx.fillStyle = ink;
        ctx.textAlign = 'left';
        var text = it.text;
        while (ctx.measureText(text).width > W - PAD * 2 - 66 && text.length > 2) {
          text = text.slice(0, -2);
        }
        ctx.fillText(text === it.text ? text : text + '…', PAD, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = faint;
        ctx.fillText(it.right, W - PAD, y);
        ctx.textAlign = 'center';
        ctx.fillStyle = ink;
        y += LINE;
      });
      y += 8;
      rule(y); y += 12;
    } else if (d.hidden) {
      line(y, '（已隐藏 ' + d.hidden + ' 项任务名）', 9, 'center', mono, faint); y += LINE;
      rule(y); y += 12;
    }

    pair(y, '本次专注', hm(d.ms), 12); y += LINE + 4;
    line(y, '谢谢你，今天也动手了', 10.5, 'center', display); y += 22;

    /* the stamp: a double rule and a tilt, drawn over the paper rather than into it */
    ctx.save();
    ctx.translate(cx + 44, y + 2);
    ctx.rotate(-0.16);
    ctx.strokeStyle = brick;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-52, -14, 104, 28);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(-49, -11, 98, 22);
    ctx.fillStyle = brick;
    ctx.font = '13px ' + display;
    ctx.textAlign = 'center';
    ctx.fillText('今 日 已 结', 0, -8);
    ctx.restore();
    ctx.textAlign = 'center';
    y += 34;

    /* barcode: a deterministic pattern off the serial, so the same day prints the same bars */
    var bars = [], seed = parseInt(d.serial, 10) || 1;
    for (var i = 0; i < 46; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      bars.push(1 + (seed % 3));
    }
    var bx = PAD + 10, bw = W - (PAD + 10) * 2, total = bars.reduce(function (a, b) { return a + b; }, 0);
    var unit = bw / (total + bars.length);
    ctx.fillStyle = ink;
    bars.forEach(function (b, k) {
      if (k % 2 === 0) { ctx.fillRect(bx, y, b * unit, 26); }
      bx += b * unit + unit * 0.6;
    });
    y += 28;
    line(y, 'THANK YOU · NO.' + d.serial, 8, 'center', mono, faint);
    ctx.restore();
  }

  /* ---- the machine ---- */
  var host = null, audio = null, soundOn = true, lastCanvas = null, lastDir = '';

  function audioCtx() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  function paint(canvas, d) {
    var h = layout(d);
    canvas.style.width = W + 'px';
    canvas.style.height = h + 'px';
    canvas.width = W * SCALE;
    canvas.height = h * SCALE;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(ctx, d);
    /* the tear bar leaves a sawtooth, and it has to be real geometry rather than a CSS
       mask — the same canvas is what gets exported, so the saved PNG must be torn too.
       This one stays regular: it is the edge the paper was born with at the slot, and the
       irregularity the user asked for belongs to the edge the *hand* makes, which is cut
       where the sheet parts from the stub when it is torn off. */
    var tooth = 9 * SCALE, base = h * SCALE;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (var x = 0; x < canvas.width; x += tooth) {
      ctx.lineTo(x + tooth / 2, base - tooth);
      ctx.lineTo(x + tooth, base);
    }
    ctx.lineTo(canvas.width, base + tooth);
    ctx.lineTo(0, base + tooth);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    return h;
  }

  /* A hand-torn line: the step varies, the depth varies, and the whole thing drifts,
     because paper never lets go along a level. Seeded, so the same day's receipt tears the
     same way every time it is re-printed rather than flickering between pulls. */
  function raggedEdge(ctx, width, y, slope, phase, seed) {
    var s = seed || 1;
    function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
    var x = 0;
    while (x < width) {
      var step = (5 + rnd() * 9) * SCALE;
      var deep = (3 + rnd() * 9) * SCALE;
      var drift = (x / width - 0.5) * width * slope + phase;
      ctx.lineTo(x + step / 2, y + drift - deep);
      x += step;
      ctx.lineTo(x, y + (x / width - 0.5) * width * slope + phase + (rnd() - 0.5) * 2 * SCALE);
    }
  }

  /* ---- the sound of a machine ----
     Square-wave blips sounded like a microwave. A thermal printer is a DC motor under a
     stepping head, so: a low sawtooth with a slow amplitude wobble for the motor, running
     for the whole feed; a band-passed noise burst on each pull for the head ratcheting;
     and a two-partial bell at the end, which is the "叮" the user asked for. */
  var motor = null;

  function startMotor() {
    if (!soundOn || motor) return;
    try {
      var ctx = audioCtx();
      var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 96;
      lfo.type = 'sine'; lfo.frequency.value = 11; lg.gain.value = 0.012;
      g.gain.value = 0.03;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(ctx.destination);
      o.start(); lfo.start();
      motor = { o: o, lfo: lfo, g: g };
    } catch (e) { motor = null; }
  }

  function stopMotor() {
    if (!motor) return;
    try {
      var ctx = audioCtx(), m = motor; motor = null;
      m.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
      m.o.stop(ctx.currentTime + 0.12); m.lfo.stop(ctx.currentTime + 0.12);
    } catch (e) { /* already stopped */ }
  }

  /* A dome switch makes a snap, not a beep: the contact blade loads up and releases, which
     is a few milliseconds of broadband noise with a resonant tick on top. Kept separate
     from ratchet() because the head ratchet is louder and lower — the same sound on every
     control would make the panel read as one object rather than several. */
  function press() {
    if (!soundOn) return;
    try {
      var ctx = audioCtx(), t0 = ctx.currentTime;
      var len = Math.floor(ctx.sampleRate * 0.022);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      var n = ctx.createBufferSource(); n.buffer = buf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.1;
      var g = ctx.createGain(); g.gain.value = 0.13;
      n.connect(bp); bp.connect(g); g.connect(ctx.destination);
      var o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(1750, t0);
      o.frequency.exponentialRampToValueAtTime(880, t0 + 0.02);
      og.gain.setValueAtTime(0.05, t0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
      o.connect(og); og.connect(ctx.destination);
      n.start(t0); o.start(t0); o.stop(t0 + 0.05);
    } catch (e) { /* no audio */ }
  }

  /* The detent under a roller: one click per notch, quieter and drier than a key, because
     it fires six times a second while the wheel spins. */
  function detent() {
    if (!soundOn) return;
    try {
      var ctx = audioCtx(), t0 = ctx.currentTime;
      var len = Math.floor(ctx.sampleRate * 0.012);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      var n = ctx.createBufferSource(); n.buffer = buf;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      var g = ctx.createGain(); g.gain.value = 0.07;
      n.connect(hp); hp.connect(g); g.connect(ctx.destination);
      n.start(t0);
    } catch (e) { /* no audio */ }
  }

  function ratchet() {
    if (!soundOn) return;
    try {
      var ctx = audioCtx();
      var n = ctx.createBufferSource(), len = Math.floor(ctx.sampleRate * 0.05);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      n.buffer = buf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 1.4;
      var g = ctx.createGain(); g.gain.value = 0.09;
      n.connect(bp); bp.connect(g); g.connect(ctx.destination);
      n.start();
    } catch (e) { /* no audio */ }
  }

  /* A waiter's bell, not a chime: a steel dome struck once. That means partials well
     above the fundamental and *inharmonic* — a real dome rings at ratios like 1 : 1.5 :
     2.24 : 3.1 rather than the octave stack of a tuned note — with a near-instant attack
     and a decay under half a second. The first version used 1568/2093/3136 Hz over 0.9 s,
     which is a soft two-note chime and reads as nothing in a room. */
  function ding() {
    if (!soundOn) return;
    try {
      var ctx = audioCtx(), t0 = ctx.currentTime;
      [[2637, 0.10, 0.42], [3941, 0.055, 0.32], [5900, 0.03, 0.22], [8260, 0.012, 0.12]]
        .forEach(function (p) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(p[0], t0);
          o.frequency.exponentialRampToValueAtTime(p[0] * 0.995, t0 + p[2]);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(p[1], t0 + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + p[2]);
          o.connect(g); g.connect(ctx.destination);
          o.start(t0); o.stop(t0 + p[2] + 0.02);
        });
      /* the strike itself: a two-millisecond tick of bright noise on the attack */
      var len = Math.floor(ctx.sampleRate * 0.004);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 4200; ng.gain.value = 0.09;
      n.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
      n.start(t0);
    } catch (e) { /* no audio */ }
  }

  /* the stutter: short pulls with pauses between, which is what a cheap printer does when
     the paper catches on the tear bar */
  var PULLS = [
    { to: 0.06, at: 110 }, { to: 0.13, at: 80 }, { to: 0.19, at: 70 }, { to: 0.24, at: 230 },
    { to: 0.33, at: 100 }, { to: 0.42, at: 75 }, { to: 0.50, at: 65 }, { to: 0.55, at: 240 },
    { to: 0.66, at: 95 }, { to: 0.78, at: 80 }, { to: 0.89, at: 70 }, { to: 1.00, at: 110 }
  ];

  /* The slot is sized to the finished paper BEFORE the feed starts. It used to grow with
     the paper, and because the whole rig is centred in the backdrop, growing it walked the
     machine and the buttons upward as the receipt came out — a printer that flinches. */
  var feeding = false;

  function eject(canvas, height) {
    var slot = canvas.parentNode;
    /* room below the sheet for its own drop shadow (0 10px 18px), which the slot's clip was
       cutting off — the flat bottom edge on the timed print */
    slot.style.height = (height + 44) + 'px';
    canvas.style.transform = 'translateY(' + (-height) + 'px)';
    canvas.style.opacity = '1';
    var i = 0;
    feeding = true;
    startMotor();
    function step() {
      if (i >= PULLS.length) {
        feeding = false;
        stopMotor();
        setTimeout(ding, 90);
        return;
      }
      var p = PULLS[i++];
      ratchet();
      canvas.style.transition = 'transform ' + p.at + 'ms linear';
      canvas.style.transform = 'translateY(' + (-height + height * p.to) + 'px)';
      setTimeout(step, p.at + 10);
    }
    setTimeout(step, 160);
  }

  /* Taking the sheet off is two beats, because paper does not leave in one motion: it
     first gives at the tooth — a short jerk back with the sound of the edge parting — and
     then it falls and turns. The first version translated and faded in a single 240 ms
     ease, which read as a dissolve. `from` is however far the hand had already pulled it,
     so a release mid-drag continues that position instead of snapping to it. */
  var tearNo = 0;

  /* Parting the sheet from the stub: cut the ragged head, let the region know the paper is
     about to leave the rig's box, and make the sound of the edge giving. Returns which way
     it leans, alternating so a stack of them does not look machine-cut. */
  function partSheet(canvas) {
    var side = tearNo % 2 ? 1 : -1;
    tearNo++;
    tearTop(canvas, tearNo);
    window.__rcpTear = true;
    chase();
    ratchet();
    return side;
  }

  function rip(from, canvas, done, side) {
    if (!canvas) { done(); return; }
    var slot = canvas.parentNode;
    var h = canvas.getBoundingClientRect().height;
    /* the slot clips, and a sheet that is leaving must be allowed to */
    slot.style.overflow = 'visible';
    /* and the backdrop has to stop scrolling: a sheet falling past the bottom of the rig
       drags the panel's scrollbar down with it — the strip of chrome that appeared after a
       tear in the task panel */
    var back = canvas.closest ? canvas.closest('.rcp-backdrop') : null;
    if (back) back.style.overflow = 'hidden';
    if (side === undefined) side = partSheet(canvas);
    /* nobody tears a receipt along a vertical, and the sheet turns as it goes: the drag
       already leaned it, and the fall takes it round further still */
    window.__rcpTear = true;
    chase();
    canvas.style.transition = 'transform 90ms ease-out';
    canvas.style.transform = 'translate(' + (side * 6) + 'px,' + (from - 6) + 'px) rotate(' + (side * -2).toFixed(2) + 'deg)';
    setTimeout(function () {
      canvas.style.transition = 'transform 480ms cubic-bezier(.40, .02, .72, .40), opacity 430ms ease-in';
      canvas.style.transform = 'translate(' + (side * 74) + 'px,' + (from + h * 0.95) + 'px) rotate(' + (side * 14).toFixed(1) + 'deg)';
      canvas.style.opacity = '0';
      setTimeout(function () { window.__rcpTear = false; chase(); done(); }, 490);
    }, 95);
  }

  /* The edge the sheet parts on, cut into the top of the canvas at the moment of tearing.
     It stays inside the 18 px the layout keeps clear above the first printed line, so the
     sheet that falls has a torn head without eating anything that was printed on it. */
  function tearTop(canvas, seed) {
    var x = canvas.getContext('2d');
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = '#000';
    x.beginPath();
    x.moveTo(0, -4);
    raggedEdge(x, canvas.width, 4, 0.01, 2, 97 + seed * 31);
    x.lineTo(canvas.width, -4);
    x.closePath();
    x.fill();
    x.restore();
  }

  function tearOff(done) { rip(0, lastCanvas, done); }

  /* ---- the schedule and the folder ---- */
  function receiptSettings(state) {
    var r = (state && state.settings && state.settings.receipt) || {};
    var ok = false;
    for (var i = 0; i < BGS.length; i++) if (BGS[i].id === r.bg) ok = true;
    return {
      on: !!r.on,
      at: /^\d{2}:\d{2}$/.test(String(r.at || '')) ? r.at : '21:30',
      dir: r.dir || '',
      bg: ok ? r.bg : 'rose'
    };
  }

  function patchReceipt(next) {
    window.API.op({ type: 'settings:update', patch: { receipt: next } });
    /* both windows hold a copy of the settings and the host fans the write out, but the
       local object is what the knobs read back on the next repaint */
    if (lastState && lastState.settings) lastState.settings.receipt = next;
  }

  /* One column of round buttons, like the panel of a real machine: a light plastic bezel
     with a dome inside it that sinks when it is latched. No outlines — a border on a
     circle reads as a ring drawn on top of the button, which is what made the first plate
     look cheap. NAMES and TIMER hold their pressed state until pressed again; the rest are
     momentary. The time is a drum, not a text field: two rollers with an index bar, moved
     with the wheel, and clicking one still opens the system's fine editor. */
  function plate(sched) {
    var names = window.__rcpNames !== false;
    function round(key, cn, en, latched) {
      /* a lamp only means something on a control that has a state to hold; six dim dots
         would just be decoration competing with the two that report something */
      var lamp = latched === undefined ? '' :
        '<i class="rc-led' + (latched ? ' on' : '') + '" data-led="' + key + '"></i>';
      return '<div class="rc-ctl">' +
        '<button class="rc-btn' + (latched ? ' on' : '') + '" data-rcp="' + key + '"><i></i></button>' +
        '<label><span>' + cn + '</span><em>' + en + '</em>' + lamp + '</label>' +
        '</div>';
    }
    var hm = String(sched.at || '21:30').split(':');
    return '<div class="rcp-plate">' +
      round('timer', '定时', 'TIMER', !!sched.on) +
      '<div class="rc-ctl rc-ctl-roll"><div class="rc-roller" data-roller>' +
      '<span class="rc-drum"><b data-d="h">' + (hm[0] || '21') + '</b></span>' +
      '<span class="rc-drum"><b data-d="m">' + (hm[1] || '30') + '</b></span>' +
      '<input type="time" class="rcp-at" value="' + sched.at + '" title="滚轮调时间，点击精细调节" />' +
      '</div><label><span>时间</span><em>AT</em></label></div>' +
      round('names', '任务名', 'NAMES', names) +
      round('again', '重打', 'FEED') +
      round('save', '保存', 'PNG') +
      round('folder', '文件夹', 'FOLDER') +
      round('close', '退出', 'EXIT') +
      '</div>';
  }

  var lastState = null, lastPath = '', lastDir = '';

  function build(state, showNames, opts) {
    opts = opts || {};
    close();
    lastState = state;
    soundOn = !(state && state.settings && state.settings.sound === false);
    var d = collect(state, showNames);
    var sched = receiptSettings(state);

    host = doc.createElement('div');
    host.className = 'rcp-backdrop' + (opts.auto ? ' rcp-auto' : '');
    host.innerHTML =
      '<div class="rcp interactive">' +
      (opts.auto ? '' : plate(sched)) +
      '  <div class="rcp-rig">' +
      '    <div class="rcp-machine">' +
      '      <span class="rcp-brand">◆ PIN TO-DO 收银台</span>' +
      '      <span class="rcp-led">ONLINE</span>' +
      '    </div>' +
      '    <div class="rcp-slot"><canvas class="rcp-paper"></canvas></div>' +
      '  </div>' +
      '</div>';
    doc.body.appendChild(host);

    var rig = host.querySelector('.rcp');
    /* a scheduled print lands beside the deck rather than in the middle of the screen */
    if (opts.pos) {
      rig.style.position = 'absolute';
      rig.style.margin = '0';
      rig.style.left = Math.max(8, Math.min(opts.pos.x, Math.max(8, window.innerWidth - 480))) + 'px';
      rig.style.top = Math.max(8, Math.min(opts.pos.y, Math.max(8, window.innerHeight - 420))) + 'px';
    }
    var canvas = host.querySelector('.rcp-paper');
    var h = paint(canvas, d);
    eject(canvas, h);
    lastCanvas = canvas;
    bind(host, state, showNames, opts);
    /* Nothing else in this window knows the machine exists until something moves: the
       card layer builds its region from nodes it has a reason to look at, so a machine
       that appears while the deck is asleep is drawn outside the region and shows up as
       an empty patch of desk. Measured: the four corners of the head were outside the
       pushed spans for the whole first feed. */
    chase();
    requestAnimationFrame(chase);
  }

  /* In the timed mode there is nothing on screen to click except the receipt itself, and
     the only reason to keep it up is to photograph it — so it stays pinned until touched,
     and the machine body is the handle for shuffling it out of the way first. */
  function bind(root, state, showNames, opts) {
    var moved = 0, grab = null, pull = null;
    var rig = root.querySelector('.rcp');
    var machine = root.querySelector('.rcp-machine');
    var paper = root.querySelector('.rcp-paper');
    var slot = paper.parentNode;

    machine.addEventListener('pointerdown', function (ev) {
      if (!opts.auto) return;
      grab = { x: ev.clientX, y: ev.clientY, l: rig.offsetLeft, t: rig.offsetTop };
      moved = 0;
      try { machine.setPointerCapture(ev.pointerId); } catch (e) { /* no capture */ }
    });
    machine.addEventListener('pointermove', function (ev) {
      if (!grab) return;
      var dx = ev.clientX - grab.x, dy = ev.clientY - grab.y;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      if (moved < 4) return;
      ev.preventDefault();
      rig.style.position = 'absolute';
      rig.style.margin = '0';
      rig.style.left = Math.max(0, Math.min(grab.l + dx, window.innerWidth - 90)) + 'px';
      rig.style.top = Math.max(0, Math.min(grab.t + dy, window.innerHeight - 70)) + 'px';
      chase();
    });
    ['pointerup', 'pointercancel'].forEach(function (k) {
      machine.addEventListener(k, function () { grab = null; });
    });

    /* Pulling the sheet is the gesture the object asks for, and in the timed mode it is
       the way to get rid of it. The paper follows the pointer with rubber on it — half
       travel, and it stops a third of the way down the sheet — because 1:1 makes a long
       receipt need a long arm. Past a short pull it comes off; short of that it goes back
       into the slot. */
    paper.addEventListener('pointerdown', function (ev) {
      if (feeding) return;
      pull = { y: ev.clientY, h: paper.getBoundingClientRect().height, give: 0 };
      try { paper.setPointerCapture(ev.pointerId); } catch (e) { /* no capture */ }
    });
    paper.addEventListener('pointermove', function (ev) {
      if (!pull) return;
      var dy = ev.clientY - pull.y;
      if (dy <= 0) return;
      ev.preventDefault();
      moved = Math.max(moved, dy);
      pull.give = Math.min(pull.h * 0.3, dy * 0.5);
      /* The sheet is off the machine the moment the edge gives — not when the finger
         lifts. Before this it stayed square while you pulled and only grew its torn head
         on release, which is the wrong way round: you are holding a torn receipt. */
      if (!pull.side && pull.give > 14) pull.side = partSheet(paper);
      slot.style.overflow = 'visible';
      var s = pull.side || 0;
      paper.style.transition = 'none';
      paper.style.transform = 'translate(' + (s * pull.give * 0.14).toFixed(1) + 'px,' +
        pull.give.toFixed(1) + 'px) rotate(' + (s * pull.give * 0.055).toFixed(2) + 'deg)';
    });
    ['pointerup', 'pointercancel'].forEach(function (k) {
      paper.addEventListener(k, function () {
        if (!pull) return;
        var give = pull.give;
        var side = pull.side;
        pull = null;
        if (side) {
          /* already parted: it goes, whatever the distance */
          rip(give, paper, function () {
            if (opts.auto) close();
            else build(state, showNames, opts);
          }, side);
        } else {
          slot.style.overflow = 'hidden';
          paper.style.transition = 'transform 200ms cubic-bezier(.2, .8, .2, 1)';
          paper.style.transform = 'translateY(0)';
        }
      });
    });

    root.addEventListener('click', function (ev) {
      if (opts.auto) {
        /* a drag ends in a click as well, and that must not throw the receipt away */
        if (moved > 4) { moved = 0; return; }
        rip(0, lastCanvas, function () { setTimeout(close, 120); });
        return;
      }
      var b = ev.target.closest && ev.target.closest('[data-rcp]');
      if (!b) { if (ev.target === root) close(); return; }
      press();
      var k = b.getAttribute('data-rcp');
      if (k === 'close') close();
      else if (k === 'save') preview(lastCanvas);
      else if (k === 'folder') openFolder();
      else if (k === 'again') tearOff(function () { build(state, showNames, opts); });
      else if (k === 'names') {
        var next = !showNames;
        window.__rcpNames = next;
        setLatch(root, 'names', next);
        /* re-printing a sheet that is already the right length would only be a flash, so
           the toggle re-feeds and the reader watches the names appear */
        tearOff(function () { build(state, next, opts); });
      } else if (k === 'timer') {
        var sched = receiptSettings(state);
        var want = !sched.on;
        setLatch(root, 'timer', want);
        patchReceipt({ on: want, at: sched.at, dir: sched.dir, bg: sched.bg });
        toast(want ? '定时出票：每天 ' + sched.at : '定时出票已关闭');
      }
    });

    /* ---- the time drum ----
       The wheel is the adjuster (hours on the left roller, minutes on the right), and the
       invisible native field on top still owns the click, so the system's fine editor is
       one press away and the digits can still be typed into. */
    var roller = root.querySelector('[data-roller]');
    var at = root.querySelector('.rcp-at');
    function showAt(v) {
      var hm = String(v || '').split(':');
      var b = root.querySelectorAll('.rc-drum b');
      if (b.length === 2) { b[0].textContent = hm[0]; b[1].textContent = hm[1]; }
    }
    function bumpAt(unit, dir) {
      detent();
      var hm = String(at.value || receiptSettings(state).at).split(':');
      var h = (Number(hm[0]) + (unit === 'h' ? dir : 0) + 24) % 24;
      var m = (Number(hm[1]) + (unit === 'm' ? dir : 0) + 60) % 60;
      var v = ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
      at.value = v;
      var drum = root.querySelector(unit === 'h' ? '.rc-drum:nth-child(1)' : '.rc-drum:nth-child(2)');
      if (drum) {
        /* the number slides in the direction it is going, so the wheel feels like it is
           turning something rather than redrawing a label */
        drum.classList.add('tick');
        setTimeout(function () { drum.classList.remove('tick'); }, 20);
      }
      showAt(v);
      var sched = receiptSettings(state);
      patchReceipt({ on: sched.on, at: v, dir: sched.dir, bg: sched.bg });
      toast('定时出票 ' + (sched.on ? '开' : '关') + ' · 每天 ' + v);
    }
    if (roller && at) {
      roller.addEventListener('wheel', function (ev) {
        ev.preventDefault();
        var r = roller.getBoundingClientRect();
        var unit = (ev.clientX - r.left) < r.width * 0.5 ? 'h' : 'm';
        var step = ev.shiftKey ? 6 : 1;
        bumpAt(unit, ev.deltaY < 0 ? step : -step);
      }, { passive: false });
      roller.addEventListener('click', function () {
        try { if (at.showPicker) at.showPicker(); } catch (e) { /* not a gesture it likes */ }
      });
      at.addEventListener('change', function () {
        if (!/^\d{2}:\d{2}$/.test(String(at.value))) { showAt(receiptSettings(state).at); return; }
        var sched = receiptSettings(state);
        showAt(at.value);
        patchReceipt({ on: sched.on, at: at.value, dir: sched.dir, bg: sched.bg });
        toast('定时出票 ' + (sched.on ? '开' : '关') + ' · 每天 ' + at.value);
      });
      showAt(at.value);
    }
  }

  function setLatch(root, which, on) {
    var btn = root.querySelector('[data-rcp="' + which + '"]');
    if (btn) btn.classList.toggle('on', on);
    var led = root.querySelector('[data-led="' + which + '"]');
    if (led) led.classList.toggle('on', on);
  }

  /* A dragged machine in the card layer moves inside a window whose region clips drawing,
     so the region has to be re-cut behind it. The overlay exposes the same nudge the
     animation listeners use. */
  function chase() {
    try { if (window.__rcpChase) window.__rcpChase(); } catch (e) { /* panel side */ }
  }

  function toast(text) {
    if (window.__toast) { try { window.__toast(text, 'info'); return; } catch (e) { /* fall through */ } }
    try { window.API.notify('小票机', text); } catch (e) { /* no notifier */ }
  }

  function stamp() {
    var n = new Date();
    return n.getFullYear() + ('0' + (n.getMonth() + 1)).slice(-2) + ('0' + n.getDate()).slice(-2) +
      '-' + ('0' + n.getHours()).slice(-2) + ('0' + n.getMinutes()).slice(-2);
  }

  function roundRect(c, x, y, w, h, r) {
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  /* The shared image carries the machine, because the brand line on the head is the only
     thing on a receipt that says which software made it. Paper alone is just a list.
     The sheet starts 2 px *under* the head rather than 3 px below it: with a gap the
     background colour showed through as a seam between the machine and its own printout,
     which is unmistakable once anyone zooms in. */
  var SHOT = { padX: 26, mH: 52, lip: 2, foot: 10 };

  function renderShot(paper, bg, scale) {
    var pw = paper.width / SCALE, ph = paper.height / SCALE;
    var padX = SHOT.padX, mH = SHOT.mH;
    var w = pw + padX * 2, h = mH + ph + SHOT.foot;
    var c = doc.createElement('canvas');
    var k = SCALE * (scale || 1);
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    var x = c.getContext('2d');
    x.setTransform(k, 0, 0, k, 0, 0);
    var ink = colour('--ink', '#14120d');
    var hi = colour('--paper-hi', '#fffaf4');
    var brick = colour('--brick', '#8d3a27');
    var disp = token('--font-display', token('--font-mono', 'monospace'));
    var mono = token('--font-mono', 'monospace');

    if (bg) {
      x.fillStyle = bg;
      x.fillRect(0, 0, w, h);
      /* the sheet has to sit *on* that colour, not be pasted into it */
      x.save();
      x.shadowColor = 'rgba(0,0,0,.34)';
      x.shadowBlur = 20; x.shadowOffsetY = 10;
      x.fillStyle = bg;
      x.fillRect(padX, mH - SHOT.lip, pw, ph);
      x.restore();
    }

    var head = pw - 0;                       /* the head is the width of the slot */
    x.fillStyle = ink;
    roundRect(x, padX - 22, 0, head + 44, mH, [10, 10, 3, 3]);
    x.fill();
    var bodyGrad = x.createLinearGradient(0, 0, 0, mH);
    bodyGrad.addColorStop(0, 'rgba(255,255,255,.10)');
    bodyGrad.addColorStop(0.55, 'rgba(255,255,255,0)');
    bodyGrad.addColorStop(1, 'rgba(0,0,0,.22)');
    x.fillStyle = bodyGrad;
    roundRect(x, padX - 22, 0, head + 44, mH, [10, 10, 3, 3]);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.07)';
    x.fillRect(padX - 6, 9, head + 12, 2);
    x.textBaseline = 'middle';
    x.textAlign = 'left';
    x.fillStyle = hi;
    x.font = '14px ' + disp;
    x.fillText('◆ PIN TO-DO 收银台', padX - 2, mH / 2);
    x.textAlign = 'right';
    x.fillStyle = brick;
    x.font = '10px ' + mono;
    x.fillText('● ONLINE', w - padX + 2, mH / 2);
    x.textAlign = 'left';
    x.drawImage(paper, padX, mH - SHOT.lip, pw, ph);
    /* the mouth of the slot, drawn over the sheet so the paper comes out *of* the machine */
    x.fillStyle = 'rgba(0,0,0,.62)';
    x.fillRect(padX - 14, mH - 5, pw + 28, 5);
    x.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  function composite(paper, bg) {
    try { return renderShot(paper, bg, 1).toDataURL('image/png'); }
    catch (e) { return ''; }
  }

  /* ---- the share background ----
     A receipt pasted into a chat is a rectangle of whatever the paper colour is, and on a
     white timeline it disappears. The reference the user gave is a rose sheet behind the
     paper, so that is the default; transparent is offered because people paste these into
     their own layouts. Two of the choices come from the material so the export at least
     can be made to match the desk it was printed on. */
  var BGS = [
    { id: 'none', cn: '透明', en: 'NONE', tok: null, hex: '' },
    { id: 'rose', cn: '玫瑰', en: 'ROSE', tok: null, hex: '#efa3ab' },
    { id: 'cream', cn: '奶油', en: 'CREAM', tok: null, hex: '#f4e7d3' },
    { id: 'paper', cn: '纸色', en: 'PAPER', tok: '--paper-hi', hex: '#fffaf4' },
    { id: 'brick', cn: '砖红', en: 'BRICK', tok: '--brick', hex: '#8d3a27' },
    { id: 'ink', cn: '墨黑', en: 'INK', tok: '--ink', hex: '#14120d' }
  ];

  function bgHex(id) {
    for (var i = 0; i < BGS.length; i++) {
      if (BGS[i].id === id) {
        return BGS[i].tok ? colour(BGS[i].tok, BGS[i].hex) : BGS[i].hex;
      }
    }
    return '#efa3ab';
  }

  function shotBg() { return bgHex(receiptSettings(lastState).bg); }

  /* The share preview covers the desk and dims it, rather than sitting beside the machine:
     it is a decision, not a tool. It was first added as a third column in the rig's flex
     row, which widened the group and let the backdrop's centring slide the printer out from
     under its own paper — so whatever it becomes, it must not be in that row. The card layer
     adds it to the window region by name (.rcp-prev), because a full-window element outside
     the rig's box would otherwise not be drawn at all. */
  function preview(paper) {
    if (!paper) return;
    var old = host.querySelector('.rcp-prev');
    if (old) old.parentNode.removeChild(old);
    var cur = receiptSettings(lastState).bg;
    var box = doc.createElement('div');
    box.className = 'rcp-prev interactive';
    box.innerHTML =
      '<div class="rcp-prev-card">' +
      '<div class="rcp-prev-head">预览 <em>SHARE</em></div>' +
      '<div class="rcp-prev-shot"><canvas></canvas></div>' +
      '<div class="rcp-prev-bgs">' + BGS.map(function (b) {
        return '<button class="rc-bg' + (b.id === 'none' ? ' rc-bg-none' : '') + (b.id === cur ? ' on' : '') +
          '" data-bg="' + b.id + '" title="' + b.cn + ' ' + b.en + '"' +
          (b.tok || b.hex ? ' style="--chip:' + (b.tok ? 'var(' + b.tok + ')' : b.hex) + '"' : '') + '></button>';
      }).join('') + '</div>' +
      '<div class="rcp-prev-ops">' +
      '<div class="rc-ctl"><button class="rc-btn" data-prev="save"><i></i></button>' +
      '<label><span>保存</span><em>PNG</em></label></div>' +
      '<div class="rc-ctl"><button class="rc-btn" data-prev="back"><i></i></button>' +
      '<label><span>返回</span><em>BACK</em></label></div>' +
      '</div>' +
      '</div>';
    host.appendChild(box);

    var shot = box.querySelector('canvas');
    function paintShot() {
      var bg = bgHex(cur);
      /* 0.66 rather than 0.5: at half size the preview showed less of the sheet than the
         receipt already on the desk behind it, which made it feel like a thumbnail */
      var c = renderShot(paper, bg, 0.66);
      shot.width = c.width; shot.height = c.height;
      shot.style.width = Math.round(c.width / SCALE) + 'px';
      shot.style.height = Math.round(c.height / SCALE) + 'px';
      shot.getContext('2d').drawImage(c, 0, 0);
      var chips = box.querySelectorAll('.rc-bg');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('on', chips[i].getAttribute('data-bg') === cur);
      }
    }
    paintShot();
    chase();
    /* Commit the start style with a reflow and then set the end style, rather than waiting
       for a frame: a rAF callback can be late or absent in a window that is composited but
       not focused, and if it never runs the panel is left sitting at opacity 0 — a 保存
       button that appears to do nothing. */
    void box.offsetWidth;
    box.classList.add('in');
    chase();
    function dismiss() {
      box.classList.remove('in');
      setTimeout(function () {
        if (box.parentNode) box.parentNode.removeChild(box);
        chase();
      }, 180);
    }

    box.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-bg],[data-prev]');
      if (!b) {
        /* the dim area is the "never mind": clicking the blank closes it, the way every
           other dismissible surface in this app does */
        if (ev.target === box) dismiss();
        return;
      }
      if (b.hasAttribute('data-bg')) {
        detent();
        cur = b.getAttribute('data-bg');
        paintShot();
        return;
      }
      press();
      if (b.getAttribute('data-prev') === 'save') {
        var sched = receiptSettings(lastState);
        patchReceipt({ on: sched.on, at: sched.at, dir: sched.dir, bg: cur });
        save(paper, false, bgHex(cur));
      }
      dismiss();
    });
  }

  function save(canvas, quiet, bg) {
    var url = canvas ? composite(canvas, bg === undefined ? shotBg() : bg) : '';
    if (!url && canvas) { try { url = canvas.toDataURL('image/png'); } catch (e) { url = ''; } }
    if (!url) { toast('这张纸画不出来，没保存'); return; }
    var name = '今日小票-' + stamp() + '.png';
    var dir = receiptSettings(lastState).dir;
    if (window.API && window.API.savePng) {
      window.API.savePng(url, name, dir).then(function (r) {
        if (r && r.path) { lastPath = r.path; lastDir = r.dir; }
        if (r && r.path && !quiet) toast('已保存到 ' + r.path);
      }).catch(function (e) { toast('存不进去：' + (e && e.message ? e.message : e)); });
    } else anchorSave(url, name);
  }

  function anchorSave(url, name) {
    try {
      var a = doc.createElement('a');
      a.download = name; a.href = url; a.click();
      toast('已保存到「下载」文件夹');
    } catch (e) { /* the dialog was refused */ }
  }

  function openFolder() {
    var want = lastDir || receiptSettings(lastState).dir || '';
    if (window.API && window.API.openDir) {
      window.API.openDir(want).catch(function () { toast('打不开那个文件夹'); });
    } else toast('这台构建还不能打开文件夹');
  }

  function close() {
    stopMotor();
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null; lastCanvas = null;
  }

  /* A timed print feeds, saves, and then stays put on the desk until the user touches it. */
  function autoPrint(state, pos) {
    build(state, window.__rcpNames !== false, { auto: true, pos: pos });
    var total = 0;
    PULLS.forEach(function (p) { total += p.at + 10; });
    setTimeout(function () { save(lastCanvas, true); }, total + 700);
  }

  window.Receipt = {
    open: function (state) { build(state, window.__rcpNames !== false); },
    auto: autoPrint,
    active: function () { return !!host; },
    settings: receiptSettings,
    patch: patchReceipt,
    /* the card layer owns the clock: it is the only window always open, and a scheduled
       print must not have to raise the task panel to happen */
    due: function (state, now, fired) {
      var r = state && state.settings && state.settings.receipt;
      if (!r || !r.on) return null;
      var at = String(r.at || '');
      if (!/^\d{2}:\d{2}$/.test(at)) return null;
      var d = now || new Date();
      var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      if (hm < at) return null;
      var key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '@' + at;
      if (fired === key) return null;
      return key;
    }
  };
})();
