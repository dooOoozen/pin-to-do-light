/* 环形图的接缝到底是谁画的。

   报告说未完成的那段弧上总带着一丝完成色。截图上能看到：在弧的外缘、紧贴 12 点分界处往回约
   7 px 的灰阶拖尾。三种可能：conic-gradient 硬停点自身的抖动、.today-band 那圈 1px --edge 描边、
   radial-gradient 遮罩。这里用 canvas 的 createConicGradient（和 CSS 走同一个 Skia 着色器）把
   同样的两个硬停点画出来，逐像素读出分界附近的亮度 —— 有拖尾就是渐变引擎，干净就是描边或遮罩。

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/ring-seam.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[R] ' + s); } catch (e) { /* no bridge */ } }
  var TEAL = '#3f4142', DIM = '#cbcac6', PLATE = '#f7f7f6';

  function lum(px, i) { return Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]); }

  /* one disc, hard stops at 54.55%, read across the 12 o'clock seam at several depths from the
     outer edge inward (the reported tail sits at the outer edge only) */
  function probe(pct, label) {
    var N = 240, c = doc.createElement('canvas');
    c.width = N; c.height = N;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = PLATE; g.fillRect(0, 0, N, N);
    var cx = N / 2, cy = N / 2, r = 100;
    var cg = g.createConicGradient(-Math.PI / 2, cx, cy);
    cg.addColorStop(0, TEAL); cg.addColorStop(pct, TEAL);
    cg.addColorStop(pct, DIM); cg.addColorStop(1, DIM);
    g.fillStyle = cg;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    var px = g.getImageData(0, 0, N, N).data;
    var out = [];
    [1, 3, 6, 12, 30, 60].forEach(function (depth) {
      var y = cy - r + depth, line = '';
      for (var x = cx - 9; x <= cx + 9; x++) {
        line += ('    ' + lum(px, (y * N + x) * 4)).slice(-4);
      }
      out.push('d=' + depth + '|' + line);
    });
    note(label + ' seam row across 12 o\'clock (centre = boundary)');
    out.forEach(function (l) { note('  ' + l); });
  }

  probe(0.5455, 'pct=54.55');
  probe(0, 'pct=0');
  probe(1, 'pct=100');
  note('RESULT DONE (canvas only, nothing was written to settings)');
})();
