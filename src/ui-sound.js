/* Interface sound: one short synthesised event per meaningful action, so the desk feels
   like it has hardware in it rather than being a picture of hardware.
   Deliberately a separate module from the receipt machine's sounds. Those are a printer
   making noise while it works and they stay on whatever the interface is set to; these are
   the UI answering a touch, and they obey the mute. */
(function (g) {
  'use strict';

  var ctx = null;
  var last = 0;

  function audio() {
    if (!ctx) {
      var AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    /* a context created before the first gesture starts suspended and stays silent until
       something wakes it — which is every browser's way of saying no autoplay */
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* not yet */ } }
    return ctx;
  }

  function enabled() {
    if (g.__uiMuted) return false;
    var st = g.S && g.S.state && g.S.state.settings;
    return !(st && st.sound === false);
  }

  /* Two UI sounds firing in the same frame (a click that also re-renders) would double up
     into a click that sounds twice, so anything inside 40 ms is dropped. */
  function gate() {
    var n = Date.now();
    if (n - last < 40) return false;
    last = n;
    return true;
  }

  function burst(c, ms, filter, freq, q, gain, curve) {
    var len = Math.max(1, Math.floor(c.sampleRate * (ms / 1000)));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var ch = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      var t = 1 - i / len;
      ch[i] = (Math.random() * 2 - 1) * Math.pow(t, curve);
    }
    var n = c.createBufferSource(); n.buffer = buf;
    var f = c.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
    var v = c.createGain(); v.gain.value = gain;
    n.connect(f); f.connect(v); v.connect(c.destination);
    n.start();
  }

  /* the drum detent, reused everywhere: a dry high click, gone in 12 ms */
  function detent() {
    if (!enabled() || !gate()) return;
    try {
      var c = audio(); if (!c) return;
      burst(c, 12, 'highpass', 1400, 0.7, 0.07, 3);
    } catch (e) { /* no audio */ }
  }

  /* a key, not a detent: the snap of a dome switch */
  function tap() {
    if (!enabled() || !gate()) return;
    try {
      var c = audio(); if (!c) return;
      var t0 = c.currentTime;
      burst(c, 22, 'bandpass', 2600, 1.1, 0.11, 2.2);
      var o = c.createOscillator(), v = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1750, t0);
      o.frequency.exponentialRampToValueAtTime(880, t0 + 0.02);
      v.gain.setValueAtTime(0.045, t0);
      v.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
      o.connect(v); v.connect(c.destination);
      o.start(t0); o.stop(t0 + 0.05);
    } catch (e) { /* no audio */ }
  }

  /* cards going out to the desk: a sheet of paper moving through air. Noise with a
     band that sweeps up as it starts and falls away — no tone in it at all. */
  function scatter() {
    if (!enabled() || !gate()) return;
    try {
      var c = audio(); if (!c) return;
      var t0 = c.currentTime;
      var len = Math.floor(c.sampleRate * 0.26);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var ch = buf.getChannelData(0);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        ch[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) * 0.8;
      }
      var n = c.createBufferSource(); n.buffer = buf;
      var f = c.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(700, t0);
      f.frequency.exponentialRampToValueAtTime(2600, t0 + 0.11);
      f.frequency.exponentialRampToValueAtTime(500, t0 + 0.26);
      var v = c.createGain();
      v.gain.setValueAtTime(0.0001, t0);
      v.gain.linearRampToValueAtTime(0.075, t0 + 0.05);
      v.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.27);
      n.connect(f); f.connect(v); v.connect(c.destination);
      n.start(t0);
    } catch (e) { /* no audio */ }
  }

  g.UISound = { detent: detent, tap: tap, scatter: scatter, enabled: enabled };
})(window);
