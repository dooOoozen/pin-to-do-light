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
       mask — the same canvas is what gets exported, so the saved PNG must be torn too */
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
  function eject(canvas, height) {
    var slot = canvas.parentNode;
    slot.style.height = (height + 26) + 'px';
    canvas.style.transform = 'translateY(' + (-height) + 'px)';
    canvas.style.opacity = '1';
    var i = 0;
    startMotor();
    function step() {
      if (i >= PULLS.length) {
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

  /* taking the old one off: down and round a little, then out. Re-printing without this
     just swapped the picture under the reader's eye. */
  function tearOff(canvas, done) {
    if (!canvas) { done(); return; }
    var h = canvas.getBoundingClientRect().height;
    canvas.style.transition = 'transform 240ms cubic-bezier(.3,.7,.2,1), opacity 240ms ease-in';
    canvas.style.transform = 'translateY(' + (h * 0.22) + 'px) rotate(2.4deg)';
    canvas.style.opacity = '0';
    setTimeout(done, 260);
  }

  /* ---- the schedule and the folder ---- */
  function receiptSettings(state) {
    var r = (state && state.settings && state.settings.receipt) || {};
    return {
      on: !!r.on,
      at: /^\d{2}:\d{2}$/.test(String(r.at || '')) ? r.at : '21:30',
      dir: r.dir || ''
    };
  }

  function patchReceipt(next) {
    window.API.op({ type: 'settings:update', patch: { receipt: next } });
    /* both windows hold a copy of the settings and the host fans the write out, but the
       local object is what the knobs read back on the next repaint */
    if (lastState && lastState.settings) lastState.settings.receipt = next;
  }

  /* The plate is a control panel, not a toolbar: a knurled knob for each of the two
     toggles, a domed push button for re-feed, key caps for save and exit, and a lever in
     a recessed slot for the folder. Everything is built from the material tokens — bevel,
     edge, paper, brick — so another material re-skins the hardware instead of leaving
     grey plastic sitting on top of a screen print. */
  function plate(sched) {
    function ctl(body, label, cls) {
      return '<div class="rc-ctl ' + (cls || '') + '">' + body + '<label>' + label + '</label></div>';
    }
    var names = window.__rcpNames !== false;
    return '<div class="rcp-plate">' +
      ctl('<i class="rc-led' + (names ? ' on' : '') + '" data-led="names"></i>' +
        '<button class="rc-knob' + (names ? ' a-on' : ' a-off') + '" data-rcp="names">' +
        '<span class="rc-knob-face"><b></b></span></button>', '任务名 NAMES') +
      ctl('<button class="rc-push" data-rcp="again" title="重打一张"><span>FEED</span></button>', '重打 AGAIN') +
      ctl('<button class="rc-key" data-rcp="save" title="保存 PNG"><span>PNG</span></button>', '保存 SAVE') +
      ctl('<span class="rc-slot"><i class="rc-lever" data-rcp="folder" title="打开保存文件夹"></i></span>',
        '文件夹 FOLDER', 'rc-ctl-lever') +
      ctl('<i class="rc-led' + (sched.on ? ' on' : '') + '" data-led="timer"></i>' +
        '<button class="rc-knob' + (sched.on ? ' a-on' : ' a-off') + '" data-rcp="timer">' +
        '<span class="rc-knob-face"><b></b></span></button>', '定时 TIMER') +
      ctl('<input type="time" class="rcp-at" value="' + sched.at + '" />', '时间 AT') +
      ctl('<button class="rc-key rc-key-exit" data-rcp="close"><span>EXIT</span></button>', '退出 EXIT') +
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
      '<div class="rcp">' +
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
    var moved = 0, grab = null;
    var rig = root.querySelector('.rcp');
    var machine = root.querySelector('.rcp-machine');

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

    root.addEventListener('click', function (ev) {
      if (opts.auto) {
        /* a drag ends in a click as well, and that must not throw the receipt away */
        if (moved > 4) { moved = 0; return; }
        tearOff(lastCanvas, function () { setTimeout(close, 240); });
        return;
      }
      var b = ev.target.closest && ev.target.closest('[data-rcp]');
      if (!b) { if (ev.target === root) close(); return; }
      var k = b.getAttribute('data-rcp');
      if (k === 'close') close();
      else if (k === 'save') save(lastCanvas);
      else if (k === 'folder') openFolder();
      else if (k === 'again' || k === 'names') {
        var next = k === 'names' ? !showNames : showNames;
        window.__rcpNames = next;
        if (k === 'names') {
          setKnob(root, 'names', next);
          /* re-printing a sheet that is already the right length would only be a flash,
             so the toggle re-feeds and the reader watches the names appear */
          tearOff(lastCanvas, function () { build(state, next, opts); });
        } else {
          tearOff(lastCanvas, function () { build(state, next, opts); });
        }
      } else if (k === 'timer') {
        var sched = receiptSettings(state);
        var want = !sched.on;
        setKnob(root, 'timer', want);
        patchReceipt({ on: want, at: sched.at, dir: sched.dir });
        toast(want ? '定时出票：每天 ' + sched.at : '定时出票已关闭');
      }
    });
    var at = root.querySelector('.rcp-at');
    if (at) at.addEventListener('change', function () {
      var sched = receiptSettings(state);
      patchReceipt({ on: sched.on, at: at.value, dir: sched.dir });
      toast('定时出票 ' + (sched.on ? '开' : '关') + ' · 每天 ' + at.value);
    });
  }

  function setKnob(root, which, on) {
    var knob = root.querySelector('[data-rcp="' + which + '"]');
    if (knob) {
      knob.classList.toggle('a-on', on);
      knob.classList.toggle('a-off', !on);
    }
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
     thing on a receipt that says which software made it. Paper alone is just a list. */
  function composite(paper) {
    var pw = paper.width / SCALE, ph = paper.height / SCALE;
    var padX = 26, mH = 52, gap = 3;
    var w = pw + padX * 2, h = mH + gap + ph + 6;
    var c = doc.createElement('canvas');
    c.width = Math.round(w * SCALE);
    c.height = Math.round(h * SCALE);
    var x = c.getContext('2d');
    x.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    var ink = colour('--ink', '#14120d');
    var hi = colour('--paper-hi', '#fffaf4');
    var brick = colour('--brick', '#8d3a27');
    var disp = token('--font-display', token('--font-mono', 'monospace'));
    var mono = token('--font-mono', 'monospace');

    x.fillStyle = ink;
    roundRect(x, 0, 0, w, mH, [10, 10, 3, 3]);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.07)';
    x.fillRect(16, 9, w - 32, 2);
    x.textBaseline = 'middle';
    x.textAlign = 'left';
    x.fillStyle = hi;
    x.font = '14px ' + disp;
    x.fillText('◆ PIN TO-DO 收银台', 18, mH / 2);
    x.textAlign = 'right';
    x.fillStyle = brick;
    x.font = '10px ' + mono;
    x.fillText('● ONLINE', w - 18, mH / 2);
    x.fillStyle = 'rgba(0,0,0,.55)';
    x.fillRect(padX + 6, mH - 4, pw - 12, 4);
    x.textAlign = 'left';
    x.drawImage(paper, padX, mH + gap, pw, ph);
    x.setTransform(1, 0, 0, 1, 0, 0);
    return c.toDataURL('image/png');
  }

  function dataUrl(canvas) {
    try { return composite(canvas); } catch (e) {
      try { return canvas.toDataURL('image/png'); } catch (e2) { return ''; }
    }
  }

  function save(canvas, quiet) {
    var url = dataUrl(canvas);
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
