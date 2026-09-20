/* The search returned zero rows for a character that is plainly in one of the titles,
   so dump what the list actually holds and what the query became. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[G] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function nav(t) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0];
  }
  function titles(tag) {
    note(tag + ' rows=' + document.querySelectorAll('#list .task').length + ' [' +
      Array.prototype.slice.call(document.querySelectorAll('#list .task-title'))
        .map(function (t) { return t.textContent; }).join(' / ') + ']');
  }
  nav('全部任务').click();
  setTimeout(function () {
    titles('visible');
    /* search for something that is demonstrably in the list: a "0 rows" answer is
       only meaningful against a query that should match */
    var first = document.querySelector('#list .task-title').textContent;
    var needle = first.slice(1, 3) || first;
    q('#btnSearch').click();
    setTimeout(function () {
      var inp = q('#search');
      inp.value = needle;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(function () {
        note('needle=' + JSON.stringify(needle) + ' codepoints=' +
          Array.prototype.map.call(needle, function (c) { return c.charCodeAt(0); }).join(','));
        titles('after needle');
        inp.value = '火';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(function () { titles('after 火'); }, 400);
      }, 400);
    }, 300);
  }, 800);
})();
