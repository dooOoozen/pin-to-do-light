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

  function ding() {
    if (!soundOn) return;
    try {
      var ctx = audioCtx(), t0 = ctx.currentTime;
      [[1568, 0.06], [2093, 0.035], [3136, 0.014]].forEach(function (p) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = p[0];
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(p[1], t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0); o.stop(t0 + 0.95);
      });
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

  /* ---- the schedule ---- */
  function receiptSettings(state) {
    var r = (state && state.settings && state.settings.receipt) || {};
    return { on: !!r.on, at: r.at || '21:30' };
  }

  function build(state, showNames, opts) {
    opts = opts || {};
    close();
    soundOn = !(state && state.settings && state.settings.sound === false);
    var d = collect(state, showNames);
    var sched = receiptSettings(state);

    host = doc.createElement('div');
    host.className = 'rcp-backdrop' + (opts.auto ? ' rcp-auto' : '');
    host.innerHTML =
      '<div class="rcp">' +
      '  <div class="rcp-side">' +
      '    <button class="btn sm" data-rcp="names">' + (showNames ? '隐藏任务名' : '显示任务名') + '</button>' +
      '    <button class="btn sm" data-rcp="again">重打一张</button>' +
      '    <button class="btn primary sm" data-rcp="save">保存 PNG</button>' +
      '    <button class="btn sm" data-rcp="folder">打开文件夹</button>' +
      '    <label class="rcp-timer"><span>定时出票</span>' +
      '      <span class="switch' + (sched.on ? ' on' : '') + '"><i></i></span>' +
      '      <input type="time" class="rcp-at" value="' + sched.at + '" /></label>' +
      '    <button class="btn sm rcp-close" data-rcp="close">关闭</button>' +
      '  </div>' +
      '  <div class="rcp-rig">' +
      '    <div class="rcp-machine">' +
      '      <span class="rcp-brand">◆ PIN TO-DO 收银台</span>' +
      '      <span class="rcp-led">ONLINE</span>' +
      '    </div>' +
      '    <div class="rcp-slot"><canvas class="rcp-paper"></canvas></div>' +
      '  </div>' +
      '</div>';
    doc.body.appendChild(host);
    /* a scheduled print lands beside the deck rather than in the middle of the screen:
       the user is looking at the deck, and a machine that appears somewhere else reads
       as somebody else's window */
    if (opts.pos) {
      var rig = host.querySelector('.rcp');
      rig.style.position = 'absolute';
      rig.style.margin = '0';
      rig.style.left = Math.max(8, Math.min(opts.pos.x, (window.innerWidth - 480))) + 'px';
      rig.style.top = Math.max(8, Math.min(opts.pos.y, Math.max(8, window.innerHeight - 420))) + 'px';
    }
    var canvas = host.querySelector('.rcp-paper');
    var h = paint(canvas, d);
    eject(canvas, h);
    lastCanvas = canvas;

    host.addEventListener('click', function (ev) {
      var sw = ev.target.closest && ev.target.closest('.rcp-timer .switch');
      if (sw) { toggleSchedule(state, sw); return; }
      var b = ev.target.closest && ev.target.closest('[data-rcp]');
      if (!b) { if (ev.target === host && !opts.auto) close(); return; }
      var k = b.getAttribute('data-rcp');
      if (k === 'close') close();
      else if (k === 'save') save(canvas);
      else if (k === 'folder') openFolder();
      else if (k === 'again' || k === 'names') {
        var next = k === 'names' ? !showNames : showNames;
        window.__rcpNames = next;
        tearOff(canvas, function () { build(state, next, opts); });
      }
    });
    var at = host.querySelector('.rcp-at');
    at.addEventListener('change', function () { writeSchedule(state, null, at.value); });
  }

  function toggleSchedule(state, node) {
    var want = !receiptSettings(state).on;
    if (want) {
      var v = state.settings.receipt && state.settings.receipt.at;
      var today = new Date().toTimeString().slice(0, 5);
      if (!v || v <= today) {
        toast('定时已开：' + (v || '21:30') + ' 之前不会触发，改时间或等明天');
      }
    }
    writeSchedule(state, want, null);
  }

  function writeSchedule(state, on, at) {
    var cur = receiptSettings(state);
    var next = { on: on === null ? cur.on : on, at: at || cur.at };
    state.settings.receipt = next;
    window.API.op({ type: 'settings:update', patch: { receipt: next } });
    toast(next.on ? '定时出票：每天 ' + next.at : '定时出票已关闭');
  }

  /* the panel has its own toast strip; the card layer does not, and there a system
     notification is the only thing the user can actually see */
  function toast(text) {
    if (window.__toast) { try { window.__toast(text, 'info'); return; } catch (e) { /* fall through */ } }
    try { window.API.notify('小票机', text); } catch (e) { /* no notifier */ }
  }

  function stamp() {
    var n = new Date();
    return n.getFullYear() + ('0' + (n.getMonth() + 1)).slice(-2) + ('0' + n.getDate()).slice(-2) +
      '-' + ('0' + n.getHours()).slice(-2) + ('0' + n.getMinutes()).slice(-2);
  }

  function dataUrl(canvas) { try { return canvas.toDataURL('image/png'); } catch (e) { return ''; } }

  /* Saving goes through the host so the user is told where the file landed, and so the
     timed print can write the same way with no window in front of it. The anchor path is
     the fallback when the command is unavailable. */
  function save(canvas, quiet) {
    var url = dataUrl(canvas);
    if (!url) { toast('这张纸画不出来，没保存'); return; }
    var name = '今日小票-' + stamp() + '.png';
    if (window.API && window.API.savePng) {
      window.API.savePng(url, name).then(function (res) {
        if (res && res.path && !quiet) toast('已保存到 ' + res.path);
        if (res && res.dir) lastDir = res.dir;
      }).catch(function () { anchorSave(url, name); });
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
    if (window.API && window.API.openDir) {
      window.API.openDir(lastDir).catch(function () { toast('打不开那个文件夹'); });
    } else toast('这台构建还不能打开文件夹');
  }

  function close() {
    stopMotor();
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null; lastCanvas = null;
  }

  /* A timed print has nobody to click 关闭: it feeds, saves, tears itself off and goes
     away, so the desk is not left holding a machine the user walked past. */
  function autoPrint(state, pos) {
    build(state, window.__rcpNames !== false, { auto: true, pos: pos });
    var total = 0;
    PULLS.forEach(function (p) { total += p.at + 10; });
    setTimeout(function () {
      save(lastCanvas, true);
      tearOff(lastCanvas, function () { setTimeout(close, 240); });
    }, total + 700);
  }

  window.Receipt = {
    open: function (state) { build(state, window.__rcpNames !== false); },
    auto: autoPrint,
    active: function () { return !!host; },
    close: close,
    /* the overlay window owns the clock: it is the only one that is always there, and a
     scheduled print must not have to open the task panel to happen */
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
