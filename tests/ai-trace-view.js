/* Does the settings panel actually show the trace the card layer wrote?
   The two windows share nothing but the host, so this is the check that the ring is real:
   the overlay runs the agent chain (tests/agent-chain.js), and here the settings screen
   should render those steps — grouped by turn, newest first — without either window
   knowing the other's variables. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[TR] ' + s); } catch (e) { /* no bridge */ } }

  setTimeout(function () {
    var btn = document.getElementById('btnSettings');
    if (!btn) { note('no #btnSettings'); return; }
    btn.click();
    setTimeout(function () {
      var rows = document.querySelectorAll('.ai-trace .tr');
      var heads = document.querySelectorAll('.ai-trace .trh');
      var warn = document.querySelectorAll('.ai-trace .tr.warn');
      note('rows=' + rows.length + ' turns=' + heads.length + ' warn=' + warn.length +
        ' count=' + ((document.getElementById('aiTraceCount') || {}).textContent || '-'));
      note('newest=' + (rows[0] ? rows[0].textContent.replace(/\s+/g, ' ').slice(0, 90) : '-'));
      var stages = {};
      Array.prototype.forEach.call(rows, function (r) {
        var k = r.querySelector('b') ? r.querySelector('b').textContent : '?';
        stages[k] = (stages[k] || 0) + 1;
      });
      note('stages=' + JSON.stringify(stages));
      document.getElementById('aiTraceReload').click();
      setTimeout(function () {
        note('afterReload rows=' + document.querySelectorAll('.ai-trace .tr').length);
        var close = document.querySelector('.modal [data-act="done"]');
        if (close) close.click();
      }, 500);
    }, 1600);
  }, 11000);
})();
