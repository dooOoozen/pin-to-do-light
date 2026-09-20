/**
 * DASHBOARD 1971 — dashboard renderer.
 * Views (仪表盘 + task ledger), quick natural-language add, compact composer with
 * the derived plan/repeat widget, settings, sidebar control.
 */
(function () {
  'use strict';

  const D = window.NeonData;
  const API = window.API;
  const doc = document;
  const $ = (sel, root) => (root || doc).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || doc).querySelectorAll(sel));

  const VIEWS = [
    { id: 'dash', label: '仪表盘', en: 'DASHBOARD' },
    { id: 'tracking', label: '时间轴', en: 'TRACKING' },
    { id: 'timeline', label: '时间线', en: 'TIMELINE' },
    { id: 'calendar', label: '月历', en: 'MONTH' },
    { id: 'all', label: '全部任务', en: 'ALL OPEN' },
    { id: 'today', label: '今日到期', en: 'TODAY' },
    { id: 'upcoming', label: '即将到期', en: 'NEXT 7 DAYS' },
    { id: 'overdue', label: '已逾期', en: 'OVERDUE' },
    { id: 'done', label: '已完成', en: 'ARCHIVE' }
  ];
  const SORTS = [
    { id: 'smart', label: '智能排序 SMART' },
    { id: 'due', label: '截止时间 DUE' },
    { id: 'priority', label: '优先级 PRIORITY' },
    { id: 'created', label: '创建时间 CREATED' },
    { id: 'alpha', label: '名称 A-Z' }
  ];

  const S = {
    state: null, view: 'all', groupId: null, q: '', prio: 'all', sort: 'smart',
    miniGroup: null, lastDone: null, calMonth: null, calDay: null,
    tkDay: null, tkMode: 'week', tkScroll: null
  };
  const el = {};
  let rowDrag = null;
  let calCellHit = { day: null, at: 0 };
  let rowHint = null;
  let tkFit = null;         /* the tracking view's resize handler, one at a time */
  let rowDragSuppressClick = 0;
  let clockTimer = null;
  let doneTimer = null;
  let planApi = null;

  init();

  async function init() {
    el.nav = $('#navFilters');
    el.groups = $('#groupList');
    el.list = $('#list');
    el.viewPanel = $('#viewPanel');
    el.viewTitle = $('#viewTitle');
    el.viewSub = $('#viewSub');
    el.tbDot = $('#tbDot');
    el.newTitle = $('#newTitle');
    el.newGroup = $('#newGroup');
    el.newPrio = $('#newPrio');
    el.newAdd = $('#newAdd');
    el.composerExtra = $('#composerExtra');
    el.entryForm = doc.querySelector('#pageTasks .composer');
    el.toolbar = doc.querySelector('#pageTasks .toolbar');
    el.planBtn = $('#planBtn');
    el.planPop = $('#planPop');
    el.planHost = $('#planHost');
    el.search = $('#search');
    el.searchRow = $('#searchRow');
    el.btnSearch = $('#btnSearch');
    el.btnSearchClear = $('#btnSearchClear');
    el.prioFilter = $('#prioFilter');
    el.sortSel = $('#sortSel');
    el.countLabel = $('#countLabel');
    el.btnOverlay = $('#btnOverlay');
    el.btnTheme = $('#btnTheme');
    el.rulerLabels = $('#rulerLabels');
    el.sideMeter = $('#sideMeter');
    el.modal = $('#modalRoot');
    el.toast = $('#toastRoot');
    el.qaInput = $('#qaInput');
    el.qaBtn = $('#qaBtn');
    el.qaPreview = $('#qaPreview');
    el.pageDash = $('#pageDash');
    el.pageTasks = $('#pageTasks');
    el.clockTime = $('#clockTime');
    el.clockDate = $('#clockDate');
    el.clockWeek = $('#clockWeek');
    el.dashStats = $('#dashStats');
    el.heatBody = $('#heatBody');
    el.heatLabel = $('#heatLabel');
    el.miniGroup = $('#miniGroup');
    el.miniList = $('#miniList');

    S.state = await API.getState();
    S.miniGroup = S.state.settings.activeGroupId;

    buildStaticOptions();
    buildRuler();
    bindEvents();
    bindSideResizer();
    bindQuickAdd();
    bindComposerPlan();
    applyZoom();
    applyTheme();
    applySideWidth();
    applySideCollapsed();
    renderAll();
    startClock();
    /* a white panel is either an unapplied stylesheet or a page that never got
       composited; these two readings separate them without needing to be watched */
    if (API.reportRender) {
      API.reportRender('panel boot');
      setTimeout(() => API.reportRender('panel +1.5s'), 1500);
    }

    window.addEventListener('resize', buildRuler);

    API.onState((state) => { S.state = state; applyZoom(); applyTheme(); applySideWidth(); renderAll(); });
    API.onCommand((cmd) => {
      if (cmd && cmd.type === 'view') applyView(cmd.view);
    });
    /* The panel window is created and told which view to show before this page has
       run a single line, so a command emitted at creation always lands on deaf
       ears. Ask for it once the listeners exist instead. */
    if (API.takePanelView) {
      const wanted = await API.takePanelView();
      if (wanted) { applyView(wanted); if (API.reportRender) API.reportRender('panel view=' + wanted); }
    }
    /* two frames deep: the window is created hidden, and this is the signal that the
       view list, the deck list and the ledger rows are in the DOM and painted, so the
       user never sees the chrome arrive ahead of its content */
    if (API.panelReady) {
      requestAnimationFrame(() => requestAnimationFrame(() => API.panelReady()));
    }
  }

  function applyView(view) {
    if (!view) return;
    if (view === 'settings') openSettings();
    else if (VIEWS.some((v) => v.id === view)) { S.view = view; S.groupId = null; renderAll(); }
  }

  /* ---------------------------------------------------------------- options */

  function buildStaticOptions() {
    el.newPrio.innerHTML = D.PRIORITIES.map((p) => '<option value="' + p + '">优先级 ' + D.PRIORITY_LABEL[p] + '</option>').join('');
    el.prioFilter.innerHTML = '<option value="all">全部优先级</option>' +
      D.PRIORITIES.map((p) => '<option value="' + p + '">' + D.PRIORITY_LABEL[p] + '级</option>').join('');
    el.sortSel.innerHTML = SORTS.map((s) => '<option value="' + s.id + '">' + s.label + '</option>').join('');
  }

  function sortedGroups() {
    return S.state.groups.slice().sort((a, b) => a.order - b.order);
  }

  function refreshGroupSelects() {
    const allOption = '<option value="__all__">全部 ALL</option>';
    const options = sortedGroups().map((g) => '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>').join('');
    const prev = el.newGroup.value;
    el.newGroup.innerHTML = options;
    const wanted = (S.view === 'group' && S.groupId) ? S.groupId : (prev && D.groupById(S.state, prev) ? prev : S.state.settings.activeGroupId);
    if (wanted && D.groupById(S.state, wanted)) el.newGroup.value = wanted;

    el.miniGroup.innerHTML = allOption + options;
    if (!S.miniGroup || (S.miniGroup !== '__all__' && !D.groupById(S.state, S.miniGroup))) S.miniGroup = S.state.settings.activeGroupId;
    el.miniGroup.value = S.miniGroup;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function buildRuler() {
    if (!el.rulerLabels) return;
    const step = 120;
    const count = Math.ceil((window.innerWidth || 1600) / step) + 1;
    let html = '';
    for (let i = 0; i < count; i++) {
      html += '<span style="left:' + (i * step + 4) + 'px">' + String(i + 1).padStart(3, '0') + '</span>';
    }
    el.rulerLabels.innerHTML = html;
  }

  /* one attribute on the root: the whole design reads its colours from the theme.css
     tokens, so the night palette is a swap rather than a restyle pass */
  function applyTheme() {
    if (window.NeonTheme) window.NeonTheme.apply(S.state && S.state.settings);
    const ink = S.state && S.state.settings.theme === 'ink';
    if (el.btnTheme) {
      el.btnTheme.textContent = ink ? '昼' : '夜';
      el.btnTheme.title = ink ? '切换到白昼主题' : '切换到夜间主题';
      el.btnTheme.classList.toggle('primary', !!ink);
    }
  }

  function applyZoom() {
    const k = Math.min(2, Math.max(0.8, Number(S.state.settings.uiScale) || 1.3));
    API.setZoom(k);
  }

  function applySideWidth() {
    const w = Math.min(520, Math.max(220, Number(S.state.settings.sideWidth) || 286));
    document.body.style.setProperty('--side-w', w + 'px');
  }

  function applySideCollapsed() {
    const collapsed = S.state.settings.sideCollapsed === true;
    document.body.classList.toggle('side-collapsed', collapsed);
    const btn = $('#btnSide');
    if (btn) {
      btn.textContent = collapsed ? '⟩' : '⟨';
      btn.title = collapsed ? '展开左侧导航栏' : '收起左侧导航栏';
    }
  }

  function toggleSide() {
    API.op({ type: 'settings:update', patch: { sideCollapsed: S.state.settings.sideCollapsed !== true } });
  }

  /* ---------------------------------------------------------------- filtering */

  function viewLabel() {
    if (S.view === 'group') {
      const g = D.groupById(S.state, S.groupId);
      return g ? g.name : '分组';
    }
    const v = VIEWS.find((x) => x.id === S.view);
    return v ? v.label : '全部任务';
  }

  function visibleTodos() {
    let list = S.state.todos.slice();
    const view = S.view;
    if (view === 'all' || view === 'dash' || view === 'timeline' || view === 'calendar') list = list.filter((t) => !t.done);
    else if (view === 'today') list = list.filter((t) => !t.done && D.isToday(t));
    else if (view === 'upcoming') list = list.filter((t) => !t.done && D.isUpcoming(t));
    else if (view === 'overdue') list = list.filter((t) => !t.done && D.isOverdue(t));
    else if (view === 'done') list = list.filter((t) => t.done);
    else if (view === 'group') list = list.filter((t) => t.groupId === S.groupId);

    if (S.prio !== 'all') list = list.filter((t) => (t.priority || 'none') === S.prio);

    const q = S.q.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const hay = (t.title + ' ' + (t.notes || '') + ' ' + (t.tags || []).join(' ')).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    if (view === 'done') {
      list.sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt));
      return list;
    }
    if (view === 'timeline' || view === 'calendar') return D.sortTodos(list, 'due');
    return D.sortTodos(list, S.sort);
  }

  /* ---------------------------------------------------------------- render */

  function renderAll() {
    refreshGroupSelects();
    renderPage();
    renderNav();
    renderDashboard();
    renderSideMeter();
    renderList();
    applySideCollapsed();
    el.viewTitle.textContent = viewLabel();
    const st = D.stats(S.state);
    el.viewSub.textContent = 'OPEN ' + st.open + ' / DONE ' + st.done + ' / TOTAL ' + st.total;
    const accent = S.view === 'group' ? D.colorOf(S.state, S.groupId) : D.PALETTE.brick;
    document.body.style.setProperty('--accent', accent);
    el.tbDot.style.background = accent;
    el.btnOverlay.classList.toggle('primary', S.state.settings.overlay !== false);
  }

  function renderPage() {
    const dash = S.view === 'dash';
    el.pageDash.classList.toggle('u-hidden', !dash);
    el.pageTasks.classList.toggle('u-hidden', dash);
    /* the scroller keeps the outgoing page's offset, so a shorter page arriving under
       a deep scroll position shows a scrollbar for a frame before it is clamped back */
    const scroller = el.pageDash.closest('.main');
    if (scroller) scroller.scrollTop = 0;
  }

  function renderNav() {
    const st = D.stats(S.state);
    const counts = { dash: st.open, all: st.open, today: st.today, upcoming: st.upcoming, overdue: st.overdue, done: st.done, timeline: st.open, calendar: st.open, tracking: st.open };
    el.nav.innerHTML = '';
    VIEWS.forEach((v) => {
      const b = doc.createElement('button');
      b.className = (S.view === v.id ? 'on' : '');
      b.innerHTML = '<span class="nmark"></span><span>' + escapeHtml(v.label) + '</span>' +
        '<span class="ncount">' + (counts[v.id] || 0) + '</span>';
      b.title = v.en;
      b.addEventListener('click', () => { S.view = v.id; S.groupId = null; renderAll(); });
      el.nav.appendChild(b);
    });

    el.groups.innerHTML = '';
    sortedGroups().forEach((g) => {
      const items = S.state.todos.filter((t) => t.groupId === g.id);
      const open = items.filter((t) => !t.done).length;
      const li = doc.createElement('li');
      li.className = (S.view === 'group' && S.groupId === g.id ? 'on' : '');
      li.dataset.group = g.id;
      li.innerHTML =
        '<i class="dot"></i>' +
        '<span class="gname"></span>' +
        (g.locked ? '<span class="glock" title="固定分组，不可删除"></span>' : '<button class="icon-btn gedit" title="编辑分组">\u270E</button>') +
        '<span class="gcount">' + open + '/' + items.length + '</span>';
      const dot = li.querySelector('.dot');
      dot.style.background = D.PALETTE[g.color] || D.PALETTE.brick;
      li.querySelector('.gname').textContent = g.name;
      li.addEventListener('click', () => { S.view = 'group'; S.groupId = g.id; renderAll(); });
      const edit = li.querySelector('.gedit');
      if (edit) {
        edit.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openGroupModal(g);
        });
      }
      el.groups.appendChild(li);
    });
  }

  function renderSideMeter() {
    if (!el.sideMeter) return;
    const st = D.stats(S.state);
    const blocks = 10;
    const done = st.total ? Math.round(blocks * (st.done / st.total)) : 0;
    let html = '<div class="label">COMPLETION / 完成度</div><div class="block-meter">';
    for (let i = 0; i < blocks; i++) html += '<i class="' + (i < done ? 'on brick' : '') + '"></i>';
    html += '</div><div class="row" style="justify-content:space-between;margin-top:7px">' +
      '<span class="tiny faint">DONE ' + st.done + '</span><span class="tiny faint">TOTAL ' + st.total + '</span></div>';
    el.sideMeter.innerHTML = html;
  }

  /* ---------------------------------------------------------------- dashboard page */

  function startClock() {
    const tick = () => {
      const now = new Date();
      const pad = (n) => (n < 10 ? '0' : '') + n;
      if (el.clockTime) el.clockTime.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
      if (el.clockDate) el.clockDate.textContent = now.getFullYear() + ' / ' + pad(now.getMonth() + 1) + ' / ' + pad(now.getDate());
      if (el.clockWeek) el.clockWeek.textContent = 'WEEKDAY · 星期' + D.WEEKDAY_CN[now.getDay()];
      tickTimers();
      /* the gauge counts down on its own: a re-render every second would throw away
         the memo caret, the hover state and the scroll position */
      paintPomo();
    };
    tick();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tick, 1000);
  }

  /* running durations tick without re-rendering the whole ledger */
  function tickTimers() {
    const now = Date.now();
    /* The tracking view keeps a live clock, a run block that grows and a now-line
       that walks across the day. All three are patched in place — re-rendering the
       view every second would throw away scroll position and hover state. */
    const dur = doc.getElementById('tkDur');
    const run = D.openEntry(S.state);
    if (dur) dur.textContent = run ? hms(now - new Date(run.start).getTime()) : '00:00:00';
    if (run) {
      const t0 = new Date(D.dayKey(new Date()) + 'T00:00:00').getTime();
      const line = doc.getElementById('tkNowline');
      if (line) line.style.top = ((now - t0) / 3600000 * TK_HOUR_PX) + 'px';
      const blk = doc.querySelector('.tk-blk.open');
      /* the column ends at midnight, so a run that is still going into tomorrow
         stops growing here instead of running off the bottom of the axis */
      if (blk) {
        const to = Math.min(now, t0 + 86400000);
        blk.style.height = Math.max(14, (to - new Date(run.start).getTime()) / 3600000 * TK_HOUR_PX - 1) + 'px';
      }
      /* the running record is also listed under 最近记录, and that row was written
         once at render time — without this it sits there at 00:00 while the clock
         above it counts up */
      $$('[data-live-ms]').forEach((n) => {
        const txt = hms(now - new Date(n.dataset.liveMs).getTime());
        if (n.textContent !== txt) n.textContent = txt;
      });
    }
    const nodes = $$('[data-spent]');
    if (!nodes.length) return;
    nodes.forEach((n) => {
      const t = D.todoById(S.state, n.dataset.spent);
      if (!t) return;
      const text = '\u23F1 ' + D.formatSpent(D.spentOf(t, now));
      if (n.textContent !== text) n.textContent = text;
    });
  }

  function renderDashboard() {
    if (S.view !== 'dash') return;
    bindDashLayout();
    applyDashLayout();
    const st = D.stats(S.state);
    const grew = S.lastDone !== null && st.done > S.lastDone;
    const tiles = [
      { k: 'OPEN / 未完成', v: st.open, i: '01', key: 'open' },
      { k: 'TODAY / 今日到期', v: st.today, i: '02', key: 'today' },
      { k: 'OVERDUE / 已逾期', v: st.overdue, i: '03', key: 'overdue', brick: st.overdue > 0 },
      { k: 'DONE / 已完成', v: st.done, i: '04', key: 'done' }
    ];
    el.dashStats.innerHTML = tiles.map((t) =>
      '<div class="stat" data-stat="' + t.key + '">' +
      '  <div class="stat-head"><span class="idx-mark plain">' + t.i + '</span><span class="k">' + t.k + '</span></div>' +
      '  <div class="v' + (t.brick ? ' brick' : '') + '" data-stat-value="' + t.key + '">' + t.v + '</div>' +
      '</div>'
    ).join('');
    S.lastDone = st.done;
    const doneTile = el.dashStats.querySelector('.stat[data-stat="done"]');
    if (doneTile && grew) {
      doneTile.classList.add('celebrate');
      setTimeout(() => doneTile.classList.remove('celebrate'), 1000);
    }
    renderHeatmap();
    renderMiniList();
    renderDashMid();
  }

  /* ------------------------------------------------- dashboard mid band:
     pomodoro gauge and today ring and the memo pad */

  const POMO = { len: 25 * 60000, left: 25 * 60000, until: 0, running: false, mode: 'focus' };
  const POMO_BREAK = 5 * 60000;

  /* dial maths: degrees measured from 12 o'clock, increasing clockwise */
  const GA0 = -135, GA1 = 135, GSPAN = GA1 - GA0;
  function polar(cx, cy, r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arcPath(cx, cy, r, a0, a1) {
    const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    return 'M' + p0[0].toFixed(1) + ',' + p0[1].toFixed(1) +
      ' A' + r + ',' + r + ' 0 ' + ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' +
      p1[0].toFixed(1) + ',' + p1[1].toFixed(1);
  }

  /* A 270° dial with the gap at the bottom and a needle pointing at what is left,
     the way the reference gauge reads. SVG rather than a masked conic gradient
     because a partial arc plus ticks plus a needle is not what conic stops are good
     at, and this has to repaint every second. */
  function gaugeSvg(frac, lo, hi) {
    const cx = 62, cy = 60, r = 44;
    const a = GA0 + GSPAN * Math.max(0, Math.min(1, frac));
    let s = '<svg viewBox="0 0 124 120" class="gsvg" aria-hidden="true">';
    s += '<path class="g-track" d="' + arcPath(cx, cy, r, GA0, GA1) + '" />';
    /* the filled part is what is left, read from the 0 mark at the left end */
    if (a > GA0 + 0.6) s += '<path class="g-left" d="' + arcPath(cx, cy, r, GA0, a) + '" />';
    for (let i = 0; i <= 10; i++) {
      const ta = GA0 + GSPAN * i / 10;
      const maj = i % 5 === 0;
      const p1 = polar(cx, cy, r + 4, ta), p2 = polar(cx, cy, r + (maj ? 10 : 7), ta);
      s += '<line class="g-tick' + (maj ? ' maj' : '') + '" x1="' + p1[0].toFixed(1) +
        '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '" />';
    }
    const tip = polar(cx, cy, r - 6, a);
    s += '<line class="g-needle" x1="' + cx + '" y1="' + cy + '" x2="' + tip[0].toFixed(1) + '" y2="' + tip[1].toFixed(1) + '" />';
    s += '<circle class="g-hub" cx="' + cx + '" cy="' + cy + '" r="3.6" />';
    const e0 = polar(cx, cy, r, GA0), e1 = polar(cx, cy, r, GA1);
    s += '<text class="g-num" x="' + (e0[0] - 5).toFixed(1) + '" y="' + (e0[1] + 12).toFixed(1) + '">' + lo + '</text>';
    s += '<text class="g-num" x="' + (e1[0] + 1).toFixed(1) + '" y="' + (e1[1] + 12).toFixed(1) + '">' + hi + '</text>';
    return s + '</svg>';
  }

  /* Time left, in the three colours of the desk: honey when it is nearly gone, sage
     through the working stretch, vermillion once the session runs long. */
  function pomoColour(leftMs) {
    const m = leftMs / 60000;
    if (m <= 5) return 'var(--honey)';
    if (m <= 25) return 'var(--sage)';
    return 'var(--vermillion)';
  }

  /* ---- the dashboard grid the user assembles themselves ---- */

  const MOD_DEFAULT = [
    { id: 'clock', span: 2 }, { id: 'stats', span: 4 },
    { id: 'pomo', span: 2 }, { id: 'today', span: 2 }, { id: 'memo', span: 2 },
    { id: 'heat', span: 3 }, { id: 'mini', span: 3 }
  ];
  /* how many of the six columns a module may claim, and how many rows it may take */
  const SPANS = [2, 3, 4, 6];
  const ROWS = [1, 2];
  const GRID_GAP = 10;

  /* free dragging lands anywhere; the grid only has these sizes, so the pointer is
     snapped to the closest one and the module never ends up in a half column */
  function snapTo(list, v) {
    let best = list[0];
    for (let i = 1; i < list.length; i++) {
      if (Math.abs(list[i] - v) < Math.abs(best - v)) best = list[i];
    }
    return best;
  }

  function dashLayout() {
    const span = {};
    const row = {};
    MOD_DEFAULT.forEach((m) => { span[m.id] = m.span; row[m.id] = 1; });
    let order = MOD_DEFAULT.map((m) => m.id);
    const saved = S.state.settings.dashLayout;
    if (saved && Array.isArray(saved.order)) {
      const known = saved.order.filter((id) => span[id] !== undefined);
      /* a module added in a later build still has to appear */
      order.forEach((id) => { if (known.indexOf(id) < 0) known.push(id); });
      if (known.length === order.length) order = known;
    }
    if (saved && saved.span) {
      Object.keys(span).forEach((k) => {
        if (SPANS.indexOf(Number(saved.span[k])) >= 0) span[k] = Number(saved.span[k]);
      });
    }
    if (saved && saved.row) {
      Object.keys(row).forEach((k) => {
        if (ROWS.indexOf(Number(saved.row[k])) >= 0) row[k] = Number(saved.row[k]);
      });
    }
    return { order: order, span: span, row: row };
  }

  let dashDrag = null;
  let dashSize = null;

  function applyDashLayout() {
    const grid = doc.getElementById('dashGrid');
    /* while a module is being dragged the DOM order is the user's live intent, and
       a re-render that re-applied the saved order would snap it back mid-drag */
    if (!grid || dashDrag || dashSize) return;
    const L = dashLayout();
    L.order.forEach((id) => {
      const el = grid.querySelector('[data-mod="' + id + '"]');
      if (!el) return;
      el.style.gridColumn = 'span ' + L.span[id];
      el.style.gridRow = 'span ' + (L.row[id] || 1);
      grid.appendChild(el);
      if (!el.querySelector('.mod-size')) {
        const g = doc.createElement('button');
        g.className = 'mod-size';
        g.type = 'button';
        g.title = '拖动缩放（自动吸附到列与行）';
        g.textContent = '\u25D7';
        el.appendChild(g);
        const tag = doc.createElement('span');
        tag.className = 'mod-size-tag';
        el.appendChild(tag);
      }
    });
    $$('.mod', grid).forEach((el) => {
      const b = el.querySelector('.mod-span');
      const id = el.dataset.mod;
      if (b) {
        b.textContent = L.span[id] + '/6';
        b.title = '当前占 ' + L.span[id] + ' / 6 列，点击切换';
      }
      const s = el.querySelector('.mod-size');
      if (s) s.title = '当前 ' + L.span[id] + ' 列 × ' + (L.row[id] || 1) + ' 行，拖动缩放（自动吸附）';
    });
  }

  function persistDashLayout() {
    const grid = doc.getElementById('dashGrid');
    if (!grid) return;
    const order = [], span = {}, row = {};
    $$('.mod', grid).forEach((el) => {
      order.push(el.dataset.mod);
      span[el.dataset.mod] = (parseInt(el.style.gridColumn.replace(/\D/g, ''), 10) || 2);
      row[el.dataset.mod] = (parseInt(el.style.gridRow.replace(/\D/g, ''), 10) || 1);
    });
    API.op({ type: 'settings:update', patch: { dashLayout: { order: order, span: span, row: row } } });
  }

  function bindDashLayout() {
    const grid = doc.getElementById('dashGrid');
    if (!grid || grid.dataset.layoutBound) return;
    grid.dataset.layoutBound = '1';

    /* Pointer-based, not HTML5 drag-and-drop: the native drag never reliably starts
       from a draggable flag set during pointerdown, and it fights the store re-render
       the same way the ledger rows already learned to avoid. Reordering the DOM under
       the pointer needs no ghost image and works in every mode. */
    grid.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || dashDrag) return;
      const head = ev.target.closest('.mod-head');
      if (!head || ev.target.closest('button, select, input, textarea')) return;
      const mod = head.closest('.mod');
      if (!mod) return;
      dashDrag = { mod: mod, x: ev.clientX, y: ev.clientY, moved: false };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });

    function move(ev) {
      if (!dashDrag) return;
      if (!dashDrag.moved) {
        if (Math.abs(ev.clientX - dashDrag.x) < 4 && Math.abs(ev.clientY - dashDrag.y) < 4) return;
        dashDrag.moved = true;
        dashDrag.mod.classList.add('dragging-mod');
        grid.classList.add('reordering');
      }
      ev.preventDefault();
      /* the dragged module ignores the pointer so the hit test finds what is behind it */
      const under = doc.elementFromPoint(ev.clientX, ev.clientY);
      const over = under && under.closest ? under.closest('.mod') : null;
      if (!over || over === dashDrag.mod) return;
      const box = over.getBoundingClientRect();
      grid.insertBefore(dashDrag.mod, (ev.clientX - box.left) > box.width / 2 ? over.nextSibling : over);
    }

    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dashDrag) return;
      const wasDrag = dashDrag.moved;
      dashDrag.mod.classList.remove('dragging-mod');
      dashDrag.mod = null;
      grid.classList.remove('reordering');
      dashDrag = null;
      if (!wasDrag) return;
      persistDashLayout();
      toast('仪表盘布局已保存 // LAYOUT SAVED');
    }

    grid.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || dashSize) return;
      const grip = ev.target.closest('.mod-size');
      if (!grip) return;
      const mod = grip.closest('.mod');
      if (!mod) return;
      ev.preventDefault();
      const r = mod.getBoundingClientRect();
      const L = dashLayout();
      /* one column and one row measured from the module itself, so the pointer only has
         to be converted into "how many of these do you want" */
      dashSize = {
        mod: mod, left: r.left, top: r.top,
        unit: (r.width + GRID_GAP) / (L.span[mod.dataset.mod] || 2),
        unitH: (r.height + GRID_GAP) / (L.row[mod.dataset.mod] || 1),
        moved: false
      };
      mod.classList.add('sizing');
      window.addEventListener('pointermove', size);
      window.addEventListener('pointerup', endSize);
      window.addEventListener('pointercancel', endSize);
    });

    function size(ev) {
      if (!dashSize) return;
      dashSize.moved = true;
      ev.preventDefault();
      const cols = snapTo(SPANS, Math.round((ev.clientX - dashSize.left + GRID_GAP) / dashSize.unit));
      const rows = snapTo(ROWS, Math.round((ev.clientY - dashSize.top + GRID_GAP) / dashSize.unitH));
      const mod = dashSize.mod;
      mod.style.gridColumn = 'span ' + cols;
      mod.style.gridRow = 'span ' + rows;
      const b = mod.querySelector('.mod-span');
      if (b) b.textContent = cols + '/6';
      const tag = mod.querySelector('.mod-size-tag');
      if (tag) tag.textContent = cols + '\u00d7' + rows;
    }

    function endSize() {
      window.removeEventListener('pointermove', size);
      window.removeEventListener('pointerup', endSize);
      window.removeEventListener('pointercancel', endSize);
      if (!dashSize) return;
      const wasDrag = dashSize.moved;
      dashSize.mod.classList.remove('sizing');
      dashSize = null;
      if (!wasDrag) return;
      persistDashLayout();
      applyDashLayout();
      toast('模块尺寸已保存 // RESIZED');
    }

    grid.addEventListener('click', (ev) => {
      const b = ev.target.closest('.mod-span');
      if (!b) return;
      const mod = b.closest('.mod');
      const L = dashLayout();
      const cur = L.span[mod.dataset.mod];
      L.span[mod.dataset.mod] = SPANS[(SPANS.indexOf(cur) + 1) % SPANS.length];
      mod.style.gridColumn = 'span ' + L.span[mod.dataset.mod];
      b.textContent = L.span[mod.dataset.mod] + '/6';
      b.title = '当前占 ' + L.span[mod.dataset.mod] + ' / 6 列，点击切换';
      persistDashLayout();
    });
  }

  function ensureDashMid() {
    const pomo = doc.querySelector('#modPomo .mod-body');
    const today = doc.querySelector('#modToday .mod-body');
    const memo = doc.querySelector('#modMemo .mod-body');
    if (pomo && !pomo.childElementCount) {
      pomo.innerHTML =
        '  <div class="pomo-face"><div class="pomo-gauge" id="pomoGauge"></div>' +
        '    <div class="pomo-read"><span id="pomoMode">STANDBY · 待机</span><b id="pomoTime">25:00</b></div></div>' +
        '  <div class="pomo-row">' +
        '    <button class="btn sm primary" id="pomoStart" type="button">▶ 开始</button>' +
        '    <button class="btn sm" id="pomoReset" type="button">⟲ 重置</button>' +
        '    <label class="pomo-len"><span id="pomoLenLabel">25 分</span>' +
        '      <input type="range" id="pomoLen" min="5" max="90" step="5" value="25" title="番茄时长" /></label>' +
        '  </div>';
    }
    if (today && !today.childElementCount) {
      today.innerHTML = '<div class="today-body"><div class="today-ring" id="todayRing"></div>' +
        '<div class="today-figs" id="todayFigs"></div></div>';
    }
    if (memo && !memo.childElementCount) {
      memo.innerHTML = '<div class="memo-list" id="memoList"></div>' +
        '<div class="memo-compose"><textarea class="memo-input" id="memoInput" rows="1" spellcheck="false"' +
        ' placeholder="写一条，Enter 保存 · Shift+Enter 换行"></textarea></div>';
    }
    if (!pomo || !memo || pomo.dataset.bound || !memo.dataset) return;
    pomo.dataset.bound = '1';

    doc.getElementById('pomoStart').addEventListener('click', togglePomo);
    doc.getElementById('pomoReset').addEventListener('click', resetPomo);
    const len = doc.getElementById('pomoLen');
    len.addEventListener('input', () => {
      POMO.len = Math.max(5, Number(len.value) || 25) * 60000;
      doc.getElementById('pomoLenLabel').textContent = Math.round(POMO.len / 60000) + ' 分';
      if (!POMO.running && POMO.mode === 'focus') POMO.left = POMO.len;
      paintPomo();
    });
    const box = doc.getElementById('memoInput');
    box.addEventListener('focus', () => {
      /* the letter unfolds over the list inside this module — nothing outside it
         moves, which is what made the old version lurch */
      const p = box.closest('.mod');
      if (p) p.classList.add('composing');
    });
    box.addEventListener('blur', () => {
      const p = box.closest('.mod');
      if (p && !box.value.trim()) p.classList.remove('composing');
    });
    box.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        addMemo(box.value);
        box.value = '';
      } else if (ev.key === 'Escape') {
        box.value = '';
        box.blur();
        const p = box.closest('.mod');
        if (p) p.classList.remove('composing');
      }
    });
  }

  function memoList() {
    const m = S.state.settings.memo;
    return Array.isArray(m) ? m : [];
  }

  function saveMemo(list) {
    API.op({ type: 'settings:update', patch: { memo: list.slice(0, 80) } });
  }

  function addMemo(text) {
    const v = String(text || '').trim();
    if (!v) return;
    const box = doc.getElementById('memoInput');
    saveMemo([{ id: 'mm' + Date.now().toString(36), text: v.slice(0, 400), at: new Date().toISOString() }]
      .concat(memoList()));
    if (box) { box.value = ''; box.focus(); }
  }

  function renderMemo() {
    const host = doc.getElementById('memoList');
    if (!host) return;
    const items = memoList();
    host.innerHTML = '';
    if (!items.length) {
      const empty = doc.createElement('div');
      empty.className = 'memo-empty tiny faint';
      empty.textContent = '还没有备忘 · 在下面写一条';
      host.appendChild(empty);
    }
    items.forEach((m) => {
      const row = doc.createElement('div');
      row.className = 'memo-row';
      const txt = doc.createElement('span');
      txt.className = 'memo-text';
      txt.textContent = m.text;
      txt.title = m.text;
      const when = doc.createElement('i');
      when.className = 'memo-when';
      when.textContent = (m.at || '').slice(5, 10).replace('-', '/') +
        ' ' + clockOf(new Date(m.at).getTime());
      const del = doc.createElement('button');
      del.className = 'icon-btn memo-del';
      del.type = 'button';
      del.dataset.memodel = m.id;
      del.title = '删除这条备忘';
      del.textContent = '\u2715';
      row.appendChild(txt);
      row.appendChild(when);
      row.appendChild(del);
      host.appendChild(row);
    });
    const n = doc.getElementById('memoN');
    if (n) n.textContent = items.length + ' 条';
  }

  function pomoCount() {
    const st = S.state.settings;
    return st.pomoDate === D.dayKey(new Date()) ? (Number(st.pomoCount) || 0) : 0;
  }

  function togglePomo() {
    if (POMO.running) {
      POMO.running = false;
      POMO.left = Math.max(0, POMO.until - Date.now());
    } else {
      if (POMO.left <= 0) POMO.left = POMO.mode === 'focus' ? POMO.len : POMO_BREAK;
      POMO.running = true;
      POMO.until = Date.now() + POMO.left;
    }
    paintPomo();
  }

  function resetPomo() {
    POMO.running = false;
    POMO.left = POMO.mode === 'focus' ? POMO.len : POMO_BREAK;
    paintPomo();
  }

  function pomoFinished() {
    POMO.running = false;
    POMO.left = 0;
    if (POMO.mode === 'focus') {
      const n = pomoCount() + 1;
      API.op({ type: 'settings:update', patch: { pomoDate: D.dayKey(new Date()), pomoCount: n } });
      POMO.mode = 'break';
      POMO.left = POMO_BREAK;
      toast('一个番茄完成 · 休息 5 分钟 // POMODORO ' + n);
    } else {
      POMO.mode = 'focus';
      POMO.left = POMO.len;
      toast('休息结束 · 开始下一个番茄 // BACK TO IT');
    }
  }

  function paintPomo() {
    const time = doc.getElementById('pomoTime');
    if (!time) return;
    if (POMO.running) {
      POMO.left = POMO.until - Date.now();
      if (POMO.left <= 0) pomoFinished();
    }
    const left = Math.max(0, POMO.left);
    const total = POMO.mode === 'focus' ? POMO.len : POMO_BREAK;
    const secs = Math.ceil(left / 1000);
    time.textContent = pad2t(Math.floor(secs / 60)) + ':' + pad2t(secs % 60);
    /* the number carries the urgency: honey under five minutes, sage through the
       working stretch, vermillion beyond it */
    const col = pomoColour(left);
    time.style.color = col;
    const gauge = doc.getElementById('pomoGauge');
    if (gauge) {
      gauge.innerHTML = gaugeSvg(total ? left / total : 0, '0', Math.round(total / 60000));
      const arc = gauge.querySelector('.g-left');
      if (arc) arc.style.stroke = col;
    }
    const mode = doc.getElementById('pomoMode');
    if (mode) mode.textContent = (POMO.mode === 'focus' ? 'FOCUS · 专注' : 'BREAK · 休息') +
      (POMO.running ? '' : ' · 待机');
    const btn = doc.getElementById('pomoStart');
    if (btn) {
      btn.textContent = POMO.running ? '❙❙ 暂停' : '▶ 开始';
      btn.classList.toggle('primary', !POMO.running);
    }
    const cnt = doc.getElementById('pomoCount');
    if (cnt) cnt.textContent = '今日 ' + pomoCount() + ' 个';
    const face = doc.querySelector('.pomo-face');
    if (face) face.classList.toggle('on', POMO.running);
  }

  function renderDashMid() {
    ensureDashMid();
    paintPomo();

    /* today: what is done against what still owns the day */
    const todayKey = D.dayKey(new Date());
    let doneToday = 0, openToday = 0;
    S.state.todos.forEach((t) => {
      if (t.done) {
        if (t.completedAt && D.dayKey(new Date(t.completedAt)) === todayKey) doneToday++;
        return;
      }
      if (D.isOverdue(t)) openToday++;
      else if (t.dueAt && D.dayKey(D.parseDate(t.dueAt) || new Date()) === todayKey) openToday++;
    });
    const sum = doneToday + openToday;
    const frac = sum ? doneToday / sum : 0;
    const ring = doc.getElementById('todayRing');
    if (ring) {
      /* the band is its own masked layer; the number sits beside it, not inside it.
         Teal rather than the old forest: the print palette has no room for a fourth
         dark green. */
      const p = (frac * 100).toFixed(2);
      ring.innerHTML = '<i class="today-band" style="background-image: conic-gradient(' +
        'var(--teal) 0% ' + p + '%, var(--paper-dim) ' + p + '% 100%)"></i>' +
        '<b>' + Math.round(frac * 100) + '%</b><span>' + doneToday + '/' + sum + '</span>';
    }
    const figs = doc.getElementById('todayFigs');
    if (figs) {
      const spent = (S.state.timeEntries || []).reduce((a, e) => {
        const st = new Date(e.start).getTime();
        if (D.dayKey(new Date(st)) !== todayKey) return a;
        return a + (e.end ? (Number(e.ms) || 0) : Math.max(0, Date.now() - st));
      }, 0);
      figs.innerHTML =
        '<div><i>完成</i><b>' + doneToday + '</b></div>' +
        '<div><i>待办</i><b>' + openToday + '</b></div>' +
        '<div><i>番茄</i><b>' + pomoCount() + '</b></div>' +
        '<div><i>计时</i><b>' + hm(spent) + '</b></div>';
      const tt = doc.getElementById('todayTotal');
      if (tt) tt.textContent = '共 ' + sum + ' 项';
    }
    renderMemo();
  }

  /* "还有 2 天 13 时" / "逾期 4 天 20 时" — the countdown the dedicated panel used to
     own now rides along on the task rows that carry a date */
  function relDue(iso) {
    const d = D.parseDate(iso);
    if (!d) return '';
    const ms = d.getTime() - Date.now();
    const abs = Math.abs(ms);
    const day = Math.floor(abs / 86400000);
    const hr = Math.floor(abs % 86400000 / 3600000);
    const mi = Math.floor(abs % 3600000 / 60000);
    const txt = day > 0 ? day + ' 天' + (hr ? ' ' + hr + ' 时' : '')
      : (hr ? hr + ' 小时' : Math.max(1, mi) + ' 分钟');
    return { late: ms < 0, txt: (ms < 0 ? '逾期 ' : '还有 ') + txt };
  }

  function renderHeatmap() {
    /* the day / week / month readings are retired: the year grid is the only one
       left, so there is nothing to switch between */
    const data = D.heatmap(S.state, 'year', new Date().toISOString());
    el.heatLabel.textContent = data.label;
    /* year: 12 rows × 31 days, unlabelled squares */
    let html = '<div class="heat-rows heat-year">';
    data.months.forEach((row) => {
      html += '<div class="heat-row"><div class="hr-cells">';
      row.cells.forEach((c) => {
        html += '<div class="heat-cell l' + c.level + (c.isVoid ? ' future' : '') + '" title="' + c.key + ' · 完成 ' + c.count + '"></div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    el.heatBody.innerHTML = html + legend(data.total);
  }

  function legend(total) {
    return '<div class="heat-legend">' +
      '<span>少</span>' +
      '<i class="heat-cell" style="width:11px;height:11px"></i>' +
      '<i class="heat-cell l2" style="width:11px;height:11px"></i>' +
      '<i class="heat-cell l3" style="width:11px;height:11px"></i>' +
      '<i class="heat-cell l4" style="width:11px;height:11px"></i>' +
      '<span>多</span><span class="spacer"></span>' +
      '<span>区间完成 ' + total + ' 项</span></div>';
  }

  function renderMiniList() {
    const all = S.miniGroup === '__all__';
    const groupId = all ? null : (S.miniGroup || S.state.settings.activeGroupId);
    let list = S.state.todos.filter((t) => !t.done && (all || t.groupId === groupId));
    list = D.sortTodos(list, 'smart').slice(0, 30);
    el.miniList.innerHTML = '';
    if (!list.length) {
      const empty = doc.createElement('div');
      empty.className = 'empty';
      empty.style.margin = 'auto';
      empty.innerHTML = '<div class="big">EMPTY</div><div class="small">' + (all ? '还没有未完成任务' : '该分组暂无任务') + '</div>';
      el.miniList.appendChild(empty);
      return;
    }
    list.forEach((t) => {
      const row = doc.createElement('div');
      row.className = 'mini-row' + (t.done ? ' done' : '');
      row.dataset.id = t.id;
      const chk = doc.createElement('button');
      chk.className = 'chk';
      chk.title = '完成';
      chk.addEventListener('click', () => {
        API.op({ type: 'todo:toggle', id: t.id }).then((res) => {
          if (res && res.ok && res.spawned) toast('重复任务：已生成下一次 // NEXT OCCURRENCE');
          if (res && res.ok && res.removed) toast('已撤销生成的下一次 // UNDONE');
        });
      });
      const g = D.groupById(S.state, t.groupId);
      const dot = doc.createElement('i');
      dot.className = 'mini-dot';
      dot.style.background = D.PALETTE[(g && g.color) || 'brick'];
      dot.title = g ? g.name : '';
      const title = doc.createElement('div');
      title.className = 'mini-title';
      title.textContent = t.title;
      title.title = t.title;

      /* one line, and the same timer the ledger drives, so the elapsed time is the
         same number wherever it is read */
      const right = doc.createElement('div');
      right.className = 'mini-right';
      const spent = D.spentOf(t);
      if (spent > 0 || t.timerStartedAt) {
        const sp = doc.createElement('span');
        sp.className = 'mini-spent' + (t.timerStartedAt ? ' running' : '');
        sp.dataset.spent = t.id;
        sp.textContent = '\u23F1 ' + D.formatSpent(spent);
        right.appendChild(sp);
      }
      const timer = doc.createElement('button');
      timer.className = 'icon-btn mini-timer' + (t.timerStartedAt ? ' on' : '');
      timer.type = 'button';
      timer.title = t.timerStartedAt ? '暂停计时' : '开始计时';
      timer.textContent = t.timerStartedAt ? '\u23F8' : '\u25B6';
      timer.addEventListener('click', (ev) => {
        ev.stopPropagation();
        API.op({ type: 'todo:timer', id: t.id });
      });
      right.appendChild(timer);
      if (t.dueAt) {
        const due = doc.createElement('span');
        due.className = 'mini-due';
        const r = relDue(t.dueAt);
        const w = doc.createElement('b');
        w.textContent = D.formatDue(t.dueAt);
        due.appendChild(w);
        if (r) {
          const i = doc.createElement('i');
          i.textContent = r.txt;
          due.appendChild(i);
          if (r.late) due.classList.add('late');
        }
        right.appendChild(due);
      }

      row.appendChild(chk);
      row.appendChild(title);
      row.appendChild(dot);
      row.appendChild(right);
      row.addEventListener('dblclick', () => openTodoModal(t));
      el.miniList.appendChild(row);
    });
  }

  /* ------------------------------------------------- ledger search entry point */

  function showSearch(on, focus) {
    if (!el.searchRow) return;
    el.searchRow.classList.toggle('u-hidden', !on);
    if (el.btnSearch) el.btnSearch.classList.toggle('on', !!on || !!S.q.trim());
    if (on && focus && el.search) el.search.focus();
  }

  /* ------------------------------------------------- date grouping for task lists */

  function lunarOf(d) {
    const L = D.lunar;
    if (!L || !L.solarToLunar) return '';
    const l = L.solarToLunar(d);
    return l ? L.lunarName(l.month, l.day, l.isLeap) : '';
  }

  /* 今天 · 9月20日 · 周日 · 农历八月初十 */
  function dayHeadText(grp) {
    if (grp.kind === 'overdue') return '已逾期 OVERDUE';
    if (grp.kind === 'none') return '无日期 · 不在日程上 NO DATE';
    const d = D.parseDate(grp.key + 'T00:00:00');
    if (!d) return grp.key;
    const parts = [];
    if (grp.kind === 'today') parts.push('今天');
    else if (grp.kind === 'tomorrow') parts.push('明天');
    parts.push((d.getMonth() + 1) + '月' + d.getDate() + '日');
    parts.push('周' + D.WEEKDAY_CN[d.getDay()]);
    const lu = lunarOf(d);
    if (lu) parts.push('农历' + lu);
    return parts.join(' · ');
  }

  /* Overdue is one section, not one per stale day: five headers of days nobody caught
     in time pushes today's own list off the first screen. A done list reads newest
     first, which is the only order that makes sense for history. */
  function groupTodos(list) {
    const now = new Date();
    const todayKey = D.dayKey(now);
    const tomKey = D.dayKey(D.addDays(now, 1));
    const allDone = list.length > 0 && list.every((t) => t.done);
    const byDay = {};
    const overdue = [];
    const noDate = [];
    list.forEach((t) => {
      const src = allDone ? t.completedAt : t.dueAt;
      const d = D.parseDate(src);
      if (!d) { noDate.push(t); return; }
      if (!allDone && !t.done && D.isOverdue(t)) { overdue.push(t); return; }
      const k = D.dayKey(d);
      if (!byDay[k]) byDay[k] = [];
      byDay[k].push(t);
    });
    const keys = Object.keys(byDay).sort(allDone ? (a, b) => (a < b ? 1 : -1) : (a, b) => (a < b ? -1 : 1));
    const out = [];
    if (overdue.length) out.push({ kind: 'overdue', list: overdue });
    keys.forEach((k) => out.push({
      kind: k === todayKey ? 'today' : (k === tomKey ? 'tomorrow' : 'day'),
      key: k, list: byDay[k]
    }));
    if (noDate.length) out.push({ kind: 'none', list: noDate });
    return out;
  }

  /* ---------------------------------------------------------------- ledger */

  function renderList() {
    const list = visibleTodos();
    el.countLabel.textContent = String(list.length).padStart(3, '0') + ' ITEMS · ' + viewLabel();
    const special = S.view === 'timeline' || S.view === 'calendar' || S.view === 'tracking';
    if (el.viewPanel) el.viewPanel.classList.toggle('u-hidden', !special);
    const listWrap = el.list.closest('.list-wrap');
    if (listWrap) listWrap.classList.toggle('u-hidden', special);
    el.list.classList.toggle('u-hidden', special);
    /* the timeline and the month grid are for reading: the entry form and the search
       row above them only push the real content down */
    if (el.entryForm) el.entryForm.classList.toggle('u-hidden', special);
    if (el.toolbar) el.toolbar.classList.toggle('u-hidden', special);
    el.list.innerHTML = '';
    if (special) {
      if (S.view === 'timeline') renderTimeline(list);
      else if (S.view === 'tracking') renderTracking();
      else renderCalendar(list);
      return;
    }
    if (!list.length) {
      const empty = doc.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = '<div class="big">NO RECORDS</div><div class="small">台账为空 — 在上方登记，或用左侧一句话快速登记</div>';
      el.list.appendChild(empty);
      return;
    }
    groupTodos(list).forEach((grp) => {
      const head = doc.createElement('div');
      head.className = 'day-head' + (grp.kind === 'today' || grp.kind === 'overdue' ? ' ' + grp.kind : '');
      const label = doc.createElement('b');
      label.textContent = dayHeadText(grp);
      const count = doc.createElement('span');
      count.className = 'day-count';
      count.textContent = String(grp.list.length).padStart(2, '0');
      head.appendChild(label);
      head.appendChild(count);
      el.list.appendChild(head);
      grp.list.forEach((t, i) => el.list.appendChild(buildRow(t, i)));
    });
  }

  /* ------------------------------------------------- timeline + month view */

  const pad2 = (n) => (n < 10 ? '0' : '') + n;

  function dueTime(t) {
    const d = D.parseDate(t.dueAt);
    if (!d) return null;
    return { d: d, key: D.dayKey(d), hhmm: pad2(d.getHours()) + ':' + pad2(d.getMinutes()) };
  }

  function bucketLabel(key) {
    const today = D.dayKey(new Date());
    if (key === today) return '今天';
    if (key === D.dayKey(D.addDays(new Date(), 1))) return '明天';
    const d = D.parseDate(key);
    if (!d) return key;
    const cn = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + cn;
  }

  /* ---------------------------------------------------------------- tracking */

  const pad2t = (n) => (n < 10 ? '0' : '') + n;
  function hms(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    return pad2t(Math.floor(t / 3600)) + ':' + pad2t(Math.floor(t / 60) % 60) + ':' + pad2t(t % 60);
  }
  function hm(ms) {
    const t = Math.max(0, Math.floor(ms / 60000));
    return pad2t(Math.floor(t / 60)) + ':' + pad2t(t % 60);
  }
  function clockOf(ts) {
    const d = new Date(ts);
    return pad2t(d.getHours()) + ':' + pad2t(d.getMinutes());
  }
  /* the recent list is where a short run gets judged, and minute rounding made every
     sub-minute record read as 00:00 */
  function clockOfSec(ts) {
    const d = new Date(ts);
    return pad2t(d.getHours()) + ':' + pad2t(d.getMinutes()) + ':' + pad2t(d.getSeconds());
  }

  const TK_HOUR_PX = 42;          /* one hour of the day column */
  const TK_SNAP = 5 * 60000;      /* drag snaps to 5 minutes... */
  const TK_MIN = 15 * 60000;      /* ...but a run is never shorter than 15 */

  function tkDayStart(dayKey) { return new Date(dayKey + 'T00:00:00').getTime(); }

  function tkWeekDays(anchor) {
    const d = new Date(anchor);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const out = [];
    for (let i = 0; i < 7; i++) out.push(D.dayKey(D.addDays(monday, i)));
    return out;
  }

  /* The dial is a real 24-hour clock face: a run paints the arc of the day it
     actually took, so five minutes is a sliver and three hours is a quarter of the
     circle. Bucketing each hour and filling the whole sector made a few minutes read
     as an hour and a half of work. Sampled rather than per-run so overlapping runs
     still produce monotonic conic stops (the browser clamps a non-monotonic list and
     the whole gradient shifts round), then equal neighbours are merged back down. */
  function tkRing(state, dayKey, now) {
    const runs = D.entriesOn(state, dayKey, now);
    const base = tkDayStart(dayKey);
    const N = 144;                      /* ten minutes per sample */
    const owner = new Array(N).fill(null);
    runs.forEach((r) => {
      const t = D.todoById(state, r.entry.todoId);
      const g = t ? (D.groupById(state, t.groupId) || state.groups[0]) : null;
      const col = g ? (D.PALETTE[g.color] || D.PALETTE.brick) : 'var(--ink-3)';
      const i0 = Math.max(0, Math.floor((r.from - base) / 86400000 * N));
      const i1 = Math.min(N, Math.ceil((r.to - base) / 86400000 * N));
      for (let i = i0; i < i1; i++) owner[i] = col;
    });
    const stops = [];
    let i = 0;
    while (i < N) {
      let j = i + 1;
      while (j < N && owner[j] === owner[i]) j++;
      stops.push((owner[i] || 'transparent') + ' ' +
        (i / N * 100).toFixed(3) + '% ' + (j / N * 100).toFixed(3) + '%');
      i = j;
    }
    const total = runs.reduce((a, r) => a + r.ms, 0);
    const label = dayKey === D.dayKey(new Date()) ? '今天' : dayKey.slice(5).replace('-', '/');
    /* four marks, not five: 00 and 24 are the same angle on a 24-hour dial. The hole
       is a sibling of the ring, not a child — the mask that carves the band out of the
       gradient also cuts away everything the element itself paints, so the total in
       the middle was invisible. */
    return '<div class="tk-ring-wrap">' +
      '<div class="tk-ring" style="background-image: conic-gradient(' + stops.join(',') +
      '), conic-gradient(var(--paper-dim) 0 100%)"></div>' +
      '<div class="tk-ring-hole"><b>' + hm(total) + '</b><span>' + label + '</span></div>' +
      '<div class="tk-ring-hours"><span>00</span><span>06</span><span>12</span><span>18</span></div>' +
      '</div>';
  }

  /* Two runs over the same hour must both stay reachable: split the column into
     lanes the way a calendar does. Overlapping runs form a cluster, and only that
     cluster shares the width — a single overlap at 09:00 must not shave every other
     block in the day down to half size. A run joins the first lane in its cluster
     that has cleared before it starts. */
  function tkLanes(runs) {
    let laneEnd = [], cluster = [], groupEnd = 0;
    const flush = () => {
      const n = laneEnd.length || 1;
      cluster.forEach((r) => { r.lanes = n; });
      cluster = []; laneEnd = [];
    };
    runs.forEach((r) => {
      if (cluster.length && r.from >= groupEnd) flush();
      let i = -1;
      for (let k = 0; k < laneEnd.length; k++) { if (laneEnd[k] <= r.from) { i = k; break; } }
      if (i < 0) { i = laneEnd.length; laneEnd.push(0); }
      laneEnd[i] = r.to;
      r.lane = i;
      cluster.push(r);
      groupEnd = Math.max(groupEnd, r.to);
    });
    flush();
    return runs;
  }

  function renderTracking() {
    const now = Date.now();
    const today = D.dayKey(new Date());
    if (!S.tkDay) S.tkDay = today;
    if (!S.tkMode) S.tkMode = 'week';
    const days = S.tkMode === 'day' ? [S.tkDay] : tkWeekDays(S.tkDay);
    const open = D.openEntry(S.state);
    const runTodo = open ? D.todoById(S.state, open.todoId) : null;

    const wrap = doc.createElement('div');
    wrap.className = 'tkx';

    /* ---- the running strip stays on top: it is the one thing you touch most */
    const bar = doc.createElement('div');
    bar.className = 'tk-now hud-thin' + (open ? ' on' : '');
    const btn = doc.createElement('button');
    btn.className = 'btn sm ' + (open ? 'danger' : 'primary');
    btn.type = 'button';
    btn.dataset.act = open ? 'tkStop' : 'tkStart';
    btn.textContent = open ? '\u25A0 停止' : '\u25B6 开始';
    bar.appendChild(btn);
    const label = doc.createElement('span');
    label.className = 'tk-task';
    label.textContent = runTodo ? runTodo.title : (open ? '（任务已删除）' : '未在计时');
    bar.appendChild(label);
    if (!open) {
      const sel = doc.createElement('select');
      sel.className = 'select tk-pick';
      sel.id = 'tkPick';
      D.sortTodos(S.state.todos.filter((t) => !t.done), 'smart').forEach((t) => {
        const o = doc.createElement('option');
        o.value = t.id;
        o.textContent = t.title;
        sel.appendChild(o);
      });
      if (!sel.children.length) sel.disabled = true;
      bar.appendChild(sel);
    }
    const dur = doc.createElement('span');
    dur.className = 'tk-dur';
    dur.id = 'tkDur';
    dur.textContent = open ? hms(now - new Date(open.start).getTime()) : '00:00:00';
    bar.appendChild(dur);
    wrap.appendChild(bar);

    /* ---- layout: axes on the left, ring and figures on the right */
    const cols = doc.createElement('div');
    cols.className = 'tk-cols';
    wrap.appendChild(cols);

    const side = doc.createElement('div');
    side.className = 'tk-side hud';
    /* the ring follows the day under inspection, not the calendar date: in week mode
       that is the anchor day, and in day view the one column being shown */
    side.innerHTML =
      tkRing(S.state, S.tkDay, now) +
      '<div class="tk-sum" id="tkSum"></div>' +
      '<div class="tl-head muted"><span class="tl-date">最近记录</span>' +
      '<span class="tl-spacer"></span><span class="tl-count" id="tkRecN">0</span></div>' +
      '<div class="tk-recent" id="tkRecent"></div>';
    wrap.appendChild(side);

    /* header: navigation, week/day switch, and one label per column */
    const head = doc.createElement('div');
    head.className = 'tk-head';
    const gutter = doc.createElement('div');
    gutter.className = 'tk-gutter tk-head-gut';
    head.appendChild(gutter);
    const nav = doc.createElement('div');
    nav.className = 'tk-nav';
    nav.innerHTML =
      '<button class="btn tiny" data-tk="prev">\u2039</button>' +
      '<span class="tk-range">' + (S.tkMode === 'day'
        ? bucketLabel(S.tkDay)
        : days[0].slice(5) + ' ~ ' + days[6].slice(5)) + '</span>' +
      '<button class="btn tiny" data-tk="next">\u203A</button>' +
      '<button class="btn tiny" data-tk="today">今天</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn tiny' + (S.tkMode === 'week' ? ' primary' : '') + '" data-tk="week">周</button>' +
      '<button class="btn tiny' + (S.tkMode === 'day' ? ' primary' : '') + '" data-tk="day">日</button>';
    cols.appendChild(head);
    head.insertBefore(nav, head.firstChild);

    const body = doc.createElement('div');
    body.className = 'tk-body';
    cols.appendChild(body);

    const grid = doc.createElement('div');
    grid.className = 'tk-grid';
    grid.style.gridTemplateColumns = 'repeat(' + days.length + ', minmax(0, 1fr))';
    /* the day height belongs on the scroll content, not on the window that shows it */
    grid.style.height = (TK_HOUR_PX * 24) + 'px';
    body.appendChild(grid);

    /* hour lines and the time gutter are shared, so columns stay readable */
    const gut = doc.createElement('div');
    gut.className = 'tk-gutter';
    for (let h = 0; h < 24; h++) {
      const t = doc.createElement('i');
      t.className = 'tk-gut-h';
      t.style.top = (h * TK_HOUR_PX) + 'px';
      /* every hour gets its number now that a half-hour mark exists; the odd ones sit
         lighter so the two-hour rhythm still reads at a glance */
      t.textContent = pad2t(h) + ':00';
      if (h % 2) t.classList.add('odd');
      gut.appendChild(t);
      /* a half-hour tick: the scale has to say where the middle of an hour is, or a
         block snapped to 04:25 cannot be read off the axis at all */
      const hf = doc.createElement('i');
      hf.className = 'tk-gut-h half';
      hf.style.top = (h * TK_HOUR_PX + TK_HOUR_PX / 2) + 'px';
      gut.appendChild(hf);
    }
    body.insertBefore(gut, grid);
    gut.style.height = (TK_HOUR_PX * 24) + 'px';

    days.forEach((dk) => {
      const col = doc.createElement('div');
      col.className = 'tk-col' + (dk === today ? ' today' : '');
      col.dataset.day = dk;
      for (let h = 0; h < 24; h++) {
        const line = doc.createElement('i');
        line.className = 'tk-hline' + (h % 6 === 0 ? ' major' : '');
        line.style.top = (h * TK_HOUR_PX) + 'px';
        col.appendChild(line);
        /* a lighter rule at :30 in every column — the drag snaps to 5 minutes, and
           without a half-hour mark the axis cannot be read at all */
        const hl = doc.createElement('i');
        hl.className = 'tk-hline half';
        hl.style.top = (h * TK_HOUR_PX + TK_HOUR_PX / 2) + 'px';
        col.appendChild(hl);
      }

      tkLanes(D.entriesOn(S.state, dk, now)).forEach((r) => col.appendChild(tkBlock(r, dk)));

      if (dk === today) {
        const nl = doc.createElement('div');
        nl.className = 'tk-nowline';
        nl.id = 'tkNowline';
        nl.style.top = ((now - tkDayStart(dk)) / 3600000 * TK_HOUR_PX) + 'px';
        col.appendChild(nl);
      }
      grid.appendChild(col);
    });

    /* column captions sit above the scroll area so they stay visible */
    const cap = doc.createElement('div');
    cap.className = 'tk-caps';
    cap.style.gridTemplateColumns = 'repeat(' + days.length + ', minmax(0, 1fr))';
    days.forEach((dk) => {
      const t = doc.createElement('div');
      const d = new Date(tkDayStart(dk));
      const ms = D.entriesOn(S.state, dk, now).reduce((a, r) => a + r.ms, 0);
      t.className = 'tk-cap' + (dk === today ? ' today' : '');
      t.innerHTML = '<span><b>' + '日一二三四五六'[d.getDay()] + '</b> ' +
        pad2t(d.getMonth() + 1) + '/' + pad2t(d.getDate()) + '</span>' +
        '<i>' + (ms ? hm(ms) : '') + '</i>';
      cap.appendChild(t);
    });
    head.appendChild(cap);

    bindTracking(wrap, body, days, grid);
    el.viewPanel.innerHTML = '';
    el.viewPanel.appendChild(wrap);
    /* Size the block from the panel it is actually in. A fixed height left a strip of
       empty panel under the axis when the window was maximised and cut the working
       area short when it was small; measuring from the element's own top follows the
       title bar, the running strip and the header without hard-coding their heights. */
    if (tkFit) window.removeEventListener('resize', tkFit);
    tkFit = () => {
      const top = Math.max(0, wrap.getBoundingClientRect().top);
      wrap.style.height = Math.max(320, window.innerHeight - top - 30) + 'px';
    };
    window.addEventListener('resize', tkFit);
    tkFit();
    /* A day is 1008px of axis inside a window that shows part of it, and it opens on
       midnight — never where the user is. Land on the running hour the first time,
       then keep whatever position they scrolled to: a re-render that snaps back to
       "now" moves the view under the hand mid-drag. */
    if (S.tkScroll === null) {
      const anchor = days.indexOf(today) >= 0 ? (now - tkDayStart(today)) : 0;
      S.tkScroll = Math.max(0, anchor / 3600000 * TK_HOUR_PX - 130);
    }
    body.scrollTop = S.tkScroll;
    body.addEventListener('scroll', () => { S.tkScroll = body.scrollTop; });
    renderTrackingFigures(now);
  }

  /* Text on a group-coloured fill. The palette is mostly deep print colours, so the
     light ink is the common case, but honey and cream would swallow dark type. */
  function inkOn(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length < 6) return 'var(--paper)';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (!(isFinite(r) && isFinite(g) && isFinite(b))) return 'var(--paper)';
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? 'var(--ink)' : 'var(--paper)';
  }

  /* one run on the axis */
  function tkBlock(r, dayKey) {
    const t = D.todoById(S.state, r.entry.todoId);
    const g = t ? (D.groupById(S.state, t.groupId) || S.state.groups[0]) : null;
    const base = tkDayStart(dayKey);
    const b = doc.createElement('div');
    const hpx = (r.to - r.from) / 3600000 * TK_HOUR_PX - 1;
    b.className = 'tk-blk' + (r.entry.end ? '' : ' open') + (t && t.done ? ' done' : '');
    b.dataset.entry = r.entry.id;
    b.dataset.todo = r.entry.todoId;
    b.style.top = ((r.from - base) / 3600000 * TK_HOUR_PX) + 'px';
    b.style.height = Math.max(14, hpx) + 'px';
    /* the whole block wears its group's colour, so a week of columns reads as one
       glanceable picture of where the hours went */
    const fill = g ? (D.PALETTE[g.color] || D.PALETTE.brick) : 'var(--paper-dim)';
    b.style.background = fill;
    b.style.color = inkOn(fill);
    b.style.borderColor = inkOn(fill) === 'var(--paper)'
      ? 'color-mix(in srgb, ' + fill + ' 60%, #000)'
      : 'color-mix(in srgb, ' + fill + ' 70%, #000)';
    /* width follows the overlap cluster this run was placed in (tkLanes) */
    const lanes = r.lanes || 1;
    if (lanes > 1) {
      const w = 100 / lanes;
      b.style.left = (w * (r.lane || 0)) + '%';
      b.style.width = 'calc(' + w + '% - 3px)';
    }
    /* a block too short for its own close button is a block you cannot delete from
       the axis, so the affordance only appears once there is room for it */
    b.innerHTML = '<span class="tk-blk-t">' + clockOf(r.entry.start) + '</span>' +
      '<span class="tk-blk-n"></span>' +
      (hpx >= 20 ? '<button class="tk-x" data-tkdel="' + r.entry.id + '" title="删除这条记录">\u2715</button>' : '') +
      '<i class="tk-grip" data-resize="1"></i>';
    b.querySelector('.tk-blk-n').textContent = t ? t.title : '（已删除）';
    b.title = (t ? t.title : '（已删除）') + ' · ' + clockOf(r.entry.start) + '–' +
      (r.entry.end ? clockOf(r.entry.end) : '进行中') + ' · ' + hm(r.ms) + '\n拖动移动，拉下缘改时长';
    return b;
  }

  /* totals and the recent list, refreshed on their own so a tick does not rebuild
     the whole view out from under an in-progress drag */
  function renderTrackingFigures(now) {
    const ref = now || Date.now();
    const today = D.dayKey(new Date());
    const sum = doc.getElementById('tkSum');
    if (sum) {
      const t0 = tkDayStart(today);
      const weekStart = t0 - ((new Date().getDay() + 6) % 7) * 86400000;
      let dayMs = 0, weekMs = 0, allMs = 0;
      (S.state.timeEntries || []).forEach((e) => {
        const st = new Date(e.start).getTime();
        const live = e.end ? 0 : Math.max(0, ref - st);
        const m = Math.max(0, Number(e.ms) || 0) + live;
        allMs += m;
        if (st >= weekStart) weekMs += m;
        if (st >= t0) dayMs += m;
      });
      sum.innerHTML = '<span>今天 <b>' + hm(dayMs) + '</b></span>' +
        '<span>本周 <b>' + hm(weekMs) + '</b></span>' +
        '<span>累计 <b>' + hm(allMs) + '</b></span>';
    }
    const rec = doc.getElementById('tkRecent');
    const recN = doc.getElementById('tkRecN');
    if (rec) {
      const all = S.state.timeEntries || [];
      const list = all.slice().reverse().slice(0, 20);
      /* the header counts the records there are, not the 20 rows shown below it */
      if (recN) recN.textContent = String(all.length);
      rec.innerHTML = '';
      list.forEach((e) => {
        const t = D.todoById(S.state, e.todoId);
        const row = doc.createElement('div');
        row.className = 'tk-entry' + (e.end ? '' : ' open');
        const ms = e.end ? e.ms : Math.max(0, ref - new Date(e.start).getTime());
        /* the day has to come from the same local clock as the time beside it:
           slicing the ISO string reads the UTC date, so a run after 08:00 local
           could be labelled the day before its own clock time */
        row.innerHTML =
          '<span class="tk-e-time">' +
          D.dayKey(new Date(e.start)).slice(5).replace('-', '/') + ' ' + clockOfSec(e.start) + '</span>' +
          '<span class="tk-e-name"></span>' +
          '<span class="tk-e-ms"' + (e.end ? '' : ' data-live-ms="' + e.start + '"') + '>' + hms(ms) + '</span>' +
          '<button class="icon-btn" data-tkdel="' + e.id + '" title="删除这条记录">\u2715</button>';
        row.querySelector('.tk-e-name').textContent = t ? t.title : '（已删除）';
        rec.appendChild(row);
      });
    }
  }

  /* ---- interaction: drag out a range, drag a block to move or resize it ---- */

  function bindTracking(wrap, body, days, grid) {
    const draft = doc.createElement('div');
    draft.className = 'tk-draft u-hidden';
    /* offsetLeft/offsetWidth of a column are relative to the grid, so the ghost has to
       live in the grid too or it lands in the wrong place */
    grid.appendChild(draft);
    let pop = null;
    /* A drag has to swallow the click that follows its own pointerup. The .dragging
       class cannot carry that signal: it is removed in the pointerup handler, which
       runs before the click is dispatched, so a guard on it never fires and every
       drag of a block also opened the task editor. */
    let justDragged = false;

    function closePop() {
      if (!pop) return;
      if (pop._away) pop._away();
      if (pop.parentNode) pop.parentNode.removeChild(pop);
      pop = null;
    }

    function snap(ts) { return Math.round(ts / TK_SNAP) * TK_SNAP; }

    function yToTime(col, clientY) {
      const r = col.getBoundingClientRect();
      const px = Math.max(0, Math.min(TK_HOUR_PX * 24, clientY - r.top));
      return tkDayStart(col.dataset.day) + Math.round(px / TK_HOUR_PX * 3600000);
    }

    function openAssign(col, from, to) {
      closePop();
      const t0 = new Date(from);
      pop = doc.createElement('div');
      pop.className = 'tk-pop hud';
      pop.innerHTML =
        '<div class="tk-pop-h">' + pad2t(t0.getHours()) + ':' + pad2t(t0.getMinutes()) +
        ' – ' + clockOf(to) + ' · ' + hm(to - from) + '</div>' +
        '<select class="select" data-tk="pick"></select>' +
        '<div class="tk-pop-row">' +
        '  <input class="input" data-tk="new" placeholder="或输入新任务名" />' +
        '  <button class="btn sm primary" data-tk="go">确定</button>' +
        '</div>';
      const sel = pop.querySelector('[data-tk="pick"]');
      /* A blank first entry, not the head of the task list: pre-selecting a task means
         a stray 确定 schedules the wrong one. */
      const ph = doc.createElement('option');
      ph.value = '';
      ph.textContent = '选择已有任务…';
      sel.appendChild(ph);
      D.sortTodos(S.state.todos.filter((x) => !x.done), 'smart').forEach((x) => {
        const o = doc.createElement('option');
        o.value = x.id;
        o.textContent = x.title;
        sel.appendChild(o);
      });
      const colRect = col.getBoundingClientRect();
      const hostRect = wrap.getBoundingClientRect();
      const hostH = hostRect.height || 520;
      pop.style.left = Math.max(4, Math.min(hostRect.width - 250, colRect.left - hostRect.left)) + 'px';
      /* colRect is already screen-relative, so the scroller's own offset must not be
         added to it — that pushed the popover down by however far you had scrolled.
         Clamp inside the visible box, not inside the 1008px content height. */
      pop.style.top = Math.max(4, Math.min(hostH - 140,
        colRect.top - hostRect.top - 34 +
        (from - tkDayStart(col.dataset.day)) / 3600000 * TK_HOUR_PX)) + 'px';
      wrap.appendChild(pop);

      const go = () => {
        const name = (pop.querySelector('[data-tk="new"]').value || '').trim();
        const done = (todoId) => {
          API.op({ type: 'timer:add', id: todoId, start: new Date(from).toISOString(), end: new Date(to).toISOString() })
            .then((res) => {
              if (res && res.ok) toast('已排入时间轴 // SCHEDULED ' + hm(to - from));
              else toast('排程失败 // ' + ((res && res.error) || 'error'), 'warn');
            });
          closePop();
        };
        if (name) {
          API.op({ type: 'todo:add', title: name, groupId: S.state.settings.activeGroupId, dueAt: new Date(from).toISOString() })
            .then((res) => {
              if (!res || !res.ok || !res.id) { toast('新建失败', 'warn'); return; }
              done(res.id);
            });
          return;
        }
        if (!sel.value) { toast('选一个任务或写个名字', 'warn'); return; }
        done(sel.value);
      };
      pop.querySelector('[data-tk="go"]').addEventListener('click', go);
      pop.querySelector('[data-tk="new"]').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') go();
        if (ev.key === 'Escape') closePop();
      });
      pop.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      /* the popover has to be dismissible without a second drag: pointerdown anywhere
         else on the axis already closes it, this covers the rest of the panel */
      const away = (ev2) => { if (pop && !pop.contains(ev2.target)) closePop(); };
      doc.addEventListener('pointerdown', away, true);
      pop._away = () => doc.removeEventListener('pointerdown', away, true);
      pop.querySelector('[data-tk="new"]').focus();
    }

    /* drag on empty axis = lay down a range */
    body.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest('.tk-blk') || ev.target.closest('.tk-pop')) return;
      const col = ev.target.closest('.tk-col');
      if (!col) return;
      closePop();
      const start = snap(yToTime(col, ev.clientY));
      let cur = start;
      draft.classList.remove('u-hidden');
      const paint = () => {
        const a = Math.min(start, cur), b = Math.max(start, cur);
        const base = tkDayStart(col.dataset.day);
        draft.style.left = col.offsetLeft + 'px';
        draft.style.width = col.offsetWidth + 'px';
        draft.style.top = ((a - base) / 3600000 * TK_HOUR_PX) + 'px';
        draft.style.height = Math.max(TK_MIN / 3600000 * TK_HOUR_PX, (b - a) / 3600000 * TK_HOUR_PX) + 'px';
        /* read the range out while it is being drawn — snapping to 5 minutes is
           useless if the ghost does not say what it snapped to */
        draft.textContent = clockOf(a) + ' – ' + clockOf(a + Math.max(TK_MIN, b - a)) +
          ' · ' + hm(Math.max(TK_MIN, b - a));
      };
      paint();
      const move = (e2) => { cur = snap(yToTime(col, e2.clientY)); paint(); };
      const up = (e2) => {
        doc.removeEventListener('pointermove', move);
        doc.removeEventListener('pointerup', up);
        draft.classList.add('u-hidden');
        let a = Math.min(start, cur), b = Math.max(start, cur);
        if (b - a < TK_MIN) b = a + TK_MIN;
        openAssign(col, a, b);
      };
      doc.addEventListener('pointermove', move);
      doc.addEventListener('pointerup', up);
      ev.preventDefault();
    });

    /* drag a block = move it; drag its lower edge = change its length */
    body.addEventListener('pointerdown', (ev) => {
      const blk = ev.target.closest('.tk-blk');
      if (!blk || ev.button !== 0) return;
      /* the close button inside a block must not start a drag under the click */
      if (ev.target.closest('[data-tkdel]')) return;
      const col = blk.closest('.tk-col');
      if (!col) return;
      const resize = !!ev.target.closest('[data-resize]');
      const id = blk.dataset.entry;
      let e = null;
      (S.state.timeEntries || []).forEach((x) => { if (x.id === id) e = x; });
      if (!e || !e.end) return;
      justDragged = false;
      closePop();
      const base = tkDayStart(col.dataset.day);
      const grab = yToTime(col, ev.clientY) - new Date(e.start).getTime();
      const durMs = new Date(e.end).getTime() - new Date(e.start).getTime();
      blk.classList.add('dragging');
      const y0 = ev.clientY;
      const move = (e2) => {
        /* a 1-2 px jitter on an otherwise still press is a click, not a drag */
        if (Math.abs(e2.clientY - y0) > 3) justDragged = true;
        const t = snap(yToTime(col, e2.clientY) - (resize ? 0 : grab));
        if (resize) {
          const end = Math.max(new Date(e.start).getTime() + TK_MIN, t);
          blk.style.height = Math.max(14, (end - new Date(e.start).getTime()) / 3600000 * TK_HOUR_PX - 1) + 'px';
        } else {
          const top = Math.max(0, Math.min(TK_HOUR_PX * 24 - durMs / 3600000 * TK_HOUR_PX, (t - base) / 3600000 * TK_HOUR_PX));
          blk.style.top = top + 'px';
        }
      };
      const up = () => {
        doc.removeEventListener('pointermove', move);
        doc.removeEventListener('pointerup', up);
        blk.classList.remove('dragging');
        const topMs = parseFloat(blk.style.top) / TK_HOUR_PX * 3600000;
        const start = base + Math.round(topMs / TK_SNAP) * TK_SNAP;
        const end = resize
          ? Math.max(start + TK_MIN, base + parseFloat(blk.style.height) / TK_HOUR_PX * 3600000 + topMs)
          : start + durMs;
        API.op({ type: 'timer:update', entryId: id, start: new Date(start).toISOString(), end: new Date(end).toISOString() })
          .then((res) => { if (!res || !res.ok) toast('调整未保存 // ' + ((res && res.error) || 'error'), 'warn'); });
      };
      doc.addEventListener('pointermove', move);
      doc.addEventListener('pointerup', up);
      ev.preventDefault();
      ev.stopPropagation();
    });

    /* click a block without dragging it = open that task */
    body.addEventListener('click', (ev) => {
      const blk = ev.target.closest('.tk-blk');
      if (!blk) return;
      if (justDragged) { justDragged = false; return; }
      if (ev.target.closest('[data-tkdel]')) return;
      const t = D.todoById(S.state, blk.dataset.todo);
      if (t) openTodoModal(t);
    });

    wrap.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tk]');
      if (b) {
        const a = b.dataset.tk;
        const step = S.tkMode === 'day' ? 1 : 7;
        if (a === 'prev') S.tkDay = D.dayKey(D.addDays(new Date(tkDayStart(S.tkDay)), -step));
        else if (a === 'next') S.tkDay = D.dayKey(D.addDays(new Date(tkDayStart(S.tkDay)), step));
        else if (a === 'today') S.tkDay = D.dayKey(new Date());
        else if (a === 'week' || a === 'day') S.tkMode = a;
        else return;
        renderAll();
        return;
      }
      const del = ev.target.closest('[data-tkdel]');
      if (del) {
        API.op({ type: 'timer:delete', id: del.dataset.tkdel })
          .then((res) => { if (res && res.ok) toast('已删除记录'); });
      }
    });
  }

  function renderTimeline(list) {
    const now = new Date();
    const buckets = [];
    const byKey = {};
    const keyOf = (t) => {
      const due = dueTime(t);
      if (!due) return '__none';
      if (due.d < D.startOfDay(now)) return '__overdue';
      return due.key;
    };
    list.forEach((t) => {
      const k = keyOf(t);
      if (!byKey[k]) { byKey[k] = []; buckets.push(k); }
      byKey[k].push(t);
    });
    const order = (k) => (k === '__overdue' ? -2 : (k === '__none' ? 'z' : k));
    buckets.sort((a, b) => {
      const oa = order(a); const ob = order(b);
      return oa === ob ? 0 : (oa < ob ? -1 : 1);
    });

    const wrap = doc.createElement('div');
    wrap.className = 'tl';
    buckets.forEach((k) => {
      const head = doc.createElement('div');
      head.className = 'tl-head' + (k === '__overdue' ? ' bad' : '') + (k === '__none' ? ' muted' : '');
      const label = k === '__overdue' ? '已逾期' : (k === '__none' ? '无日期' : bucketLabel(k));
      head.innerHTML = '<span class="tl-date">' + label + '</span>' +
        (k.charAt(0) !== '_' ? '<span class="tl-dow">' + k + '</span>' : '') +
        '<span class="tl-spacer"></span><span class="tl-count">' + byKey[k].length + '</span>';
      wrap.appendChild(head);
      byKey[k].forEach((t, i) => {
        const row = buildRow(t, i);
        const due = dueTime(t);
        const time = doc.createElement('span');
        time.className = 'tl-time';
        time.textContent = due ? due.hhmm : '--:--';
        row.insertBefore(time, row.children[1] || null);
        wrap.appendChild(row);
      });
    });
    el.viewPanel.innerHTML = '';
    el.viewPanel.appendChild(wrap);
  }

  function renderCalendar(list) {
    const today = new Date();
    if (!S.calMonth) S.calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (!S.calDay) S.calDay = D.dayKey(today);
    const month = S.calMonth;
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = D.addDays(first, -((first.getDay() + 6) % 7));   /* Monday first */
    const byDay = {};
    list.forEach((t) => {
      const due = dueTime(t);
      if (!due) return;
      (byDay[due.key] = byDay[due.key] || []).push(t);
    });

    const head = doc.createElement('div');
    head.className = 'cal-head-row';
    head.innerHTML =
      '<button class="btn tiny" data-cal="prev">‹</button>' +
      '<span class="cal-title">' + month.getFullYear() + ' 年 ' + (month.getMonth() + 1) + ' 月</span>' +
      '<button class="btn tiny" data-cal="next">›</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn tiny" data-cal="today">今天</button>';

    const dow = doc.createElement('div');
    dow.className = 'cal-dow-row';
    dow.innerHTML = ['一', '二', '三', '四', '五', '六', '日'].map((d) => '<span>' + d + '</span>').join('');

    const grid = doc.createElement('div');
    grid.className = 'cal-month';
    for (let i = 0; i < 42; i++) {
      const day = D.addDays(start, i);
      const key = D.dayKey(day);
      const items = byDay[key] || [];
      const cell = doc.createElement('div');
      cell.className = 'cal-cell' +
        (day.getMonth() !== month.getMonth() ? ' out' : '') +
        (key === D.dayKey(today) ? ' today' : '') +
        (key === S.calDay ? ' sel' : '');
      cell.dataset.day = key;
      cell.innerHTML = '<span class="cal-daynum">' + day.getDate() + '</span>';
      items.slice(0, 3).forEach((t) => {
        const g = D.groupById(S.state, t.groupId) || S.state.groups[0];
        const chip = doc.createElement('button');
        chip.className = 'cal-chip' + (t.done ? ' done' : '');
        chip.dataset.open = t.id;
        chip.title = t.title;
        chip.innerHTML = '<i style="background:' + (D.PALETTE[g.color] || D.PALETTE.brick) + '"></i>';
        chip.appendChild(doc.createTextNode(t.title));
        cell.appendChild(chip);
      });
      if (items.length > 3) {
        const more = doc.createElement('span');
        more.className = 'cal-more';
        more.textContent = '+' + (items.length - 3);
        cell.appendChild(more);
      }
      grid.appendChild(cell);
    }

    const dayList = doc.createElement('div');
    dayList.className = 'cal-day-list';
    const selItems = (byDay[S.calDay] || []);
    const dayHead = doc.createElement('div');
    dayHead.className = 'tl-head';
    dayHead.innerHTML = '<span class="tl-date">' + bucketLabel(S.calDay) + '</span>' +
      '<span class="tl-spacer"></span><span class="tl-count">' + selItems.length + '</span>';
    dayList.appendChild(dayHead);
    selItems.forEach((t, i) => dayList.appendChild(buildRow(t, i)));

    el.viewPanel.innerHTML = '';
    el.viewPanel.appendChild(head);
    el.viewPanel.appendChild(dow);
    el.viewPanel.appendChild(grid);
    el.viewPanel.appendChild(dayList);
  }

  function shiftCalMonth(delta) {
    const m = S.calMonth || new Date();
    S.calMonth = new Date(m.getFullYear(), m.getMonth() + delta, 1);
    renderAll();
  }

  /* Priority is the colour of the title, not a word: vermillion at the hot end, down
     through ochre and khaki to plain ink for the ordinary case. */
  const PRIO_INK = { high: 'var(--vermillion)', med: 'var(--ochre)', low: 'var(--khaki)', none: '' };

  function buildRow(t, index) {
    const g = D.groupById(S.state, t.groupId) || S.state.groups[0];
    const accent = D.PALETTE[g.color] || D.PALETTE.brick;
    const row = doc.createElement('article');
    row.className = 'task' + (t.done ? ' done' : '');
    row.dataset.id = t.id;

    const chk = doc.createElement('button');
    chk.className = 'chk' + (t.done ? ' on' : '');
    chk.dataset.act = 'toggle';
    chk.title = '完成 / 取消完成';

    const main = doc.createElement('div');
    main.className = 'task-main';
    const line = doc.createElement('div');
    line.className = 'task-line';

    const title = doc.createElement('div');
    title.className = 'task-title';
    title.textContent = t.title;
    title.title = '双击编辑 · 单击展开备注';
    if (PRIO_INK[t.priority]) title.style.color = PRIO_INK[t.priority];
    line.appendChild(title);

    /* the group is a dot in its own colour — the name is already on the sidebar and
       a text badge on every row was competing with the title */
    const right = doc.createElement('span');
    right.className = 'task-right';
    const dot = doc.createElement('i');
    dot.className = 'task-dot';
    dot.style.background = accent;
    dot.title = g.name;
    right.appendChild(dot);

    const flags = doc.createElement('span');
    flags.className = 'task-flags';
    const repText = D.repeatText(t);
    /* the toggle itself only shows on hover, so its state has to be readable without
       one — otherwise a card that is out on the desk looks like every other row */
    const deployed = !!(S.state.placements[t.id] || {}).pinned;
    if (deployed) flags.appendChild(span('flag pinned', '\u2593 已钉在桌面'));
    if (repText) flags.appendChild(span('flag', '\u21BB ' + repText));
    if (t.spawnedFrom) flags.appendChild(span('flag', '\u21BB 下一次'));
    if (t.tags && t.tags.length) flags.appendChild(span('flag', t.tags.join(' · ')));
    const spent = D.spentOf(t);
    if (spent > 0 || t.timerStartedAt) {
      const tm = span('flag timer' + (t.timerStartedAt ? ' running' : ''), '\u23F1 ' + D.formatSpent(spent));
      tm.dataset.spent = t.id;
      flags.appendChild(tm);
    }
    if (flags.childElementCount) right.appendChild(flags);
    line.appendChild(right);
    main.appendChild(line);

    if (t.notes) {
      const notes = doc.createElement('div');
      notes.className = 'task-notes u-hidden';
      notes.textContent = t.notes;
      main.appendChild(notes);
    }

    /* the schedule on the right edge, with the countdown beside it on the same line */
    const dueCol = doc.createElement('div');
    dueCol.className = 'task-due';
    const when = t.done ? (t.completedAt || t.dueAt) : t.dueAt;
    if (when) {
      const w = doc.createElement('b');
      w.textContent = D.formatDue(when);
      if (D.isOverdue(t)) w.classList.add('late');
      else if (D.isToday(t)) w.classList.add('today');
      dueCol.appendChild(w);
      const r = relDue(when);
      if (r && !t.done) {
        const i = doc.createElement('i');
        i.textContent = r.txt;
        if (r.late) dueCol.classList.add('late');
        dueCol.appendChild(i);
      } else if (t.done) {
        const i = doc.createElement('i');
        i.textContent = '已完成';
        dueCol.appendChild(i);
      }
    }

    const actions = doc.createElement('div');
    actions.className = 'task-actions';
    const ticking = !!t.timerStartedAt;
    const timerBtn = iconBtn('timer', ticking ? '\u23F8' : '\u25B6', ticking ? '暂停计时' : '开始计时');
    if (ticking) timerBtn.classList.add('on');
    actions.appendChild(timerBtn);
    actions.appendChild(iconBtn('edit', '\u270E', '编辑'));
    actions.appendChild(iconBtn('pin', deployed ? '\u25C0' : '\u25B8',
      deployed ? '收回桌面卡片 // RECALL' : '钉在桌面卡片层 // PIN TO DESK'));
    if (deployed) actions.querySelector('[data-act="pin"]').classList.add('on');
    actions.appendChild(iconBtn('delete', '\u2715', '删除', 'danger'));

    /* the buttons belong to the title, not to the right edge: parked after the
       schedule they fought the countdown for the same few pixels */
    line.insertBefore(actions, right);
    row.appendChild(chk);
    row.appendChild(main);
    row.appendChild(dueCol);
    return row;
  }

  function span(cls, text) {
    const s = doc.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }

  function iconBtn(act, glyph, title, extra) {
    const b = doc.createElement('button');
    b.className = 'icon-btn' + (extra ? ' ' + extra : '');
    b.dataset.act = act;
    b.title = title;
    b.textContent = glyph;
    return b;
  }

  /* ---------------------------------------------------------------- quick add (natural language) */

  function bindQuickAdd() {
    if (!el.qaInput) return;
    el.qaInput.addEventListener('input', updateQuickPreview);
    el.qaInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); quickAddSubmit(); }
    });
    el.qaBtn.addEventListener('click', quickAddSubmit);
  }

  function parseQuick(text) {
    if (!window.NeonNLP) return null;
    return window.NeonNLP.parse(text, { groups: S.state.groups, now: new Date() });
  }

  function updateQuickPreview() {
    const text = el.qaInput.value.trim();
    if (!text) {
      el.qaPreview.className = 'qa-preview tiny';
      el.qaPreview.textContent = '用一句话登记：明天五点吃火锅 -日常';
      return;
    }
    const parsed = parseQuick(text);
    if (!parsed) return;
    const group = parsed.groupId ? D.groupById(S.state, parsed.groupId) : D.groupById(S.state, D.TEMP_GROUP_ID);
    const desc = window.NeonNLP.describe(parsed);
    el.qaPreview.className = 'qa-preview tiny' + (parsed.warning ? ' warn' : ' ok');
    el.qaPreview.textContent = '→ ' + (group ? group.name : '临时') + (desc ? ' · ' + desc : ' · 无日期') +
      (parsed.warning ? ' · ' + parsed.warning : '');
  }

  function quickAddSubmit() {
    const text = el.qaInput.value.trim();
    if (!text) { el.qaInput.focus(); return; }
    const parsed = parseQuick(text);
    if (!parsed) return;
    const groupId = parsed.groupId || D.TEMP_GROUP_ID;
    API.op({
      type: 'todo:add',
      title: parsed.title,
      groupId: groupId,
      dueAt: parsed.dueAt,
      repeat: parsed.repeat,
      lunar: parsed.lunar,
      activate: false
    }).then((res) => {
      if (!res || !res.ok) { toast('登记失败：' + ((res && res.error) || 'unknown'), 'bad'); return; }
      const g = D.groupById(S.state, groupId);
      toast('已登记到 ' + (g ? g.name : '临时') + (parsed.dueAt ? ' · ' + D.formatDue(parsed.dueAt) : ''));
      el.qaInput.value = '';
      updateQuickPreview();
    });
  }

  /* ---------------------------------------------------------------- composer */

  function bindComposerPlan() {
    planApi = window.NeonPlan.mount(el.planHost, {
      dueAt: null, repeat: 'none', lunar: null,
      onChange: (v) => {
        el.planBtn.textContent = window.NeonPlan.planText(v.dueAt, v.repeat, v.lunar);
        el.planBtn.classList.toggle('primary', !!v.dueAt);
      }
    });
    el.planBtn.textContent = '无计划';

    /* the popover lives on <body> so the composer's chamfer clip-path cannot crop it */
    const pop = el.planPop;
    pop.classList.add('plan-pop-fixed');
    doc.body.appendChild(pop);
    const placePop = () => {
      const r = el.planBtn.getBoundingClientRect();
      const w = Math.min(330, Math.max(260, window.innerWidth - 24));
      pop.style.width = w + 'px';
      const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
      const above = r.top > pop.offsetHeight + 16;
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(above ? (r.top - pop.offsetHeight - 4) : (r.bottom + 4)) + 'px';
    };
    const openPop = () => {
      pop.classList.remove('u-hidden');
      placePop();
    };
    const closePop = () => pop.classList.add('u-hidden');

    el.planBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      el.composerExtra.classList.add('open');
      if (pop.classList.contains('u-hidden')) openPop(); else closePop();
    });
    el.newTitle.addEventListener('focus', () => {
      el.composerExtra.classList.add('open');
    });
    el.newAdd.addEventListener('click', addFromComposer);
    el.newTitle.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); addFromComposer(); }
    });
    document.addEventListener('click', (ev) => {
      const inPlan = ev.target.closest('.plan-anchor') || ev.target.closest('.plan-pop');
      if (!inPlan) closePop();
      /* keep the composer open while the plan popover is in use */
      if (!ev.target.closest('.composer') && !ev.target.closest('.plan-pop')) collapseComposer();
    });
    window.addEventListener('resize', () => { if (!pop.classList.contains('u-hidden')) placePop(); });
    window.addEventListener('scroll', () => { if (!pop.classList.contains('u-hidden')) placePop(); }, true);
  }

  function collapseComposer() {
    el.composerExtra.classList.remove('open');
    el.planPop.classList.add('u-hidden');
  }

  function addFromComposer() {
    const title = el.newTitle.value.trim();
    if (!title) { el.newTitle.focus(); toast('请输入任务内容', 'warn'); return; }
    const plan = planApi ? planApi.get() : { dueAt: null, repeat: 'none', lunar: null, repeatUntil: null, repeatCount: null };
    API.op({
      type: 'todo:add',
      title: title,
      groupId: el.newGroup.value,
      dueAt: plan.dueAt,
      repeat: plan.repeat,
      repeatUntil: plan.repeatUntil,
      repeatCount: plan.repeatCount,
      lunar: plan.lunar,
      priority: el.newPrio.value
    }).then((res) => {
      if (res && res.ok) {
        el.newTitle.value = '';
        planApi.set(null, 'none', null);
        el.newTitle.blur();
        collapseComposer();
        toast('任务已登记 // FILED');
      } else {
        toast('登记失败：' + ((res && res.error) || 'unknown'), 'bad');
      }
    });
  }

  /* ---------------------------------------------------------------- events */

  function bindEvents() {
    /* This is a desktop widget, not a web page: the browser's 返回 / 刷新 / 另存为 /
       打印 menu on a right-click is never what someone wants, and on the month grid a
       right-click is a plausible attempt at "new task on this day". */
    doc.addEventListener('contextmenu', (ev) => { ev.preventDefault(); return false; });

    /* the memo pad lives in the dashboard page, outside the view panel's handlers */
    if (el.pageDash) {
      el.pageDash.addEventListener('click', (ev) => {
        const del = ev.target.closest('[data-memodel]');
        if (!del) return;
        saveMemo(memoList().filter((m) => m.id !== del.dataset.memodel));
      });
    }

    el.search.addEventListener('input', () => { S.q = el.search.value; renderList(); });
    el.search.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { S.q = ''; el.search.value = ''; showSearch(false); renderList(); }
    });
    if (el.btnSearch) {
      el.btnSearch.addEventListener('click', () => {
        showSearch(el.searchRow.classList.contains('u-hidden'), true);
      });
    }
    if (el.btnSearchClear) {
      el.btnSearchClear.addEventListener('click', () => {
        S.q = ''; el.search.value = ''; showSearch(false); renderList();
      });
    }
    el.prioFilter.addEventListener('change', () => { S.prio = el.prioFilter.value; renderList(); });
    el.sortSel.addEventListener('change', () => { S.sort = el.sortSel.value; renderList(); });

    el.list.addEventListener('click', (ev) => {
      if (Date.now() < rowDragSuppressClick) return;
      const row = ev.target.closest('.task');
      if (!row) return;
      const id = row.dataset.id;
      const actNode = ev.target.closest('[data-act]');
      if (actNode) { handleRowAction(actNode.dataset.act, id, row, actNode); return; }      if (ev.target.closest('.task-title')) {
        const notes = $('.task-notes', row);
        if (notes) notes.classList.toggle('u-hidden');
      }
    });
    /* timeline + month view: rows behave like ledger rows, plus their own controls */
    if (el.viewPanel) {
      el.viewPanel.addEventListener('click', (ev) => {
        const tk = ev.target.closest('[data-act^="tk"]');
        if (tk) {
          const act = tk.dataset.act;
          if (act === 'tkStart') {
            const sel = document.getElementById('tkPick');
            const id = sel && sel.value;
            if (!id) { toast('没有可计时的任务 // NO OPEN TASK', 'warn'); return; }
            API.op({ type: 'todo:timer', id: id }).then(() => toast('开始计时 // TIMING'));
          } else if (act === 'tkStop') {
            const run = D.openEntry(S.state);
            if (run) API.op({ type: 'todo:timer', id: run.todoId }).then(() => toast('已记录 // LOGGED'));
          } else if (act === 'tkDel' && tk.dataset.id) {
            API.op({ type: 'timer:delete', id: tk.dataset.id });
          } else if (act === 'tkFocus' && tk.dataset.id) {
            const t = D.todoById(S.state, tk.dataset.id);
            if (t) openTodoModal(t);
          }
          return;
        }
        const nav = ev.target.closest('[data-cal]');
        if (nav) {
          const act = nav.dataset.cal;
          if (act === 'today') {
            const now = new Date();
            S.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            S.calDay = D.dayKey(now);
            renderAll();
          } else {
            shiftCalMonth(act === 'prev' ? -1 : 1);
          }
          return;
        }
        const chip = ev.target.closest('[data-open]');
        if (chip) {
          const t = D.todoById(S.state, chip.dataset.open);
          if (t) openTodoModal(t);
          return;
        }
        const row = ev.target.closest('.task');
        if (row) {
          const actNode = ev.target.closest('[data-act]');
          if (actNode) { handleRowAction(actNode.dataset.act, row.dataset.id, row, actNode); return; }
          if (ev.target.closest('.task-title')) {
            const notes = $('.task-notes', row);
            if (notes) notes.classList.toggle('u-hidden');
          }
          return;
        }
        const cell = ev.target.closest('.cal-cell');
        if (cell) {
          const day = cell.dataset.day;
          const now = Date.now();
          /* A browser-fired dblclick cannot be relied on here: the click below calls
             renderAll(), which rebuilds all 42 cells, so the second click lands on a
             different element and the gesture is delivered to an ancestor — or not at
             all. Detect the pair ourselves, on the day rather than on the node. */
          if (calCellHit.day === day && now - calCellHit.at < 450) {
            calCellHit = { day: null, at: 0 };
            /* T00:00 rather than the bare key: a date-only string is parsed as UTC by
               Date(), which would land the task at 08:00 local on a +08 machine */
            openTodoModal(null, { dueAt: day + 'T00:00' });
            return;
          }
          calCellHit = { day: day, at: now };
          S.calDay = day;
          if (cell.classList.contains('out')) {
            const d = D.parseDate(day);
            if (d) S.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
          }
          renderAll();
        }
      });
      el.viewPanel.addEventListener('dblclick', (ev) => {
        const row = ev.target.closest('.task');
        if (!row || ev.target.closest('button')) return;
        const t = D.todoById(S.state, row.dataset.id);
        if (t) openTodoModal(t);
        /* a day cell is handled in the click path above: the browser's dblclick is
           unreliable there because the first click rebuilds the grid */
      });
    }

    el.list.addEventListener('dblclick', (ev) => {
      const row = ev.target.closest('.task');
      if (!row) return;
      const t = D.todoById(S.state, row.dataset.id);
      if (t && !ev.target.closest('button')) openTodoModal(t);
    });

    /* ledger rows are dragged with the pointer: drop on a sidebar group to
       re-file, drop on another row to reorder (HTML5 dnd was unreliable here) */
    el.list.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest('button, a, input, select, textarea')) return;
      const row = ev.target.closest('.task');
      if (!row) return;
      rowDrag = {
        id: row.dataset.id,
        row: row,
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        active: false,
        ghost: null
      };
    });
    doc.addEventListener('pointermove', (ev) => {
      if (!rowDrag || ev.pointerId !== rowDrag.pointerId) return;
      if (!rowDrag.active) {
        if (Math.abs(ev.clientX - rowDrag.startX) + Math.abs(ev.clientY - rowDrag.startY) < 6) return;
        beginRowDrag();
      }
      moveRowDrag(ev);
    });
    doc.addEventListener('pointerup', (ev) => {
      if (!rowDrag || ev.pointerId !== rowDrag.pointerId) return;
      endRowDrag(ev, false);
    });
    doc.addEventListener('pointercancel', (ev) => {
      if (!rowDrag || ev.pointerId !== rowDrag.pointerId) return;
      endRowDrag(ev, true);
    });

    if (el.miniGroup) {
      el.miniGroup.addEventListener('change', () => { S.miniGroup = el.miniGroup.value; renderMiniList(); });
    }

    $('#btnAddGroup').addEventListener('click', () => openGroupModal(null));
    const sideToggle = $('#btnSide');
    if (sideToggle) sideToggle.addEventListener('click', toggleSide);
    el.btnOverlay.addEventListener('click', () => {
      const on = S.state.settings.overlay === false;
      API.op({ type: 'settings:update', patch: { overlay: on } });
      toast(on ? '桌面卡片层已开启 // OVERLAY ON' : '桌面卡片层已隐藏 // OVERLAY OFF');
    });
    $('#btnSettings').addEventListener('click', openSettings);
    if (el.btnTheme) {
      el.btnTheme.addEventListener('click', () => {
        const next = S.state.settings.theme === 'ink' ? 'paper' : 'ink';
        API.op({ type: 'settings:update', patch: { theme: next } });
        toast(next === 'ink' ? '夜间主题 // NIGHT' : '白昼主题 // DAY');
      });
    }
    $('#btnMin').addEventListener('click', () => API.win.minimize());
    $('#btnMax').addEventListener('click', () => API.win.toggleMax());
    $('#btnClose').addEventListener('click', () => API.win.close());

    doc.addEventListener('mousedown', (ev) => {
      if (!el.modal.classList.contains('open')) return;
      if (ev.target.closest('.modal-panel')) return;
      if (ev.target.closest('.modal-backdrop')) closeModal();
    });

    doc.addEventListener('keydown', (ev) => {
      const typing = ev.target && ev.target.closest && ev.target.closest('input, textarea, select');
      if (ev.key === 'Escape' && el.modal.classList.contains('open')) { closeModal(); return; }
      if (typing) return;
      if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); el.newTitle.focus(); el.composerExtra.classList.add('open'); }
      if (ev.key === '/') { ev.preventDefault(); showSearch(true, true); }
    });

  }

  /* ------------------------------------------------- pointer drag helpers */

  function beginRowDrag() {
    rowDrag.active = true;
    rowDragSuppressClick = Date.now() + 500;
    const t = D.todoById(S.state, rowDrag.id);
    const ghost = doc.createElement('div');
    ghost.className = 'row-ghost';
    ghost.textContent = t ? t.title : '';
    doc.body.appendChild(ghost);
    rowDrag.ghost = ghost;
    rowDrag.row.classList.add('dragging');
    doc.body.classList.add('row-dragging');
    try { rowDrag.row.setPointerCapture(rowDrag.pointerId); } catch (e) { /* ignore */ }
  }

  function clearRowHints() {
    if (rowHint) { rowHint.classList.remove('drop-hint', 'drop-target'); rowHint = null; }
  }

  function rowDropTarget(x, y, dragId) {
    const under = doc.elementFromPoint(x, y);
    if (!under || !under.closest) return null;
    const li = under.closest('#groupList li[data-group]');
    if (li) return { kind: 'group', li: li };
    const row = under.closest('#list .task');
    if (row && row.dataset.id !== dragId) return { kind: 'row', row: row };
    return null;
  }

  function moveRowDrag(ev) {
    /* resolve the target before touching styles/DOM so no forced re-layout happens mid-move */
    const target = rowDropTarget(ev.clientX, ev.clientY, rowDrag.id);
    if (rowDrag.ghost) {
      rowDrag.ghost.style.transform =
        'translate3d(' + ev.clientX + 'px,' + ev.clientY + 'px,0) translate(-50%, -50%) rotate(-1.2deg)';
    }
    const node = target ? (target.kind === 'group' ? target.li : target.row) : null;
    if (node !== rowHint) {
      clearRowHints();
      if (node) {
        node.classList.add(target.kind === 'group' ? 'drop-hint' : 'drop-target');
        rowHint = node;
      }
    }
  }

  function endRowDrag(ev, cancelled) {
    const drag = rowDrag;
    rowDrag = null;
    if (drag.ghost) drag.ghost.remove();
    doc.body.classList.remove('row-dragging');
    drag.row.classList.remove('dragging');
    if (!drag.active) return;
    clearRowHints();
    if (cancelled) return;
    const target = rowDropTarget(ev.clientX, ev.clientY, drag.id);
    if (!target) return;
    if (target.kind === 'group') {
      const id = drag.id;
      const g = D.groupById(S.state, target.li.dataset.group);
      API.op({ type: 'todo:move', id: id, groupId: target.li.dataset.group }).then((res) => {
        if (res && res.ok) toast('已移动到 ' + (g ? g.name : '分组') + ' // MOVED');
      });
      return;
    }
    const ids = $$('#list .task').map((r) => r.dataset.id);
    const from = ids.indexOf(drag.id);
    let to = ids.indexOf(target.row.dataset.id);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    API.op({ type: 'todo:reorder', ids: ids });
    toast('顺序已更新 // REORDERED');
  }

  function handleRowAction(act, id, row, node) {
    const t = D.todoById(S.state, id);
    if (!t) return;
    if (act === 'toggle') {
      if (!t.done) {
        row.classList.add('done');
        setTimeout(() => {
          API.op({ type: 'todo:toggle', id: id }).then((res) => {
            if (res && res.ok && res.spawned) toast('重复任务：已生成下一次 // NEXT OCCURRENCE');
          });
        }, 220);
      } else {
        API.op({ type: 'todo:toggle', id: id }).then((res) => {
          if (res && res.ok && res.removed) toast('已撤销生成的下一次 // UNDONE');
        });
      }
      return;
    }
    if (act === 'edit') { openTodoModal(t); return; }
    if (act === 'timer') {
      API.op({ type: 'todo:timer', id: id }).then((res) => {
        const on = !!(res && res.running === id);
        toast(on ? '开始计时 // TIMER ON' : '计时已暂停 // TIMER PAUSED');
      });
      return;
    }
    if (act === 'pin') {
      /* one card out on the desk, whatever group the deck is showing — the card layer
         places it and the same button calls it back */
      const goingOut = !(S.state.placements[id] || {}).pinned;
      if (goingOut && S.state.settings.overlay === false) {
        API.op({ type: 'settings:update', patch: { overlay: true } });
      }
      API.op({ type: 'todo:deploy', id: id }).then((res) => {
        toast(res && res.pinned ? '已钉在桌面卡片层 // PINNED TO DESK' : '已收回卡片 // CARD RECALLED');
      });
      return;
    }
    if (act === 'delete') {
      if (node.dataset.confirm === '1') {
        API.op({ type: 'todo:delete', id: id });
        toast('任务已删除 // PURGED');
        return;
      }
      node.dataset.confirm = '1';
      node.textContent = '!';
      node.title = '再次点击确认删除';
      setTimeout(() => {
        node.dataset.confirm = '';
        node.textContent = '\u2715';
        node.title = '删除';
      }, 2600);
    }
  }

  /* ---------------------------------------------------------------- modals */

  function modalShell(title, sub, bodyHtml, footHtml, wide) {
    return '' +
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-panel' + (wide ? ' wide' : '') + '">' +
      '  <div class="modal-head">' +
      '    <div><h2>' + title + '</h2><div class="modal-title-sub">' + sub + '</div></div>' +
      '    <button class="icon-btn" data-act="close">\u2715</button>' +
      '  </div>' +
      '  <div class="modal-body">' + bodyHtml + '</div>' +
      '  <div class="modal-foot">' + footHtml + '</div>' +
      '</div>';
  }

  function openModal(html, onMount, wide) {
    el.modal.innerHTML = html;
    el.modal.classList.add('open');
    /* attach listeners to the freshly created panel, never to the persistent
       modal root, otherwise handlers accumulate on every open */
    const panel = $('.modal-panel', el.modal) || el.modal;
    const closeBtn = $('[data-act="close"]', panel);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (window.NeonModalDrag) NeonModalDrag.make(panel, $('.modal-head', panel));
    if (onMount) onMount(panel);
    return panel;
  }

  function closeModal() {
    el.modal.classList.remove('open');
    el.modal.innerHTML = '';
  }

  function switchRow(label, hint, on, onToggle) {
    const wrap = doc.createElement('div');
    wrap.className = 'set-row';
    const left = doc.createElement('div');
    left.innerHTML = '<div class="set-label">' + label + '</div>' + (hint ? '<div class="set-hint">' + hint + '</div>' : '');
    const sw = doc.createElement('button');
    sw.className = 'switch' + (on ? ' on' : '');
    sw.innerHTML = '<i></i>';
    sw.addEventListener('click', () => {
      const next = !sw.classList.contains('on');
      sw.classList.toggle('on', next);
      onToggle(next);
    });
    wrap.appendChild(left);
    wrap.appendChild(sw);
    return wrap;
  }

  function openTodoModal(t, preset) {
    const editing = !!t;
    const groupId = t ? t.groupId : (S.view === 'group' && S.groupId ? S.groupId : S.state.settings.activeGroupId);
    const body =
      '<div class="modal-grid">' +
      '  <div class="full"><label class="label">任务 TASK</label><input class="input" id="mTitle" autocomplete="off" /></div>' +
      '  <div class="full"><label class="label">备注 NOTES</label><textarea class="textarea" id="mNotes" rows="3"></textarea></div>' +
      '  <div><label class="label">分组 GROUP</label><select class="select" id="mGroup"></select></div>' +
      '  <div><label class="label">优先级 PRIORITY</label><div class="prio-row" id="mPrio">' +
      D.PRIORITIES.map((p) => '<button type="button" class="pbtn' + (t && t.priority === p ? ' on' : '') + '" data-prio="' + p + '">' + D.PRIORITY_LABEL[p] + '</button>').join('') +
      '</div></div>' +
      '  <div class="full"><label class="label">计划与重复 PLAN</label><div class="plan-host" id="mPlanHost"></div></div>' +
      '  <div class="full"><label class="label">标签 TAGS（逗号分隔）</label><input class="input" id="mTags" autocomplete="off" placeholder="例如：工作, 紧急" /></div>' +
      '</div>';
    const foot =
      (editing ? '<button class="btn danger sm" data-act="del">删除任务</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn ghost" data-act="cancel">取消</button>' +
      '<button class="btn primary" data-act="save">' + (editing ? '保存 SAVE' : '添加 ADD') + '</button>';

    openModal(modalShell(editing ? '编辑任务 / EDIT RECORD' : '新建任务 / NEW RECORD', 'TASK RECORD', body, foot), (root) => {
      const title = $('#mTitle', root);
      const notes = $('#mNotes', root);
      const group = $('#mGroup', root);
      const prioRow = $('#mPrio', root);
      const tags = $('#mTags', root);
      let plan = null;

      sortedGroups().forEach((g) => {
        const o = doc.createElement('option');
        o.value = g.id;
        o.textContent = g.name;
        if (g.id === groupId) o.selected = true;
        group.appendChild(o);
      });
      if (t) {
        title.value = t.title;
        notes.value = t.notes || '';
        tags.value = (t.tags || []).join(', ');
      }
      plan = window.NeonPlan.mount($('#mPlanHost', root), {
        dueAt: t ? t.dueAt : (preset && preset.dueAt) || null,
        repeat: t ? t.repeat : 'none',
        lunar: t ? t.lunar : null
      });

      prioRow.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-prio]');
        if (!b) return;
        $$('.pbtn', prioRow).forEach((x) => x.classList.toggle('on', x === b));
      });

      const save = () => {
        const value = title.value.trim();
        if (!value) { title.focus(); toast('请输入任务内容', 'warn'); return; }
        const onBtn = $('.pbtn.on', prioRow);
        const planValue = plan.get();
        const patch = {
          title: value,
          notes: notes.value,
          dueAt: planValue.dueAt,
          repeat: planValue.repeat,
          repeatUntil: planValue.repeatUntil,
          repeatCount: planValue.repeatCount,
          lunar: planValue.lunar,
          groupId: group.value,
          priority: onBtn ? onBtn.dataset.prio : 'none',
          tags: tags.value.split(',').map((x) => x.trim()).filter(Boolean)
        };
        if (editing) API.op({ type: 'todo:update', id: t.id, patch: patch });
        else API.op({ type: 'todo:add', title: patch.title, notes: patch.notes, dueAt: patch.dueAt, repeat: patch.repeat, lunar: patch.lunar, groupId: patch.groupId, priority: patch.priority, tags: patch.tags });
        closeModal();
        toast(editing ? '任务已更新 // UPDATED' : '任务已添加 // DEPLOYED');
      };

      $('[data-act="save"]', root).addEventListener('click', save);
      $('[data-act="cancel"]', root).addEventListener('click', closeModal);
      const del = $('[data-act="del"]', root);
      if (del) {
        del.addEventListener('click', () => {
          if (del.dataset.confirm === '1') {
            API.op({ type: 'todo:delete', id: t.id });
            closeModal();
            toast('任务已删除 // PURGED');
            return;
          }
          del.dataset.confirm = '1';
          del.textContent = '确认删除?';
        });
      }
      title.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
      setTimeout(() => title.focus(), 30);
    });
  }

  function openGroupModal(group) {
    const editing = !!group;
    const locked = !!(group && group.locked);
    const body =
      '<div class="modal-grid">' +
      '  <div class="full"><label class="label">分组名称 GROUP NAME</label><input class="input" id="gName" autocomplete="off" /></div>' +
      '  <div class="full"><label class="label">分组颜色 GROUP COLOR</label>' +
      '    <div class="set-hint" style="margin:-2px 0 6px">用于卡片左侧色条、分组标签与卡盒指示灯（点击立即生效）</div>' +
      '    <div class="color-row" id="gColors"></div>' +
      '    <div class="color-preview" id="gPreview"></div>' +
      '  </div>' +
      '</div>';
    const foot =
      (editing && !locked ? '<button class="btn danger sm" data-act="del">删除分组</button>' : '') +
      (locked ? '<span class="set-hint">临时分组为固定分组，不可删除</span>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn ghost" data-act="cancel">取消</button>' +
      '<button class="btn primary" data-act="save">' + (editing ? '保存 SAVE' : '创建 CREATE') + '</button>';

    openModal(modalShell(editing ? '编辑分组 / EDIT GROUP' : '新建分组 / NEW GROUP', locked ? 'FIXED GROUP' : 'GROUP', body, foot), (root) => {
      const name = $('#gName', root);
      const colorsBox = $('#gColors', root);
      const preview = $('#gPreview', root);
      let picked = editing ? group.color : (D.COLOR_KEYS.find((c) => !S.state.groups.some((g) => g.color === c)) || D.COLOR_KEYS[0]);
      if (editing) name.value = group.name;

      function refreshPreview() {
        const label = (name.value.trim() || '新分组');
        preview.innerHTML =
          '<div class="cp-card" style="border-left-color:' + D.PALETTE[picked] + '"></div>' +
          '<span class="badge group" style="border-left:4px solid ' + D.PALETTE[picked] + '">' + escapeHtml(label) + '</span>' +
          '<i class="dot" style="background:' + D.PALETTE[picked] + '"></i>';
      }

      D.COLOR_KEYS.forEach((key) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'cbtn' + (key === picked ? ' on' : '');
        b.style.background = D.PALETTE[key];
        b.dataset.color = key;
        b.title = key;
        colorsBox.appendChild(b);
      });
      colorsBox.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-color]');
        if (!b) return;
        picked = b.dataset.color;
        $$('.cbtn', colorsBox).forEach((x) => x.classList.toggle('on', x === b));
        refreshPreview();
        if (editing) {
          /* apply immediately so the change is visible everywhere right away */
          API.op({ type: 'group:update', id: group.id, patch: { color: picked } });
          toast('分组颜色已更新');
        }
      });
      name.addEventListener('input', refreshPreview);
      refreshPreview();

      const save = () => {
        const value = name.value.trim();
        if (!value) { name.focus(); toast('请输入分组名称', 'warn'); return; }
        if (editing) API.op({ type: 'group:update', id: group.id, patch: { name: value, color: picked } });
        else API.op({ type: 'group:add', name: value, color: picked });
        closeModal();
        toast(editing ? '分组已更新' : '分组已创建');
      };
      $('[data-act="save"]', root).addEventListener('click', save);
      $('[data-act="cancel"]', root).addEventListener('click', closeModal);
      const del = $('[data-act="del"]', root);
      if (del) {
        del.addEventListener('click', () => {
          if (del.dataset.confirm === '1') {
            API.op({ type: 'group:delete', id: group.id }).then((res) => {
              if (!res.ok) toast('无法删除：固定分组或最后一个分组', 'bad');
              else toast('分组已删除 · 任务已转移');
            });
            closeModal();
            return;
          }
          del.dataset.confirm = '1';
          del.textContent = '确认删除（任务移到第一个分组）?';
        });
      }
      name.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
      setTimeout(() => name.focus(), 30);
    });
  }

  /* ---------------------------------------------------------------- settings */

  function openSettings() {
    const st = S.state.settings;
    const body =
      '<div class="settings-grid">' +
      '  <div class="panel hud-thin" id="panelInterface">' +
      '    <h3>界面显示 / INTERFACE</h3>' +
      '    <div class="range-row"><span class="tiny faint">字体大小</span><input type="range" id="rUi" min="0.8" max="2" step="0.05" value="' + st.uiScale + '" /><span class="val" id="vUi">' + Number(st.uiScale).toFixed(2) + '\u00D7</span></div>' +
      '    <div class="row" style="margin-top:6px"><span class="set-hint" id="uiHint">调整后点“应用”生效</span><span class="spacer"></span><button class="btn sm primary" data-act="applyUi">应用</button></div>' +
      '    <div class="divider"></div>' +
      '    <label class="label">停靠边缘 DOCK EDGE</label>' +
      '    <div class="edge-picker" id="edgePicker">' +
      D.EDGES.map((e) => {
        const name = { left: '左侧', right: '右侧', top: '顶部', bottom: '底部' }[e];
        return '<button class="edge-tile' + (st.edge === e ? ' on' : '') + '" data-edge="' + e + '"><div class="mini"><i></i></div>' + name + '</button>';
      }).join('') +
      '    </div>' +
      '    <div class="divider"></div>' +
      '    <div class="range-row"><span class="tiny faint">卡盒大小</span><input type="range" id="rDeck" min="0.5" max="2.5" step="0.05" value="' + st.deckScale + '" /><span class="val" id="vDeck">' + Number(st.deckScale).toFixed(2) + '\u00D7</span></div>' +
      '    <div class="range-row" style="margin-top:8px"><span class="tiny faint">卡片大小</span><input type="range" id="rCard" min="0.5" max="2.5" step="0.05" value="' + st.cardScale + '" /><span class="val" id="vCard">' + Number(st.cardScale).toFixed(2) + '\u00D7</span></div>' +
      '    <div class="range-row" style="margin-top:8px"><span class="tiny faint">散布卡片文字</span><input type="range" id="rFont" min="0.8" max="1.6" step="0.05" value="' + (Number(st.cardFontScale) || 1) + '" /><span class="val" id="vFont">' + (Number(st.cardFontScale) || 1).toFixed(2) + '\u00D7</span></div>' +
      '    <div class="range-row" style="margin-top:8px"><span class="tiny faint">悬停卡片文字</span><input type="range" id="rChipFont" min="0.8" max="1.6" step="0.05" value="' + (Number(st.chipFontScale) || 1) + '" /><span class="val" id="vChipFont">' + (Number(st.chipFontScale) || 1).toFixed(2) + '\u00D7</span></div>' +
      '    <div class="range-row" style="margin-top:8px"><span class="tiny faint">不透明度</span><input type="range" id="rOpacity" min="0.3" max="1" step="0.05" value="' + st.opacity + '" /><span class="val" id="vOpacity">' + Number(st.opacity).toFixed(2) + '</span></div>' +
      '    <div class="divider"></div>' +
      '    <div class="set-row"><div><div class="set-label">卡盒位置</div><div class="set-hint">解锁后可直接拖动桌面卡盒，也可点右侧置中</div></div><button class="btn sm" data-act="dockReset">置中</button></div>' +
      '  </div>' +
      '  <div class="panel hud-thin" id="panelStyle">' +
      '    <h3>外观风格 / STYLE <span class="tiny faint" id="styleNow"></span></h3>' +
      '    <div class="style-grid" id="styleRows"></div>' +
      '    <div class="set-hint" style="margin-top:7px">风格决定材质（圆角、铬条、阴影、字体），昼夜只决定颜色。两者互不干涉，随时可切；调色台里钉住的颜色仍按昼/夜分别保存。</div>' +
      '  </div>' +
      '  <div class="panel hud-thin" id="panelPalette">' +
      '    <h3>调色台 / COLOUR LAB <span class="tiny faint" id="palTheme"></span></h3>' +
      '    <div class="row" style="margin-bottom:6px">' +
      '      <span class="tiny faint">正在调整</span><span class="spacer"></span>' +
      '      <button class="btn sm" data-act="palDay">白昼</button>' +
      '      <button class="btn sm" data-act="palNight">夜间</button>' +
      '      <button class="btn sm danger" data-act="palReset">重置本主题</button>' +
      '    </div>' +
      '    <div class="set-hint" style="margin-bottom:6px">改动即时生效并保存。规则线、网格、水印都从「正文」色自动派生，调它一处即可。</div>' +
      '    <div id="palRows"></div>' +
      '  </div>' +
      '  <div class="panel hud-thin" id="panelToggles">' +
      '    <h3>行为 · 提醒 · 系统</h3>' +
      '  </div>' +
      '  <div class="panel hud-thin">' +
      '    <h3>卡片层操作 / DECK OPS</h3>' +
      '    <div class="about-line">' +
      '      [ 悬停 卡盒 ] → 分组卡片在旁边铺开，逐张可读<br>' +
      '      [ 悬停 某张卡片 ] → 放大、回正、抬起阴影<br>' +
      '      [ 鼠标离开 卡盒/卡片 ] → 同时收回全部卡片<br>' +
      '      [ 单击 卡盒 ] → 卡片散布到桌面各处<br>' +
      '      [ 单击 留在原地的卡片 ] → 收回全部卡片<br>' +
      '      [ 拖动 卡盒 ] → 需在右侧解锁后可用<br>' +
      '      [ 拖动 / ⤺ ⤻ ] → 摆放与倾斜（自动记忆）' +
      '    </div>' +
      '  </div>' +
      '  <div class="panel hud-thin">' +
      '    <h3>全局快捷键</h3>' +
      '    <div class="row"><input class="input" id="hotkeyInput" value="' + escapeHtml(st.hotkey) + '" /><button class="btn sm" data-act="hotkey">应用</button></div>' +
      '    <div class="set-hint" style="margin-top:6px">例如 Control+Alt+T · 按下后立即唤出桌面卡片层并新建任务</div>' +
      '  </div>' +
      '  <div class="panel hud-thin">' +
      '    <h3>数据 · 维护</h3>' +
      '    <div class="row" style="flex-wrap:wrap">' +
      '      <button class="btn sm" data-act="export">导出 JSON</button>' +
      '      <button class="btn sm" data-act="import">导入 JSON</button>' +
      '      <button class="btn sm" data-act="relayout">重排卡片</button>' +
      '      <button class="btn sm danger" data-act="clearDone">清空已完成</button>' +
      '      <button class="btn sm danger" data-act="resetSettings">恢复默认设置</button>' +
      '      <button class="btn sm danger" data-act="reset">恢复示例数据</button>' +
      '    </div>' +
      '    <div class="divider"></div>' +
      '    <div class="about-line" id="aboutLine">DASHBOARD 1971</div>' +
      '  </div>' +
      '</div>';
    const foot =
      '<div class="spacer"></div>' +
      '<button class="btn primary" data-act="done">完成 CLOSE</button>';

    openModal(modalShell('系统设置', 'SETTINGS // CONTROL DECK', body, foot, true), async (root) => {
      const palRows = $('#palRows', root);

      function savePalette(token, value) {
        const theme = window.NeonTheme.themeOf(S.state.settings);
        const next = { paper: {}, ink: {} };
        ['paper', 'ink'].forEach((t) => {
          Object.assign(next[t], (S.state.settings.palette || {})[t] || {});
        });
        if (token === null) next[theme] = {};
        else next[theme][token] = value;
        API.op({ type: 'settings:update', patch: { palette: next } });
      }

      function renderPalette() {
        if (!palRows || !window.NeonTheme) return;
        const theme = window.NeonTheme.themeOf(S.state.settings);
        const tag = $('#palTheme', root);
        if (tag) tag.textContent = theme === 'ink' ? '// NIGHT' : '// DAY';
        palRows.innerHTML = '';
        NeonTheme.TOKENS.forEach((grp) => {
          const head = doc.createElement('div');
          head.className = 'pal-group';
          head.textContent = grp.group;
          palRows.appendChild(head);
          grp.items.forEach((it) => {
            const row = doc.createElement('label');
            row.className = 'pal-row';
            const name = doc.createElement('span');
            name.className = 'pal-name';
            name.textContent = it.n;
            const sw = doc.createElement('input');
            sw.type = 'color';
            sw.className = 'pal-swatch';
            sw.value = NeonTheme.current(it.v);
            const hex = doc.createElement('span');
            hex.className = 'pal-hex';
            hex.textContent = sw.value;
            /* input fires continuously while the native picker is dragged: preview on
               the root directly, and only write to the store once it settles, or the
               data file is rewritten on every tick */
            sw.addEventListener('input', () => {
              doc.documentElement.style.setProperty(it.v, sw.value);
              hex.textContent = sw.value;
            });
            sw.addEventListener('change', () => savePalette(it.v, sw.value));
            row.appendChild(name);
            row.appendChild(sw);
            row.appendChild(hex);
            palRows.appendChild(row);
          });
        });
      }
      /* one card per material, each showing its own palette, because "diner" or "print"
         is hard to choose from a name alone */
      function renderStyleRows() {
        const host = $('#styleRows', root);
        const tag = $('#styleNow', root);
        if (!host || !window.NeonTheme) return;
        const cur = NeonTheme.styleOf(S.state.settings);
        if (tag) {
          tag.textContent = '// ' + (cur === 'diner' ? 'DINER' : 'PRINT') +
            (NeonTheme.themeOf(S.state.settings) === 'ink' ? ' · NIGHT' : ' · DAY');
        }
        host.innerHTML = '';
        NeonTheme.STYLES.forEach((s) => {
          const b = doc.createElement('button');
          b.type = 'button';
          b.className = 'style-card' + (s.v === cur ? ' on' : '');
          b.dataset.style = s.v;
          const strip = doc.createElement('span');
          strip.className = 'style-sw';
          s.sw.forEach((c) => {
            const i = doc.createElement('i');
            i.style.background = c;
            strip.appendChild(i);
          });
          const name = doc.createElement('b');
          name.textContent = s.n;
          const hint = doc.createElement('span');
          hint.className = 'style-hint';
          hint.textContent = s.d;
          b.appendChild(strip);
          b.appendChild(name);
          b.appendChild(hint);
          b.addEventListener('click', () => {
            API.op({ type: 'settings:update', patch: { style: s.v } })
              .then(() => renderStyleRows());
            toast('外观风格：' + s.n + ' // STYLE ' + s.v.toUpperCase());
          });
          host.appendChild(b);
        });
      }
      renderPalette();
      renderStyleRows();
      const toggles = $('#panelToggles', root);
      const iface = $('#panelInterface', root);
      if (iface) {
        iface.appendChild(switchRow('解锁拖动卡盒', '开启后可在桌面上按住卡盒拖动位置', st.dockMovable !== false, (v) => {
          API.op({ type: 'settings:update', patch: { dockMovable: v } });
          toast(v ? '已解锁：可拖动卡盒 // UNLOCKED' : '已锁定卡盒位置 // LOCKED');
        }));
      }
      toggles.appendChild(switchRow('显示桌面卡片层', '透明提词层，随时悬浮在桌面边缘', st.overlay !== false, (v) => API.op({ type: 'settings:update', patch: { overlay: v } })));
      toggles.appendChild(switchRow('仅在桌面显示', '前台是其他窗口时隐藏卡片层', st.desktopOnly !== false, (v) => API.op({ type: 'settings:update', patch: { desktopOnly: v } })));
      toggles.appendChild(switchRow('按分辨率自动缩放', '根据显示器分辨率自动调整卡盒与卡片大小（推荐）', st.autoScale !== false, (v) => API.op({ type: 'settings:update', patch: { autoScale: v } })));
      toggles.appendChild(switchRow('隐藏已完成', '桌面卡片层不显示已完成任务', st.hideCompleted !== false, (v) => API.op({ type: 'settings:update', patch: { hideCompleted: v } })));
      toggles.appendChild(switchRow('卡片堆自动缩进屏幕', '一段时间没有指针靠近时，卡片堆自动缩回屏幕边缘', st.dockAutoTuck !== false, (v) => API.op({ type: 'settings:update', patch: { dockAutoTuck: v } })));
      toggles.appendChild(switchRow('到期提醒', '任务到期时发送系统通知', st.reminders !== false, (v) => API.op({ type: 'settings:update', patch: { reminders: v } })));
      toggles.appendChild(switchRow('启用全局快捷键', '关闭后不注册系统级热键', st.shortcuts !== false, (v) => API.op({ type: 'settings:update', patch: { shortcuts: v } })));
      toggles.appendChild(switchRow('开机自动启动', '登录 Windows 后自动运行', !!st.launchAtLogin, async (v) => {
        API.op({ type: 'settings:update', patch: { launchAtLogin: v } });
        const r = await API.setLoginItem(v);
        if (r && !r.ok && API.isElectron) toast('系统自启设置失败：' + (r.error || ''), 'warn');
      }));
      toggles.appendChild(switchRow('动画效果', '关闭后卡片瞬移（低性能模式）', st.animations !== false, (v) => API.op({ type: 'settings:update', patch: { animations: v } })));
      toggles.appendChild(switchRow('完成音效', '勾选完成卡片时播放提示音', st.sound !== false, (v) => API.op({ type: 'settings:update', patch: { sound: v } })));

      $('#edgePicker', root).addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-edge]');
        if (!b) return;
        $$('.edge-tile', root).forEach((x) => x.classList.toggle('on', x === b));
        API.op({ type: 'settings:update', patch: { edge: b.dataset.edge } });
        toast('停靠边缘已切换：' + b.textContent.trim());
      });
      const scaleUi = $('#rUi', root);
      const vUi = $('#vUi', root);
      const uiHint = $('#uiHint', root);
      let pendingUi = Math.min(2, Math.max(0.8, Number(st.uiScale) || 1.3));
      const refreshUiHint = () => {
        const applied = Math.min(2, Math.max(0.8, Number(S.state.settings.uiScale) || 1.3));
        const dirty = Math.abs(pendingUi - applied) > 0.001;
        if (uiHint) {
          uiHint.textContent = dirty ? '未应用：点“应用”后生效' : '已应用';
          uiHint.style.color = dirty ? 'var(--brick)' : 'var(--ink-3)';
        }
      };
      scaleUi.addEventListener('input', () => {
        pendingUi = Math.min(2, Math.max(0.8, Number(scaleUi.value) || 1.15));
        vUi.textContent = pendingUi.toFixed(2) + '\u00D7';
        refreshUiHint();
      });
      refreshUiHint();
      const scaleDeck = $('#rDeck', root);
      const vDeck = $('#vDeck', root);
      scaleDeck.addEventListener('input', () => {
        vDeck.textContent = Number(scaleDeck.value).toFixed(2) + '\u00D7';
        API.op({ type: 'settings:update', patch: { deckScale: Number(scaleDeck.value) } });
      });
      const scaleCard = $('#rCard', root);
      const vCard = $('#vCard', root);
      scaleCard.addEventListener('input', () => {
        vCard.textContent = Number(scaleCard.value).toFixed(2) + '\u00D7';
        API.op({ type: 'settings:update', patch: { cardScale: Number(scaleCard.value) } });
      });
      const scaleFont = $('#rFont', root);
      const vFont = $('#vFont', root);
      scaleFont.addEventListener('input', () => {
        vFont.textContent = Number(scaleFont.value).toFixed(2) + '\u00D7';
        API.op({ type: 'settings:update', patch: { cardFontScale: Number(scaleFont.value) } });
      });
      const scaleChipFont = $('#rChipFont', root);
      const vChipFont = $('#vChipFont', root);
      scaleChipFont.addEventListener('input', () => {
        vChipFont.textContent = Number(scaleChipFont.value).toFixed(2) + '\u00D7';
        API.op({ type: 'settings:update', patch: { chipFontScale: Number(scaleChipFont.value) } });
      });
      const opacity = $('#rOpacity', root);
      const vOpacity = $('#vOpacity', root);
      opacity.addEventListener('input', () => {
        vOpacity.textContent = Number(opacity.value).toFixed(2);
        API.op({ type: 'settings:update', patch: { opacity: Number(opacity.value) } });
      });

      root.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'done') { closeModal(); return; }
        if (act === 'applyUi') {
          const k = Math.min(2, Math.max(0.8, Number($('#rUi', root).value) || 1.15));
          API.setZoom(k);
          API.op({ type: 'settings:update', patch: { uiScale: k } });
          refreshUiHint();
          toast('字体大小已应用 // FONT ' + k.toFixed(2) + '\u00D7');
          return;
        }
        if (act === 'hotkey') {
          const value = $('#hotkeyInput', root).value.trim();
          API.op({ type: 'settings:update', patch: { hotkey: value } });
          toast('快捷键已更新：' + value);
          return;
        }
        if (act === 'export') { await exportData(); return; }
        if (act === 'import') { await importData(); return; }
        if (act === 'relayout') { API.op({ type: 'placements:reset' }); toast('卡片已重排 // REPACKED'); return; }
        if (act === 'dockReset') { API.op({ type: 'settings:update', patch: { dockPos: 0.5 } }); toast('卡盒已置中 // DOCK CENTERED'); return; }
        if (act === 'clearDone') { API.op({ type: 'todo:clearCompleted' }); toast('已完成任务已清空'); return; }
        if (act === 'palDay' || act === 'palNight') {
          API.op({ type: 'settings:update', patch: { theme: act === 'palNight' ? 'ink' : 'paper' } });
          setTimeout(renderPalette, 60);
          return;
        }
        if (act === 'palReset') {
          savePalette(null);
          setTimeout(renderPalette, 60);
          toast('本主题配色已还原 // PALETTE RESET');
          return;
        }
        if (act === 'resetSettings') {
          if (b.dataset.confirm === '1') {
            API.op({ type: 'settings:reset' });
            API.setZoom(1.3);
            toast('已恢复默认设置 // SETTINGS RESET');
            return;
          }
          b.dataset.confirm = '1';
          b.textContent = '确认恢复默认设置?';
          setTimeout(() => { b.dataset.confirm = ''; b.textContent = '恢复默认设置'; }, 3200);
          return;
        }
        if (act === 'reset') {
          if (b.dataset.confirm === '1') { API.op({ type: 'data:reset' }); closeModal(); toast('已恢复示例数据 // FACTORY RESET'); return; }
          b.dataset.confirm = '1';
          b.textContent = '确认恢复?';
        }
      });

      const info = await API.appInfo();
      const st2 = D.stats(S.state);
      $('#aboutLine', root).innerHTML =
        'DASHBOARD 1971 v' + (info && info.version ? info.version : 'web') +
        ' · mode: ' + ((info && info.mode) || 'browser') +
        '<br>数据存储：' + ((info && info.dataFile) || 'localStorage') +
        '<br>任务 ' + st2.total + ' · 未完成 ' + st2.open + ' · 已完成 ' + st2.done;
    }, true);
  }

  /* ---------------------------------------------------------------- sidebar resizer */

  function bindSideResizer() {
    const resizer = $('#sideResizer');
    const side = $('#side');
    if (!resizer || !side) return;
    let sideDrag = null;
    resizer.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const rect = side.getBoundingClientRect();
      sideDrag = { left: rect.left, w: rect.width };
      document.body.classList.add('side-dragging');
      try { resizer.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    });
    resizer.addEventListener('pointermove', (ev) => {
      if (!sideDrag) return;
      const w = Math.min(520, Math.max(220, ev.clientX - sideDrag.left));
      sideDrag.w = w;
      document.body.style.setProperty('--side-w', Math.round(w) + 'px');
    });
    const end = () => {
      if (!sideDrag) return;
      const w = sideDrag.w;
      sideDrag = null;
      document.body.classList.remove('side-dragging');
      if (w) API.op({ type: 'settings:update', patch: { sideWidth: Math.round(w) } });
    };
    resizer.addEventListener('pointerup', end);
    resizer.addEventListener('pointercancel', end);
    resizer.addEventListener('dblclick', () => {
      API.op({ type: 'settings:update', patch: { sideWidth: 286 } });
      toast('侧栏宽度已复位 // SIDEBAR RESET');
    });
  }

  /* ---------------------------------------------------------------- data io */

  async function exportData() {
    const text = await API.exportData();
    const blob = new Blob([text], { type: 'application/json' });
    const a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dashboard1971-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('已导出备份 JSON');
  }

  async function importData() {
    if (API.isElectron) {
      const res = await API.importData();
      if (res && res.ok) toast('数据已导入 // IMPORTED');
      else if (res && res.error && res.error !== 'canceled') toast('导入失败：' + res.error, 'bad');
      return;
    }
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const res = await API.op({ type: 'data:import', state: parsed });
          toast(res.ok ? '数据已导入' : '导入失败：' + res.error, res.ok ? '' : 'bad');
        } catch (e) {
          toast('文件解析失败', 'bad');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ---------------------------------------------------------------- toast */

  function toast(text, kind) {
    const node = doc.createElement('div');
    node.className = 'toast' + (kind ? ' ' + kind : '');
    node.textContent = text;
    el.toast.appendChild(node);
    setTimeout(() => node.classList.add('out'), 2000);
    setTimeout(() => node.remove(), 2400);
  }
})();
