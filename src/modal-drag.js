/* Lets a modal be dragged off the centre of the screen by its title bar.

   The immediate reason is the colour lab: while the panel is open it covers the very
   surface you are retuning. Moving it is also what you would expect from a window that
   sits over a desktop for hours. */
(function (g) {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function makeDraggable(panel, head) {
    if (!panel || !head || head.dataset.dragBound) return;
    head.dataset.dragBound = '1';
    head.classList.add('draggable');
    var off = { x: 0, y: 0 };
    var start = null;

    function place() {
      panel.style.transform = 'translate3d(' + off.x + 'px,' + off.y + 'px,0)';
    }

    head.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      /* the close button and any control in the bar must stay clickable */
      if (ev.target.closest('button, input, select, textarea, a, label')) return;
      start = { x: ev.clientX, y: ev.clientY, ox: off.x, oy: off.y };
      head.classList.add('dragging');
      try { head.setPointerCapture(ev.pointerId); } catch (e) { /* capture is a bonus */ }
      ev.preventDefault();
    });

    head.addEventListener('pointermove', function (ev) {
      if (!start) return;
      var r = panel.getBoundingClientRect();
      /* where the panel would sit with no drag at all: the current rect minus the
         offset already applied */
      var baseLeft = r.left - off.x;
      var baseTop = r.top - off.y;
      /* The whole panel has to stay inside the window. A webview cannot paint outside
         its own window, so the old "keep 60px grabbable" limit let most of a dragged
         dialog vanish — it read as the dialog losing a piece, not as being off-screen.
         When the panel is larger than the viewport there is no in-bounds position, so
         pin it to the top-left rather than to an impossible range. */
      var loX = -baseLeft, hiX = window.innerWidth - r.width - baseLeft;
      var loY = -baseTop, hiY = window.innerHeight - r.height - baseTop;
      off.x = hiX < loX ? loX : clamp(start.ox + (ev.clientX - start.x), loX, hiX);
      off.y = hiY < loY ? loY : clamp(start.oy + (ev.clientY - start.y), loY, hiY);
      place();
    });

    function end(ev) {
      if (!start) return;
      start = null;
      head.classList.remove('dragging');
      try { head.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);

    /* double-click the bar to send the panel back to where it started */
    head.addEventListener('dblclick', function (ev) {
      if (ev.target.closest('button, input, select, textarea, a')) return;
      off = { x: 0, y: 0 };
      panel.style.width = '';
      panel.style.height = '';
      place();
    });

    /* Resize, from a corner grip. Being unable to leave the window is exactly the
       argument for this: the colour lab is only useful if the dialog can be made
       small enough to see the desk behind it. */
    var grip = document.createElement('i');
    grip.className = 'modal-grip';
    grip.title = '拖动改变大小 · 双击标题栏复原';
    panel.appendChild(grip);
    var rz = null;
    grip.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      var r = panel.getBoundingClientRect();
      rz = { x: ev.clientX, y: ev.clientY, w: r.width, h: r.height };
      panel.classList.add('resizing');
      try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* capture is a bonus */ }
      ev.preventDefault();
      ev.stopPropagation();
    });
    grip.addEventListener('pointermove', function (ev) {
      if (!rz) return;
      /* the panel is offset from the viewport edges by its own margin, so the cap is
         its current left/top plus the space that remains */
      var r = panel.getBoundingClientRect();
      var maxW = Math.max(320, window.innerWidth - r.left - 8);
      var maxH = Math.max(180, window.innerHeight - r.top - 8);
      panel.style.width = clamp(rz.w + (ev.clientX - rz.x), 320, maxW) + 'px';
      panel.style.height = clamp(rz.h + (ev.clientY - rz.y), 180, maxH) + 'px';
    });
    function rzEnd(ev) {
      if (!rz) return;
      rz = null;
      panel.classList.remove('resizing');
      try { grip.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
    grip.addEventListener('pointerup', rzEnd);
    grip.addEventListener('pointercancel', rzEnd);
  }

  g.NeonModalDrag = { make: makeDraggable };
})(window);
