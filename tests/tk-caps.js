/* The captions above the axis are supposed to move the ring. Assert that by reading the
   ring's own centre label before and after each click: if two days differ in their
   figures, the label must change, and if it never changes the click is going nowhere.
   Also reports the class each caption carries, because 今天 and 选中 must not look alike. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[W] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function ringText() {
    var b = document.querySelector('.tk-ring-hole b');
    var s = document.querySelector('.tk-ring-hole span');
    return (b ? b.textContent : '-') + ' / ' + (s ? s.textContent : '-');
  }
  setTimeout(function () {
    var caps = Array.prototype.slice.call(document.querySelectorAll('.tk-cap'));
    if (!caps.length) { note('NO CAPTIONS'); return; }
    note('captions=' + caps.length + ' ring before=' + ringText());
    var chain = Promise.resolve();
    caps.forEach(function (c, i) {
      chain = chain.then(function () {
        c.click();
        return wait(260).then(function () {
          var sel = Array.prototype.slice.call(document.querySelectorAll('.tk-cap'))
            .map(function (x, k) { return x.classList.contains('sel') ? k : null; })
            .filter(function (x) { return x !== null; });
          var today = Array.prototype.slice.call(document.querySelectorAll('.tk-cap'))
            .map(function (x, k) { return x.classList.contains('today') ? k : null; })
            .filter(function (x) { return x !== null; });
          note('click ' + i + ' -> sel=[' + sel.join(',') + '] today=[' + today.join(',') +
            '] ring=' + ringText());
        });
      });
    });
    chain.then(function () { note('done'); });
  }, 1400);
})();
