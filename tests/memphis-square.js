/* 紫电拼贴改成直角 is a claim about every rounded corner the material used to have, so this
   walks the elements that carry one — plate, control, pill, badge, index mark, card — and
   reports the radius each is actually painted with. A token set to 0 that some component
   overrides with a literal 22px is the failure mode worth catching here, and it is the one
   the diner material already has. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var root = document.documentElement;
  var was = { style: root.dataset.style, theme: root.dataset.theme };

  function radius(sel) {
    var n = document.querySelector(sel);
    if (!n) return null;
    var cs = getComputedStyle(n);
    return [cs.borderTopLeftRadius, cs.borderTopRightRadius,
      cs.borderBottomLeftRadius, cs.borderBottomRightRadius];
  }
  function report(tag) {
    var body = getComputedStyle(document.body);
    var rows = [
      ['card .todo-card', radius('.todo-card')],
      ['deck .deck-face', radius('.deck-face')],
      ['control .btn', radius('.btn')],
      ['icon .icon-btn', radius('.icon-btn')],
      ['input .input', radius('.input')],
      ['badge .badge', radius('.badge')],
      ['stamp .stamp', radius('.stamp')],
      ['plate #modClock', radius('#modClock')],
      ['modal .modal-panel', radius('.modal-panel')],
      ['day-head', radius('.day-head')]
    ].filter(function (r) { return r[1] !== null; });
    note(tag + ' r-plate=' + body.getPropertyValue('--r-plate').trim() +
      ' r-ctl=' + body.getPropertyValue('--r-ctl').trim() +
      ' r-pill=' + body.getPropertyValue('--r-pill').trim() +
      ' :: ' + rows.map(function (r) { return r[0] + '=' + r[1].join('/'); }).join(' | '));
    /* a corner is square only at 0px: "0px/12px" is an elliptical corner, which no one calls
       直角 and no earlier version of this check caught */
    return rows.filter(function (r) {
      return r[1].some(function (v) { return parseFloat(v) !== 0; });
    });
  }

  root.dataset.style = 'memphis';
  var bad = [];
  wait(500).then(function () {
    bad = bad.concat(report('memphis day'));
    root.dataset.theme = 'ink';
    return wait(500);
  }).then(function () {
    bad = bad.concat(report('memphis night'));
    root.dataset.theme = was.theme;
    root.dataset.style = was.style;
    var flat = bad.length === 0;
    note('RESULT ' + (flat ? 'PASS every corner of 紫电拼贴 is square, day and night'
      : 'FAIL still rounded: ' + bad.map(function (r) { return r[0] + '=' + r[1].join('/'); }).join(', ')));
  }).catch(function (e) {
    root.dataset.theme = was.theme;
    root.dataset.style = was.style;
    note('RESULT ERROR ' + (e && e.message));
  });
})();
