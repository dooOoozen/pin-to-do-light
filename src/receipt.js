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
  var host = null, audio = null, soundOn = true, pull = 0;

  function beep(kind) {
    if (!soundOn) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      var ctx = audio;
      if (ctx.state === 'suspended') ctx.resume();
      var t0 = ctx.currentTime;
      /* a stepper motor: a short square wave whose pitch climbs as the paper takes up
         speed, then a single low click when it stops against the tear bar */
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      /* one tick per pull, not one long tone: the motor audibly starts and stops, and
         the pauses are the part that makes it sound like a printer rather than a fan */
      o.frequency.setValueAtTime(kind === 'end' ? 110 : 250 + (pull % 4) * 26, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(kind === 'end' ? 0.05 : 0.03, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'end' ? 0.1 : 0.06));
      o.connect(g).connect(ctx.destination);
      o.start(t0); o.stop(t0 + (kind === 'end' ? 0.14 : 0.08));
    } catch (e) { /* no audio */ }
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

  /* the stutter: the paper advances in short pulls with pauses between, which is what a
     cheap thermal printer actually does when it catches on the tear bar. Twelve pulls
     over about 2.3 s rather than eight over 1.2 s, because the finer the catch, the more
     it reads as a mechanism — and because the screen recorder runs at about five frames a
     second, and a one-second feed gives it nothing to show. */
  var PULLS = [
    { to: 0.06, at: 110 }, { to: 0.13, at: 80 }, { to: 0.19, at: 70 }, { to: 0.24, at: 230 },
    { to: 0.33, at: 100 }, { to: 0.42, at: 75 }, { to: 0.50, at: 65 }, { to: 0.55, at: 240 },
    { to: 0.66, at: 95 }, { to: 0.78, at: 80 }, { to: 0.89, at: 70 }, { to: 1.00, at: 110 }
  ];

  function eject(canvas, height) {
    var slot = canvas.parentNode;
    pull = 0;
    canvas.style.transform = 'translateY(' + (-height) + 'px)';
    var i = 0;
    function step() {
      if (i >= PULLS.length) { beep('end'); return; }
      var p = PULLS[i++];
      pull = i;
      beep('run');
      canvas.style.transition = 'transform ' + p.at + 'ms linear';
      canvas.style.transform = 'translateY(' + (-height + height * p.to) + 'px)';
      slot.style.height = Math.round(height * p.to + 26) + 'px';
      setTimeout(step, p.at + 10);
    }
    setTimeout(step, 160);
  }

  function build(state, showNames) {
    close();
    soundOn = !(state && state.settings && state.settings.sound === false);
    host = doc.createElement('div');
    host.className = 'rcp-backdrop';
    var d = collect(state, showNames);
    host.innerHTML =
      '<div class="rcp">' +
      '  <div class="rcp-machine">' +
      '    <span class="rcp-brand">◆ PIN TO-DO 收银台</span>' +
      '    <span class="rcp-led">ONLINE</span>' +
      '  </div>' +
      '  <div class="rcp-slot"><canvas class="rcp-paper"></canvas></div>' +
      '  <div class="rcp-actions">' +
      '    <button class="btn sm" data-rcp="names">' + (showNames ? '隐藏任务名' : '显示任务名') + '</button>' +
      '    <button class="btn sm" data-rcp="again">重打一张</button>' +
      '    <button class="btn primary sm" data-rcp="save">保存 PNG</button>' +
      '    <button class="btn ghost sm" data-rcp="close">关闭</button>' +
      '  </div>' +
      '</div>';
    doc.body.appendChild(host);
    var canvas = host.querySelector('.rcp-paper');
    var h = paint(canvas, d);
    host.querySelector('.rcp-slot').style.height = '26px';
    eject(canvas, h);
    host.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-rcp]');
      if (!b) { if (ev.target === host) close(); return; }
      var k = b.getAttribute('data-rcp');
      if (k === 'close') close();
      else if (k === 'save') save(canvas);
      else if (k === 'again' || k === 'names') {
        window.__rcpNames = k === 'names' ? !showNames : showNames;
        build(state, window.__rcpNames);
      }
    });
  }

  function save(canvas) {
    try {
      var a = doc.createElement('a');
      a.download = '今日小票-' + new Date().toISOString().slice(0, 10) + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch (e) { /* the dialog was refused */ }
  }

  function close() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  window.Receipt = {
    open: function (state) { build(state, window.__rcpNames !== false); },
    close: close
  };
})();
