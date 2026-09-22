/**
 * DASHBOARD 1971 — shared data layer.
 * Pure logic only (no DOM, no Node APIs): state shape, normalization, operations.
 * Loaded by the Electron main process via require() and by renderers as window.NeonData.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lunar.js'));
  else root.NeonData = factory(root.NeonLunar);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Lunar) {
  'use strict';

  var VERSION = 1;

  var PALETTE = {
    brick: '#8d3a27',
    forest: '#2e4a33',
    slate: '#47597c',
    khaki: '#8a6a1f',
    teal: '#255c58',
    plum: '#6b3550',
    ochre: '#a8621f',
    ink: '#14120d',
    sage: '#6aa690',
    vermillion: '#df4c28',
    honey: '#eba93a',
    cream: '#f9efde'
  };
  var COLOR_KEYS = ['sage', 'vermillion', 'honey', 'cream', 'brick', 'forest', 'slate', 'khaki', 'teal', 'plum', 'ochre', 'ink'];

  var PRIORITIES = ['none', 'low', 'med', 'high'];
  var PRIORITY_LABEL = { none: '普通', low: '低', med: '中', high: '高' };
  var REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
  var REPEAT_LABEL = { none: '不重复', daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' };
  var WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];
  var EDGES = ['left', 'right', 'top', 'bottom'];
  var TEMP_GROUP_ID = 'g_temp';
  /* The dashboard grid's only two sizes, declared once. Six columns of which a module may
     claim 2, 3, 4 or all 6; rows up to six, because a module sized to fill a maximised
     window is four or five rows tall and the old cap of two left the resize grip dead long
     before the screen was full. */
  var DASH_SPANS = [2, 3, 4, 6];
  var DASH_ROWS = [1, 2, 3, 4, 5, 6];
  /* Two material keys are retired: they were abbreviations of someone else's work (p3, unp)
     and are now named after their own medium (poster, console). The old spelling is accepted
     and rewritten rather than rejected, because it is what every existing data file holds
     and an unresolved style would drop the whole desk back to 印刷. */
  var STYLE_WAS = { p3: 'poster', unp: 'console' };
  var STYLE_IS = ['print', 'diner', 'ikb', 'garden', 'poster', 'console'];
  function styleKey(v) {
    var k = String(v || '');
    if (STYLE_WAS[k]) k = STYLE_WAS[k];
    return STYLE_IS.indexOf(k) >= 0 ? k : 'print';
  }

  var SETTING_KEYS = [
    'edge', 'overlay', 'alwaysOnTop', 'launchAtLogin', 'reminders', 'opacity',
    'animations', 'shortcuts', 'hideCompleted', 'pinned', 'activeGroupId', 'hotkey',
    'simple', 'muted', 'deckMonitor',
    'dockScale', 'autoScale',
    'desktopOnly', 'dockPos', 'deckScale', 'cardScale', 'uiScale', 'dockMovable', 'sideWidth', 'sideCollapsed', 'sound',
    'cardFontScale', 'chipFontScale', 'scaleDefaults', 'dockAutoTuck', 'theme', 'style', 'palette',
    'memo', 'pomoDate', 'pomoCount', 'dashLayout', 'receipt'
  ];

  /* ---------------------------------------------------------------- utils */

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function isoNow() { return new Date().toISOString(); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function parseDate(v) { if (!v) return null; var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function endOfDay(d) { var x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { var x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function isToday(todo) {
    var d = parseDate(todo && todo.dueAt);
    return !!d && sameDay(d, new Date());
  }
  function isOverdue(todo) {
    var d = parseDate(todo && todo.dueAt);
    return !!(d && !todo.done && d.getTime() < Date.now());
  }
  function isUpcoming(todo) {
    var d = parseDate(todo && todo.dueAt);
    if (!d) return false;
    var from = endOfDay(new Date()).getTime();
    var to = endOfDay(addDays(new Date(), 7)).getTime();
    return d.getTime() > from && d.getTime() <= to;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function formatDue(v) {
    var d = parseDate(v);
    if (!d) return '';
    var now = new Date();
    var hhmm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (sameDay(d, now)) return '今天 ' + hhmm;
    if (sameDay(d, addDays(now, 1))) return '明天 ' + hhmm;
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hhmm;
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hhmm;
  }
  /* elapsed time of a task: banked milliseconds plus the running span */
  function spentOf(todo, now) {
    var base = Math.max(0, Number(todo && todo.spentMs) || 0);
    if (!todo || !todo.timerStartedAt) return base;
    var started = new Date(todo.timerStartedAt).getTime();
    if (!isFinite(started)) return base;
    return base + Math.max(0, (now || Date.now()) - started);
  }

  function formatSpent(ms) {
    var total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var sec = total % 60;
    return h > 0 ? (h + ':' + pad2(m) + ':' + pad2(sec)) : (pad2(m) + ':' + pad2(sec));
  }

  function runningId(state) {
    var list = (state && state.todos) || [];
    for (var i = 0; i < list.length; i++) if (list[i].timerStartedAt) return list[i].id;
    return null;
  }

  function toLocalInput(v) {
    var d = parseDate(v);
    if (!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fromLocalInput(v) {
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function priorityRank(p) { return p === 'high' ? 0 : p === 'med' ? 1 : p === 'low' ? 2 : 3; }
  function colorOf(state, groupId) {
    var g = groupById(state, groupId);
    return (g && PALETTE[g.color]) || PALETTE.brick;
  }
  function weekdayName(v) {
    var d = parseDate(v);
    return d ? WEEKDAY_CN[d.getDay()] : '';
  }
  function repeatText(todo) {
    if (!todo || !todo.repeat || todo.repeat === 'none') return '';
    var due = parseDate(todo.dueAt);
    var base = '';
    if (todo.repeat === 'daily') base = '每天';
    else if (todo.repeat === 'weekly') base = due ? '每周' + WEEKDAY_CN[due.getDay()] : '每周';
    else if (todo.repeat === 'monthly') base = due ? '每月' + due.getDate() + '日' : '每月';
    else if (todo.repeat === 'yearly') {
      if (todo.lunar) {
        var LN = (typeof NeonLunar !== 'undefined' ? NeonLunar : null);
        base = '每年农历' + (LN && LN.lunarName ? LN.lunarName(todo.lunar.month, todo.lunar.day) : (todo.lunar.month + '月' + todo.lunar.day + '日'));
      }
      else base = due ? '每年' + (due.getMonth() + 1) + '月' + due.getDate() + '日' : '每年';
    } else {
      base = REPEAT_LABEL[todo.repeat] || '';
    }
    if (todo.repeatCount) return base + ' · 共' + todo.repeatCount + '次';
    var until = parseDate(todo.repeatUntil);
    if (until) {
      var now = new Date();
      var short = (until.getFullYear() === now.getFullYear())
        ? (until.getMonth() + 1) + '/' + until.getDate()
        : until.getFullYear() + '/' + (until.getMonth() + 1) + '/' + until.getDate();
      return base + ' · 至' + short;
    }
    return base;
  }
  function dayKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function hourKey(d) {
    return dayKey(d) + 'T' + pad2(d.getHours());
  }

  /* ---------------------------------------------------------------- defaults */

  function defaultGroupId() { return 'g_inbox'; }

  function defaultState() {
    var now = Date.now();
    var soon = new Date(now + 2 * 3600e3).toISOString();
    var tomorrow = new Date(now + 26 * 3600e3).toISOString();
    function g(id, name, color, order, locked) {
      return { id: id, name: name, color: color, order: order, locked: !!locked, createdAt: isoNow() };
    }
    function t(groupId, title, extra, order) {
      return Object.assign({
        id: uid('t'), groupId: groupId, title: title, notes: '', done: false,
        priority: 'none', repeat: 'none', tags: [], createdAt: isoNow(), updatedAt: isoNow(),
        completedAt: null, dueAt: null, order: order, remindedAt: null, pinned: false
      }, extra || {});
    }
    return {
      version: VERSION,
      createdAt: isoNow(),
      groups: [
        g('g_temp', '临时 TEMP', 'vermillion', 0, true),
        g('g_inbox', '收件箱 INBOX', 'sage', 1),
        g('g_work', '工作 WORK', 'brick', 2),
        g('g_life', '生活 LIFE', 'forest', 3)
      ],
      todos: [
        t('g_inbox', '把鼠标悬停到屏幕边缘的卡片堆上', {
          notes: '悬停＝概览展开；点击＝卡片散布到桌面各处。',
          priority: 'high', dueAt: soon
        }, -5),
        t('g_inbox', '再次点击留在原地的卡片，可收回散布的卡片', {
          notes: '散布后每张卡片悬停会像 macOS 程序坞一样放大。',
          priority: 'med'
        }, -4),
        t('g_work', '设计 DASHBOARD 1971 的印刷配色', {
          notes: '砖红 / 森林绿 / 石板蓝 + 米白底、1px 黑描边。',
          priority: 'med', dueAt: tomorrow
        }, -3),
        t('g_work', '整理下周的发布清单', { priority: 'low' }, -2),
        t('g_life', '晚上 8 点去跑步', { notes: '5 公里，别偷懒。', priority: 'low', repeat: 'daily' }, -1)
      ],
      settings: {
        edge: 'right',
        overlay: true,
        alwaysOnTop: true,
        launchAtLogin: false,
        reminders: true,
        opacity: 1,
        animations: true,
        shortcuts: true,
        hideCompleted: true,
        pinned: false,
        activeGroupId: 'g_inbox',
        hotkey: 'Control+Alt+T',
        dockScale: 1,
        autoScale: true,
        desktopOnly: false,
        dockPos: 0.5,
        deckScale: 1,
        cardScale: 1.15,
        uiScale: 1.3,
        dockMovable: true,
        sideWidth: 286,
        sideCollapsed: false,
        sound: true,
        cardFontScale: 1.15,
        chipFontScale: 1,
        dockAutoTuck: true,
        theme: 'paper',
        /* the material of the whole UI, independent of the hour: 'print' is the 1971
           terminal sheet, 'diner' the Googie console. Anything unknown falls back. */
        style: 'print',
        palette: { paper: {}, ink: {} },
        scaleDefaults: 2,
        /* the dashboard scratch pad: a list of saved lines, not one blob of text, and
           the day the pomodoro count belongs to so it resets on its own */
        memo: [],
        pomoDate: '',
        pomoCount: 0
      },
      placements: {},
      /* one row per stopwatch run, so the timeline can show when the
         time was actually spent rather than only the running total */
      timeEntries: []
    };
  }

  /* ---------------------------------------------------------------- normalize */

  function groupById(state, id) {
    if (!state || !state.groups) return null;
    for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === id) return state.groups[i];
    return null;
  }
  function todoById(state, id) {
    if (!state || !state.todos) return null;
    for (var i = 0; i < state.todos.length; i++) if (state.todos[i].id === id) return state.todos[i];
    return null;
  }

  function normalize(raw) {
    var def = defaultState();
    var s = (raw && typeof raw === 'object') ? raw : {};
    var out = { version: VERSION, createdAt: s.createdAt || def.createdAt };

    out.groups = Array.isArray(s.groups) ? s.groups.filter(Boolean).map(function (gr, i) {
      return {
        id: String(gr.id || uid('g')),
        name: String(gr.name == null ? ('分组 ' + (i + 1)) : gr.name),
        color: COLOR_KEYS.indexOf(gr.color) >= 0 ? gr.color : COLOR_KEYS[i % COLOR_KEYS.length],
        order: typeof gr.order === 'number' ? gr.order : i,
        locked: gr.locked === true,
        createdAt: gr.createdAt || isoNow()
      };
    }) : clone(def.groups);
    if (!out.groups.length) out.groups = clone(def.groups);
    /* the temp deck always exists and cannot be removed */
    if (!out.groups.some(function (gr) { return gr.id === TEMP_GROUP_ID; })) {
      out.groups.unshift({ id: TEMP_GROUP_ID, name: '临时 TEMP', color: 'vermillion', order: -1, locked: true, createdAt: isoNow() });
    }
    out.groups.forEach(function (gr) {
      gr.locked = gr.id === TEMP_GROUP_ID;
      if (gr.locked && !/临时/.test(gr.name)) gr.name = '临时 TEMP';
    });

    var ids = {};
    out.groups.forEach(function (gr) { ids[gr.id] = true; });

    out.todos = Array.isArray(s.todos) ? s.todos.filter(Boolean).map(function (t, i) {
      return {
        id: String(t.id || uid('t')),
        groupId: ids[t.groupId] ? t.groupId : out.groups[0].id,
        title: String(t.title == null ? '未命名任务' : t.title),
        notes: String(t.notes == null ? '' : t.notes),
        done: !!t.done,
        priority: PRIORITIES.indexOf(t.priority) >= 0 ? t.priority : 'none',
        repeat: REPEATS.indexOf(t.repeat) >= 0 ? t.repeat : 'none',
        repeatUntil: t.repeatUntil || null,
        repeatCount: typeof t.repeatCount === 'number' && t.repeatCount > 0 ? Math.floor(t.repeatCount) : null,
        repeatDone: typeof t.repeatDone === 'number' && t.repeatDone > 0 ? Math.floor(t.repeatDone) : 0,
        lunar: t.lunar && t.lunar.month ? { month: Number(t.lunar.month), day: Number(t.lunar.day) } : null,
        tags: Array.isArray(t.tags) ? t.tags.map(String).slice(0, 8) : [],
        createdAt: t.createdAt || isoNow(),
        updatedAt: t.updatedAt || t.createdAt || isoNow(),
        completedAt: t.completedAt || null,
        dueAt: t.dueAt || null,
        order: typeof t.order === 'number' ? t.order : i,
        remindedAt: t.remindedAt || null,
        spentMs: Math.max(0, Number(t.spentMs) || 0),
        timerStartedAt: t.timerStartedAt || null,
        pinned: !!t.pinned,
        spawnedFrom: t.spawnedFrom || null
      };
    }) : clone(def.todos);

    var settings = clone(def.settings);
    if (s.settings && typeof s.settings === 'object') {
      SETTING_KEYS.forEach(function (k) {
        var v = s.settings[k];
        if (v !== undefined && v !== null) settings[k] = v;
      });
    }
    if (EDGES.indexOf(settings.edge) < 0) settings.edge = 'right';
    /* Resolved on the way in, not only when a settings write happens: the material is
       carried in the data file, so a load has to be able to translate it or the desk boots
       with a data-style nothing matches and every material rule in the sheet misses. */
    settings.style = styleKey(settings.style);
    settings.opacity = Math.min(1, Math.max(0.3, Number(settings.opacity) || 1));
    settings.dockScale = Math.min(2, Math.max(0.6, Number(settings.dockScale) || 1));
    settings.overlay = settings.overlay !== false;
    settings.alwaysOnTop = settings.alwaysOnTop !== false;
    settings.reminders = settings.reminders !== false;
    settings.animations = settings.animations !== false;
    settings.shortcuts = settings.shortcuts !== false;
    settings.hideCompleted = settings.hideCompleted !== false;
    settings.autoScale = settings.autoScale !== false;
    settings.desktopOnly = settings.desktopOnly === true;
    settings.pinned = !!settings.pinned;
    /* Simplified cards: the scattered sheet keeps only its title, in a larger face. The
       badges (priority, repeat, due, group) are the interesting thing to hide, so the flag
       lives with the deck rather than with each card. */
    settings.simple = settings.simple === true;
    /* the interface mute. The receipt machine's own sounds are not under it: a printer that
       goes quiet because the UI did is not a printer. */
    settings.muted = settings.muted === true;
    /* which display the deck lives on. -1 means "wherever the work area is", so a machine
       that has never picked a screen keeps behaving as it always did. */
    settings.deckMonitor = Number.isFinite(Number(settings.deckMonitor)) ? Math.floor(Number(settings.deckMonitor)) : -1;
    /* The timed print must never fire from a schedule that cannot be parsed, and never
       from a half-written setting left by an older build: 开关 only means 开关 when the
       time is a real HH:MM. */
    var rp = settings.receipt && typeof settings.receipt === 'object' ? settings.receipt : {};
    var atOk = /^\d{2}:\d{2}$/.test(String(rp.at || ''));
    settings.receipt = {
      on: rp.on === true && atOk,
      at: atOk ? String(rp.at) : '21:30',
      dir: typeof rp.dir === 'string' ? rp.dir.slice(0, 260) : '',
      /* the share background is an id, not a colour: anything else (a stale build, a hand
         edited file) falls back to the one the reference sheet used */
      bg: ['none', 'rose', 'cream', 'paper', 'brick', 'ink'].indexOf(rp.bg) >= 0 ? rp.bg : 'rose'
    };
    /* v2 settings: dock position + split deck/card sizes + interface scale */
    if (s.settings && typeof s.settings === 'object' &&
      s.settings.cardScale === undefined && s.settings.deckScale === undefined && s.settings.dockScale !== undefined) {
      settings.cardScale = Number(s.settings.dockScale) || 1;
    }
    settings.dockPos = isFinite(settings.dockPos) ? Number(settings.dockPos) : 0.5;
    settings.dockPos = Math.min(1, Math.max(0, settings.dockPos));
    /* v8: bigger default sizes — carry untouched old defaults forward once */
    if (Number(settings.scaleDefaults) !== 2) {
      if (Number(settings.uiScale) === 1.15) settings.uiScale = 1.3;
      if (Number(settings.cardScale) === 1) settings.cardScale = 1.15;
      if (Number(settings.cardFontScale) === 1) settings.cardFontScale = 1.15;
      settings.scaleDefaults = 2;
    }
    settings.deckScale = Math.min(2.5, Math.max(0.5, Number(settings.deckScale) || 1));
    settings.cardScale = Math.min(2.5, Math.max(0.5, Number(settings.cardScale) || 1.15));
    settings.uiScale = Math.min(2, Math.max(0.8, Number(settings.uiScale) || 1.3));
    settings.dockMovable = settings.dockMovable !== false;
    settings.sideWidth = Math.min(520, Math.max(220, Number(settings.sideWidth) || 286));
    settings.sideCollapsed = settings.sideCollapsed === true;
    settings.sound = settings.sound !== false;
    /* two palettes only; anything else falls back to the paper one rather
       than leaving the app half-styled */
    settings.theme = settings.theme === 'ink' ? 'ink' : 'paper';
    /* per-theme colour overrides: two plain maps of CSS custom property to hex.
       Anything malformed is dropped rather than written onto the root, because a bad
       value there silently breaks every derived token at once */
    var pal = settings.palette && typeof settings.palette === 'object' ? settings.palette : {};
    var clean = {};
    ['paper', 'ink'].forEach(function (t) {
      var bag = pal[t] && typeof pal[t] === 'object' ? pal[t] : {};
      var out = {};
      Object.keys(bag).forEach(function (k) {
        if (/^--[a-z0-9-]+$/.test(k) && /^#[0-9a-fA-F]{3,8}$/.test(bag[k])) out[k] = bag[k];
      });
      clean[t] = out;
    });
    settings.palette = clean;
    settings.cardFontScale = Math.min(1.6, Math.max(0.8, Number(settings.cardFontScale) || 1.15));
    settings.chipFontScale = Math.min(1.6, Math.max(0.8, Number(settings.chipFontScale) || 1));
    settings.dockAutoTuck = settings.dockAutoTuck !== false;
    settings.hotkey = String(settings.hotkey == null ? 'Control+Alt+T' : settings.hotkey);
    if (!ids[settings.activeGroupId]) {
      settings.activeGroupId = out.todos[0] ? out.todos[0].groupId : out.groups[0].id;
    }
    out.settings = settings;

    out.timeEntries = Array.isArray(s.timeEntries) ? s.timeEntries.filter(function (e) {
      return e && e.todoId && e.start && isFinite(new Date(e.start).getTime());
    }).slice(-4000).map(function (e) {
      var st = new Date(e.start).getTime();
      var en = e.end ? new Date(e.end).getTime() : null;
      if (en !== null && !isFinite(en)) en = null;
      return {
        id: String(e.id || uid('te')),
        todoId: String(e.todoId),
        start: new Date(st).toISOString(),
        end: en === null ? null : new Date(en).toISOString(),
        ms: Math.max(0, Number(e.ms) || (en !== null ? Math.max(0, en - st) : 0))
      };
    }) : [];

    out.placements = {};
    if (s.placements && typeof s.placements === 'object') {
      Object.keys(s.placements).forEach(function (k) {
        var p = s.placements[k];
        if (p && isFinite(p.x) && isFinite(p.y)) {
          out.placements[k] = { x: Number(p.x), y: Number(p.y), rot: Number(p.rot) || 0, z: Number(p.z) || 0, pinned: !!p.pinned };
        }
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------- helpers for ops */

  function minOrder(state, groupId) {
    var m = 0, any = false;
    state.todos.forEach(function (t) {
      if (groupId && t.groupId !== groupId) return;
      if (!any || t.order < m) { m = t.order; any = true; }
    });
    return any ? m : 0;
  }
  function maxGroupOrder(state) {
    var m = -1;
    state.groups.forEach(function (gr) { if (gr.order > m) m = gr.order; });
    return m;
  }
  function nextColor(state) {
    var used = {};
    state.groups.forEach(function (gr) { used[gr.color] = true; });
    for (var i = 0; i < COLOR_KEYS.length; i++) if (!used[COLOR_KEYS[i]]) return COLOR_KEYS[i];
    return COLOR_KEYS[state.groups.length % COLOR_KEYS.length];
  }
  function shiftDue(base, repeat) {
    if (repeat === 'daily') return addDays(base, 1);
    if (repeat === 'weekly') return addDays(base, 7);
    if (repeat === 'monthly') return addMonths(base, 1);
    if (repeat === 'yearly') return addMonths(base, 12);
    return null;
  }

  /* next occurrence of a repeating task, honouring lunar yearly repeats */
  function nextOccurrence(source, from) {
    var base = parseDate(from) || parseDate(source.dueAt) || new Date();
    if (source.repeat === 'yearly' && source.lunar && Lunar && Lunar.nextLunarOccurrence) {
      var lunarDate = Lunar.nextLunarOccurrence(source.lunar.month, source.lunar.day, addDays(base, 1));
      if (lunarDate) {
        lunarDate.setHours(base.getHours(), base.getMinutes(), 0, 0);
        return lunarDate;
      }
    }
    var next = shiftDue(base, source.repeat);
    if (!next) return null;
    var guard = 0;
    while (next.getTime() <= Date.now() && guard++ < 400) {
      var step = shiftDue(next, source.repeat);
      if (!step) break;
      next = step;
    }
    return next;
  }
  function replaceInPlace(target, src) {
    target.version = VERSION;
    target.createdAt = src.createdAt || isoNow();
    target.groups = src.groups;
    target.todos = src.todos;
    target.settings = src.settings;
    target.placements = src.placements;
    return target;
  }

  /* ---------------------------------------------------------------- ops */

  var OPS = {
    'todo:add': function (s, p) {
      var title = String(p.title == null ? '' : p.title).trim();
      if (!title) throw new Error('empty-title');
      var gr = groupById(s, p.groupId) || s.groups[0];
      var todo = {
        id: uid('t'),
        groupId: gr.id,
        title: title,
        notes: String(p.notes == null ? '' : p.notes),
        done: false,
        priority: PRIORITIES.indexOf(p.priority) >= 0 ? p.priority : 'none',
        repeat: REPEATS.indexOf(p.repeat) >= 0 ? p.repeat : 'none',
        repeatUntil: p.repeatUntil || null,
        repeatCount: typeof p.repeatCount === 'number' && p.repeatCount > 0 ? Math.floor(p.repeatCount) : null,
        repeatDone: 0,
        lunar: p.lunar && p.lunar.month ? { month: Number(p.lunar.month), day: Number(p.lunar.day) } : null,
        tags: Array.isArray(p.tags) ? p.tags.map(String).slice(0, 8) : [],
        createdAt: isoNow(),
        updatedAt: isoNow(),
        completedAt: null,
        dueAt: p.dueAt || null,
        order: minOrder(s, gr.id) - 1,
        remindedAt: null,
        spentMs: 0,
        timerStartedAt: null,
        pinned: false
      };
      s.todos.unshift(todo);
      if (p.activate !== false) s.settings.activeGroupId = gr.id;
      return { id: todo.id, groupId: gr.id };
    },

    'todo:update': function (s, p) {
      var t = todoById(s, p.id);
      if (!t) throw new Error('not-found');
      var patch = p.patch || {};
      if ('title' in patch) {
        var title = String(patch.title == null ? '' : patch.title).trim();
        if (title) t.title = title;
      }
      if ('notes' in patch) t.notes = String(patch.notes == null ? '' : patch.notes);
      if ('groupId' in patch && groupById(s, patch.groupId)) {
        if (t.groupId !== patch.groupId) {
          t.groupId = patch.groupId;
          t.order = minOrder(s, t.groupId) - 1;
        }
      }
      if ('priority' in patch && PRIORITIES.indexOf(patch.priority) >= 0) t.priority = patch.priority;
      if ('repeat' in patch && REPEATS.indexOf(patch.repeat) >= 0) t.repeat = patch.repeat;
      if ('repeatUntil' in patch) t.repeatUntil = patch.repeatUntil || null;
      if ('repeatCount' in patch) t.repeatCount = typeof patch.repeatCount === 'number' && patch.repeatCount > 0 ? Math.floor(patch.repeatCount) : null;
      if ('repeatDone' in patch && typeof patch.repeatDone === 'number') t.repeatDone = Math.max(0, Math.floor(patch.repeatDone));
      if ('lunar' in patch) t.lunar = patch.lunar && patch.lunar.month ? { month: Number(patch.lunar.month), day: Number(patch.lunar.day) } : null;
      if ('tags' in patch) t.tags = Array.isArray(patch.tags) ? patch.tags.map(String).slice(0, 8) : [];
      if ('order' in patch && typeof patch.order === 'number') t.order = patch.order;
      if ('pinned' in patch) t.pinned = !!patch.pinned;
      if ('dueAt' in patch) {
        t.dueAt = patch.dueAt || null;
        t.remindedAt = null;
      }
      if ('done' in patch) {
        t.done = !!patch.done;
        t.completedAt = t.done ? (t.completedAt || isoNow()) : null;
        if (!t.done) t.remindedAt = null;
      }
      /* the reminder tick moved into the renderer with the reducer, so stamping a
         reminder has to be expressible as an op rather than a main-process poke */
      if ('remindedAt' in patch) t.remindedAt = patch.remindedAt || null;
      t.updatedAt = isoNow();
      return {};
    },

    'todo:toggle': function (s, p) {
      var t = todoById(s, p.id);
      if (!t) throw new Error('not-found');
      var spawned = null;
      var removed = null;
      if (!t.done) {
        t.done = true;
        t.completedAt = isoNow();
        if (t.repeat && t.repeat !== 'none') spawned = spawnRepeat(s, t);
      } else {
        t.done = false;
        t.completedAt = null;
        t.remindedAt = null;
        /* undo the pending occurrence so re-completing never piles up duplicates */
        removed = removeSpawned(s, t.id);
      }
      t.updatedAt = isoNow();
      var res = {};
      if (spawned) res.spawned = spawned.id;
      if (removed) res.removed = removed;
      return res;
    },

    'todo:delete': function (s, p) {
      if (s.timeEntries) s.timeEntries = s.timeEntries.filter(function (e) { return e.todoId !== p.id; });
      var i = s.todos.findIndex ? s.todos.findIndex(function (t) { return t.id === p.id; }) : -1;
      if (i < 0) { // fallback for old engines
        for (var k = 0; k < s.todos.length; k++) if (s.todos[k].id === p.id) { i = k; break; }
      }
      if (i < 0) throw new Error('not-found');
      s.todos.splice(i, 1);
      delete s.placements[p.id];
      return {};
    },

    'todo:move': function (s, p) {
      var t = todoById(s, p.id);
      var gr = groupById(s, p.groupId);
      if (!t || !gr) throw new Error('not-found');
      t.groupId = gr.id;
      t.order = minOrder(s, gr.id) - 1;
      t.updatedAt = isoNow();
      return {};
    },

    'todo:reorder': function (s, p) {
      (p.ids || []).forEach(function (id, i) {
        var t = todoById(s, id);
        if (t) t.order = i;
      });
      return {};
    },

    'todo:clearCompleted': function (s) {
      s.todos = s.todos.filter(function (t) {
        if (t.done) { delete s.placements[t.id]; return false; }
        return true;
      });
      return {};
    },

    /* one timer at a time: starting B banks A's elapsed time and pauses it;
       clicking the running task again stops it and adds to the total */
    'todo:timer': function (s, p) {
      var target = todoById(s, p.id);
      if (!target) throw new Error('not-found');
      var now = Date.now();
      var wasRunning = !!target.timerStartedAt;
      s.todos.forEach(function (t) {
        if (!t.timerStartedAt) return;
        var started = new Date(t.timerStartedAt).getTime();
        if (isFinite(started)) t.spentMs = Math.max(0, Number(t.spentMs) || 0) + Math.max(0, now - started);
        t.timerStartedAt = null;
        t.updatedAt = isoNow();
      });
      /* mirror the run into the log: closing the open entry is what banks the time,
         and opening one is what makes the timeline able to draw it */
      if (!s.timeEntries) s.timeEntries = [];
      var open = null;
      for (var oi = s.timeEntries.length - 1; oi >= 0; oi--) {
        if (!s.timeEntries[oi].end) { open = s.timeEntries[oi]; break; }
      }
      if (open) {
        open.end = new Date(now).toISOString();
        open.ms = Math.max(0, now - new Date(open.start).getTime());
      }
      if (!wasRunning) {
        target.timerStartedAt = isoNow();
        target.updatedAt = isoNow();
        s.timeEntries.push({ id: uid('te'), todoId: target.id, start: target.timerStartedAt, end: null, ms: 0 });
      }
      return { running: target.timerStartedAt ? target.id : null, spentMs: Math.max(0, Number(target.spentMs) || 0) };
    },

    /* Dropping a run also un-banks it from the task total, or the number and the
       timeline would disagree forever. A run still open is simply abandoned. */
    /* A run placed by hand on the timeline, as opposed to one the stopwatch produced.
       It still has to move the task's total, or the two figures drift apart. */
    'timer:add': function (s, p) {
      var t = todoById(s, p.id);
      if (!t) throw new Error('not-found');
      var st = new Date(p.start).getTime();
      var en = p.end === null || p.end === undefined ? null : new Date(p.end).getTime();
      if (!isFinite(st)) throw new Error('bad-start');
      if (en !== null && (!isFinite(en) || en <= st)) throw new Error('bad-range');
      if (!Array.isArray(s.timeEntries)) s.timeEntries = [];
      var e = {
        id: uid('te'), todoId: t.id,
        start: new Date(st).toISOString(),
        end: en === null ? null : new Date(en).toISOString(),
        ms: en === null ? 0 : Math.max(0, en - st)
      };
      s.timeEntries.push(e);
      s.timeEntries.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
      t.spentMs = Math.max(0, (Number(t.spentMs) || 0) + e.ms);
      t.updatedAt = isoNow();
      return { entryId: e.id };
    },

    /* Editing a run — retimed, or moved to another task — rewrites the totals of both
       the old and the new owner, not just the one being pointed at. */
    'timer:update': function (s, p) {
      var list = s.timeEntries || [];
      var e = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === p.entryId) { e = list[i]; break; }
      if (!e) throw new Error('not-found');
      var before = Math.max(0, Number(e.ms) || 0);
      var wasOpen = !e.end;
      var owner = todoById(s, e.todoId);

      var st = p.start === undefined ? new Date(e.start).getTime() : new Date(p.start).getTime();
      var en = p.end === undefined
        ? (e.end ? new Date(e.end).getTime() : null)
        : (p.end === null ? null : new Date(p.end).getTime());
      if (!isFinite(st)) throw new Error('bad-start');
      if (en !== null && (!isFinite(en) || en <= st)) throw new Error('bad-range');

      var nextId = p.todoId === undefined ? e.todoId : p.todoId;
      var next = todoById(s, nextId);
      if (!next) throw new Error('not-found');

      if (owner && !wasOpen) {
        owner.spentMs = Math.max(0, (Number(owner.spentMs) || 0) - before);
        owner.updatedAt = isoNow();
      }
      var ms = en === null ? 0 : Math.max(0, en - st);
      e.start = new Date(st).toISOString();
      e.end = en === null ? null : new Date(en).toISOString();
      e.ms = ms;
      if (next !== owner) {
        e.todoId = next.id;
        /* the stopwatch owns at most one open run; moving it changes its host */
        if (wasOpen && owner) { owner.timerStartedAt = null; owner.updatedAt = isoNow(); }
        if (wasOpen) next.timerStartedAt = e.start;
      }
      if (!wasOpen || !next.timerStartedAt) {
        next.spentMs = Math.max(0, (Number(next.spentMs) || 0) + ms);
      }
      next.updatedAt = isoNow();
      list.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
      return { entryId: e.id };
    },

    'timer:delete': function (s, p) {
      var list = s.timeEntries || [];
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === p.id) { idx = i; break; }
      if (idx < 0) throw new Error('not-found');
      var e = list[idx];
      var owner = todoById(s, e.todoId);
      if (!e.end) {
        if (owner && owner.timerStartedAt) {
          owner.timerStartedAt = null;
          owner.updatedAt = isoNow();
        }
      } else if (owner) {
        owner.spentMs = Math.max(0, (Number(owner.spentMs) || 0) - Math.max(0, e.ms));
        owner.updatedAt = isoNow();
      }
      list.splice(idx, 1);
      return {};
    },

    'group:add': function (s, p) {
      var gr = {
        id: uid('g'),
        name: String(p.name == null || !String(p.name).trim() ? '新分组 ' + (s.groups.length + 1) : p.name).trim(),
        color: COLOR_KEYS.indexOf(p.color) >= 0 ? p.color : nextColor(s),
        order: maxGroupOrder(s) + 1,
        createdAt: isoNow()
      };
      s.groups.push(gr);
      if (p.activate !== false) s.settings.activeGroupId = gr.id;
      return { id: gr.id, color: gr.color };
    },

    'group:update': function (s, p) {
      var gr = groupById(s, p.id);
      if (!gr) throw new Error('not-found');
      var patch = p.patch || {};
      if ('name' in patch) {
        var name = String(patch.name == null ? '' : patch.name).trim();
        if (name) gr.name = name;
      }
      if ('color' in patch && COLOR_KEYS.indexOf(patch.color) >= 0) gr.color = patch.color;
      if ('order' in patch && typeof patch.order === 'number') gr.order = patch.order;
      return {};
    },

    'group:delete': function (s, p) {
      if (s.groups.length <= 1) throw new Error('last-group');
      var i = -1;
      for (var k = 0; k < s.groups.length; k++) if (s.groups[k].id === p.id) { i = k; break; }
      if (i < 0) throw new Error('not-found');
      if (s.groups[i].locked) throw new Error('locked-group');
      var removed = s.groups[i];
      s.groups.splice(i, 1);
      var fallback = s.groups[0];
      s.todos.forEach(function (t) { if (t.groupId === removed.id) t.groupId = fallback.id; });
      if (s.settings.activeGroupId === removed.id) s.settings.activeGroupId = fallback.id;
      return { movedTo: fallback.id };
    },

    'placement:set': function (s, p) {
      if (!todoById(s, p.todoId)) throw new Error('not-found');
      var cur = s.placements[p.todoId] || { x: 0, y: 0, rot: 0, z: 0, pinned: false };
      s.placements[p.todoId] = {
        x: isFinite(p.x) ? Number(p.x) : cur.x,
        y: isFinite(p.y) ? Number(p.y) : cur.y,
        rot: isFinite(p.rot) ? Number(p.rot) : cur.rot,
        z: isFinite(p.z) ? Number(p.z) : cur.z,
        pinned: 'pinned' in p ? !!p.pinned : !!cur.pinned
      };
      return {};
    },

    'placement:delete': function (s, p) {
      delete s.placements[p.todoId];
      return {};
    },

    /* Pin one task's card to the desk from the ledger. The panel does not know the
       desk's geometry, so a card that has never been out gets a 0,0 spot, which the
       card layer reads as "place me yourself" and writes back once. */
    'todo:deploy': function (s, p) {
      var t = todoById(s, p.id);
      if (!t) throw new Error('not-found');
      var cur = s.placements[t.id];
      if (cur && cur.pinned) {
        s.placements[t.id] = { x: cur.x, y: cur.y, rot: cur.rot, z: cur.z, pinned: false };
        return { pinned: false };
      }
      s.placements[t.id] = {
        x: cur ? cur.x : 0, y: cur ? cur.y : 0,
        rot: cur ? cur.rot : 0, z: cur ? cur.z : 0,
        pinned: true
      };
      return { pinned: true };
    },

    'placements:reset': function (s, p) {
      if (!p.groupId) {
        /* pinned cards keep their spot: "repack" must not unpin the desk */
        Object.keys(s.placements).forEach(function (k) {
          if (!(s.placements[k] && s.placements[k].pinned)) delete s.placements[k];
        });
        return {};
      }
      s.todos.forEach(function (t) {
        if (t.groupId === p.groupId && !(s.placements[t.id] && s.placements[t.id].pinned)) delete s.placements[t.id];
      });
      return {};
    },

    'settings:reset': function (s) {
      /* restore every user-changeable setting; tasks and groups are kept */
      var def = defaultState().settings;
      var active = s.settings.activeGroupId;
      s.settings = def;
      s.settings.activeGroupId = groupById(s, active) ? active : s.groups[0].id;
      return {};
    },

    'settings:update': function (s, p) {
      var patch = p.patch || {};
      if ('edge' in patch && EDGES.indexOf(patch.edge) < 0) patch.edge = 'right';
      SETTING_KEYS.forEach(function (k) {
        if (k in patch) s.settings[k] = patch[k];
      });
      if (EDGES.indexOf(s.settings.edge) < 0) s.settings.edge = 'right';
      /* the material is a closed set like the edge: a typo would leave the sheet with a
         data-style nothing matches, which reads as a half-styled window */
      s.settings.style = styleKey(s.settings.style);
      s.settings.opacity = Math.min(1, Math.max(0.3, Number(s.settings.opacity) || 1));
      s.settings.dockScale = Math.min(2, Math.max(0.6, Number(s.settings.dockScale) || 1));
      s.settings.dockPos = Math.min(1, Math.max(0, isFinite(s.settings.dockPos) ? Number(s.settings.dockPos) : 0.5));
      s.settings.deckScale = Math.min(2.5, Math.max(0.5, Number(s.settings.deckScale) || 1));
      s.settings.cardScale = Math.min(2.5, Math.max(0.5, Number(s.settings.cardScale) || 1.15));
      s.settings.uiScale = Math.min(2, Math.max(0.8, Number(s.settings.uiScale) || 1.3));
      s.settings.dockMovable = s.settings.dockMovable !== false;
      s.settings.sideWidth = Math.min(520, Math.max(220, Number(s.settings.sideWidth) || 286));
      s.settings.sideCollapsed = s.settings.sideCollapsed === true;
      s.settings.sound = s.settings.sound !== false;
      s.settings.cardFontScale = Math.min(1.6, Math.max(0.8, Number(s.settings.cardFontScale) || 1.15));
      s.settings.chipFontScale = Math.min(1.6, Math.max(0.8, Number(s.settings.chipFontScale) || 1));
      /* one saved line per entry; anything malformed on the way in is dropped rather
         than half-kept, because the pad is rendered straight from this array */
      s.settings.memo = Array.isArray(s.settings.memo) ? s.settings.memo
        .filter(function (m) { return m && typeof m === 'object' && String(m.text || '').trim(); })
        .slice(0, 80)
        .map(function (m) {
          return { id: String(m.id || uid('mm')), text: String(m.text).slice(0, 400), at: String(m.at || isoNow()) };
        }) : [];
      s.settings.pomoCount = Math.max(0, Math.min(99, Number(s.settings.pomoCount) || 0));
      /* the dashboard's assembled layout: which module sits where, how many of the six
         columns it claims and how many rows it takes. Anything unknown is dropped so a
         bad file cannot leave a hole in the grid — and a module the file does not
         mention keeps no entry at all, so the page's own default applies rather than a
         filled-in 2/6 that would silently flatten the grid. */
      /* The grid sizes are validated here rather than in the page, and the page reads the
         same two lists back — the row cap used to live in both places, the reducer's copy
         stopped at 2, and a module dragged to 3 rows was quietly rewritten on the way to
         disk. That is "拉到 3 会自动变成 2", and no amount of raising the page's own list
         could fix it while two sources existed. */
      (function () {
        var dl = s.settings.dashLayout;
        var ids = ['clock', 'stats', 'pomo', 'today', 'memo', 'heat', 'mini'];
        var ok = { order: [], span: {}, row: {} };
        if (dl && Array.isArray(dl.order)) {
          ok.order = dl.order.filter(function (id) { return ids.indexOf(id) >= 0; });
        }
        if (ok.order.length !== ids.length) ok.order = ids.slice();
        ['span', 'row'].forEach(function (key) {
          var allowed = key === 'span' ? DASH_SPANS : DASH_ROWS;
          var bag = dl && dl[key];
          if (!bag) return;
          ids.forEach(function (id) {
            var v = Number(bag[id]);
            if (allowed.indexOf(v) >= 0) ok[key][id] = v;
          });
        });
        s.settings.dashLayout = ok;
      })();
      s.settings.pomoDate = /^\d{4}-\d{2}-\d{2}$/.test(s.settings.pomoDate || '') ? s.settings.pomoDate : '';
      if (!groupById(s, s.settings.activeGroupId)) s.settings.activeGroupId = s.groups[0].id;
      return {};
    },

    'system:reminder': function (s, p) {
      var t = todoById(s, p.id);
      if (t) t.remindedAt = isoNow();
      return {};
    },

    'data:import': function (s, p) {
      replaceInPlace(s, normalize(p.state));
      return {};
    },

    'data:reset': function (s) {
      replaceInPlace(s, defaultState());
      return {};
    }
  };

  function spawnedFor(s, sourceId) {
    for (var i = 0; i < s.todos.length; i++) {
      if (s.todos[i].spawnedFrom === sourceId && !s.todos[i].done) return s.todos[i];
    }
    return null;
  }

  function removeSpawned(s, sourceId) {
    var t = spawnedFor(s, sourceId);
    if (!t) return null;
    /* never delete an occurrence the user has already touched */
    if (t.updatedAt && t.updatedAt !== t.createdAt) return null;
    var i = s.todos.indexOf(t);
    if (i >= 0) s.todos.splice(i, 1);
    delete s.placements[t.id];
    return t.id;
  }

  function spawnRepeat(s, source) {
    if (spawnedFor(s, source.id)) return null; /* one pending occurrence is enough */
    var next = nextOccurrence(source);
    if (!next) next = addDays(parseDate(source.dueAt) || new Date(), 1);
    /* end conditions: until a date, or after N occurrences (TickTick style) */
    var until = parseDate(source.repeatUntil);
    if (until && next.getTime() > endOfDay(until).getTime()) return null;
    var doneCount = typeof source.repeatDone === 'number' ? source.repeatDone : 0;
    /* total occurrences = repeatCount (the original counts as #1) */
    if (source.repeatCount && doneCount + 1 >= source.repeatCount) return null;
    var copy = {
      id: uid('t'),
      groupId: source.groupId,
      title: source.title,
      notes: source.notes,
      done: false,
      priority: source.priority,
      repeat: source.repeat,
      repeatUntil: source.repeatUntil || null,
      repeatCount: source.repeatCount || null,
      repeatDone: doneCount + 1,
      lunar: source.lunar ? { month: source.lunar.month, day: source.lunar.day } : null,
      tags: source.tags.slice(),
      createdAt: isoNow(),
      updatedAt: isoNow(),
      completedAt: null,
      dueAt: next.toISOString(),
      order: minOrder(s, source.groupId) - 1,
      remindedAt: null,
      pinned: false,
      spawnedFrom: source.id
    };
    s.todos.unshift(copy);
    return copy;
  }

  function applyOp(state, op) {
    if (!state || !op || !op.type) return { ok: false, error: 'bad-op' };
    var fn = OPS[op.type];
    if (!fn) return { ok: false, error: 'unknown-op:' + op.type };
    try {
      var extra = fn(state, op) || {};
      state.version = VERSION;
      state.updatedAt = isoNow();
      var out = { ok: true };
      Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
      return out;
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  /* ---------------------------------------------------------------- queries */

  /* the run still on the clock, if any — one at a time by construction */
  function openEntry(state) {
    var list = (state && state.timeEntries) || [];
    for (var i = list.length - 1; i >= 0; i--) if (!list[i].end) return list[i];
    return null;
  }

  /* ms spent on one calendar day, and the runs that fall inside it. A run that is
     still open counts up to now, so the bar grows while you watch it. */
  function entriesOn(state, dayKey, now) {
    var t0 = new Date(dayKey + 'T00:00:00').getTime();
    var t1 = t0 + 86400000;
    var ref = now || Date.now();
    var out = [];
    ((state && state.timeEntries) || []).forEach(function (e) {
      var st = new Date(e.start).getTime();
      var en = e.end ? new Date(e.end).getTime() : Math.min(ref, t1);
      if (!isFinite(st) || st >= t1) return;
      if (en <= t0) return;
      out.push({ entry: e, from: Math.max(st, t0), to: Math.min(en, t1), ms: Math.max(0, Math.min(en, t1) - Math.max(st, t0)) });
    });
    out.sort(function (x, y) { return x.from - y.from; });
    return out;
  }

  function spentOn(state, dayKey, now) {
    return entriesOn(state, dayKey, now).reduce(function (a, r) { return a + r.ms; }, 0);
  }

  function stats(state) {
    var out = { total: 0, open: 0, done: 0, today: 0, overdue: 0, upcoming: 0 };
    (state.todos || []).forEach(function (t) {
      out.total++;
      if (t.done) { out.done++; return; }
      out.open++;
      if (isToday(t)) out.today++;
      if (isOverdue(t)) out.overdue++;
      if (isUpcoming(t)) out.upcoming++;
    });
    return out;
  }

  function sortTodos(list, mode) {
    var arr = list.slice();
    if (mode === 'due') {
      arr.sort(function (a, b) {
        return (parseDate(a.dueAt) ? parseDate(a.dueAt).getTime() : Infinity) -
          (parseDate(b.dueAt) ? parseDate(b.dueAt).getTime() : Infinity) || a.order - b.order;
      });
    } else if (mode === 'priority') {
      arr.sort(function (a, b) { return priorityRank(a.priority) - priorityRank(b.priority) || a.order - b.order; });
    } else if (mode === 'created') {
      arr.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    } else if (mode === 'alpha') {
      arr.sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'); });
    } else {
      arr.sort(function (a, b) {
        var ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        var ad = parseDate(a.dueAt) ? parseDate(a.dueAt).getTime() : Infinity;
        var bd = parseDate(b.dueAt) ? parseDate(b.dueAt).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        var ap = priorityRank(a.priority), bp = priorityRank(b.priority);
        if (ap !== bp) return ap - bp;
        return a.order - b.order;
      });
    }
    return arr;
  }

  function groupTodos(state, groupId, includeDone) {
    return state.todos.filter(function (t) {
      return t.groupId === groupId && (includeDone || !t.done);
    });
  }

  /* ---------------------------------------------------------------- heatmap */

  function completionMap(state) {
    var map = {};
    (state.todos || []).forEach(function (t) {
      if (!t.done || !t.completedAt) return;
      var d = parseDate(t.completedAt);
      if (!d) return;
      var k = dayKey(d);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  function completionMapHours(state, dayK) {
    var map = {};
    (state.todos || []).forEach(function (t) {
      if (!t.done || !t.completedAt) return;
      var d = parseDate(t.completedAt);
      if (!d || dayKey(d) !== dayK) return;
      map[d.getHours()] = (map[d.getHours()] || 0) + 1;
    });
    return map;
  }

  function heatLevel(count, max) {
    if (!count) return 0;
    if (max <= 1) return 4;
    var r = count / max;
    if (r <= 0.25) return 1;
    if (r <= 0.5) return 2;
    if (r <= 0.75) return 3;
    return 4;
  }

  function completionHourMap(state) {
    var map = {};
    (state.todos || []).forEach(function (t) {
      if (!t.done || !t.completedAt) return;
      var d = parseDate(t.completedAt);
      if (!d) return;
      var k = hourKey(d);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  function heatmap(state, mode, anchor) {
    var map = completionMap(state);
    var ref = parseDate(anchor) || new Date();

    if (mode === 'day') {
      var dayK = dayKey(ref);
      var hours = completionMapHours(state, dayK);
      var maxH = 1;
      var totalH = 0;
      var cellsH = [];
      for (var h = 0; h < 24; h++) {
        var c = hours[h] || 0;
        totalH += c;
        if (c > maxH) maxH = c;
        cellsH.push({ hour: h, label: pad2(h) + ':00', count: c, key: dayK + 'T' + pad2(h), level: 0 });
      }
      cellsH.forEach(function (x) { x.level = heatLevel(x.count, maxH); });
      return { mode: 'day', label: dayK, hours: cellsH, total: totalH };
    }

    if (mode === 'week') {
      var hourMap = completionHourMap(state);
      var weekStart = addDays(ref, -ref.getDay());
      var maxW = 1;
      var totalW = 0;
      var daysW = [];
      for (var d = 0; d < 7; d++) {
        var day = addDays(weekStart, d);
        var dk = dayKey(day);
        var cellsW = [];
        for (var hh = 0; hh < 24; hh++) {
          var cw = hourMap[dk + 'T' + pad2(hh)] || 0;
          totalW += cw;
          if (cw > maxW) maxW = cw;
          cellsW.push({ hour: hh, count: cw, key: dk + 'T' + pad2(hh), level: 0 });
        }
        cellsW.forEach(function (x) { x.level = heatLevel(x.count, maxW); });
        daysW.push({
          key: dk, weekday: day.getDay(),
          label: (day.getMonth() + 1) + '/' + day.getDate(),
          cells: cellsW
        });
      }
      return {
        mode: 'week',
        label: (weekStart.getMonth() + 1) + '/' + weekStart.getDate() + ' – ' +
          (addDays(weekStart, 6).getMonth() + 1) + '/' + addDays(weekStart, 6).getDate(),
        days: daysW, total: totalW
      };
    }

    if (mode === 'month') {
      var y = ref.getFullYear();
      var m = ref.getMonth();
      var days = new Date(y, m + 1, 0).getDate();
      var cells = [];
      var maxM = 1;
      var totalM = 0;
      for (var i = 1; i <= days; i++) {
        var d2 = new Date(y, m, i);
        var k2 = dayKey(d2);
        var c2 = map[k2] || 0;
        totalM += c2;
        if (c2 > maxM) maxM = c2;
        cells.push({ key: k2, day: i, weekday: d2.getDay(), count: c2, level: 0 });
      }
      cells.forEach(function (cell) { cell.level = heatLevel(cell.count, maxM); });
      return {
        mode: 'month', label: y + ' / ' + pad2(m + 1),
        firstWeekday: new Date(y, m, 1).getDay(),
        cells: cells, total: totalM
      };
    }

    /* year: 12 month rows × 31 day columns (compact, fixed footprint) */
    var yr = ref.getFullYear();
    var months = [];
    var maxY = 1;
    var totalY = 0;
    for (var mm = 1; mm <= 12; mm++) {
      var dim = new Date(yr, mm, 0).getDate();
      var cellsY = [];
      for (var dd = 1; dd <= 31; dd++) {
        if (dd > dim) {
          cellsY.push({ key: yr + '-' + pad2(mm) + '-' + pad2(dd), day: dd, count: 0, level: 0, isVoid: true });
          continue;
        }
        var ky = yr + '-' + pad2(mm) + '-' + pad2(dd);
        var cy = map[ky] || 0;
        totalY += cy;
        if (cy > maxY) maxY = cy;
        cellsY.push({ key: ky, day: dd, count: cy, level: 0 });
      }
      months.push({ month: mm, label: mm + '月', cells: cellsY });
    }
    months.forEach(function (row) {
      row.cells.forEach(function (cell) { cell.level = cell.isVoid ? 0 : heatLevel(cell.count, maxY); });
    });
    return { mode: 'year', label: String(yr), months: months, total: totalY };
  }

  return {
    VERSION: VERSION,
    PALETTE: PALETTE,
    COLOR_KEYS: COLOR_KEYS,
    PRIORITIES: PRIORITIES,
    PRIORITY_LABEL: PRIORITY_LABEL,
    REPEATS: REPEATS,
    REPEAT_LABEL: REPEAT_LABEL,
    WEEKDAY_CN: WEEKDAY_CN,
    EDGES: EDGES,
    DASH_SPANS: DASH_SPANS,
    DASH_ROWS: DASH_ROWS,
    TEMP_GROUP_ID: TEMP_GROUP_ID,
    repeatText: repeatText,
    weekdayName: weekdayName,
    nextOccurrence: nextOccurrence,
    heatmap: heatmap,
    heatLevel: heatLevel,
    completionMap: completionMap,
    completionHourMap: completionHourMap,
    dayKey: dayKey,
    SETTING_KEYS: SETTING_KEYS,
    uid: uid,
    isoNow: isoNow,
    clone: clone,
    parseDate: parseDate,
    startOfDay: startOfDay,
    endOfDay: endOfDay,
    addDays: addDays,
    addMonths: addMonths,
    sameDay: sameDay,
    isToday: isToday,
    isOverdue: isOverdue,
    isUpcoming: isUpcoming,
    formatDue: formatDue,
    spentOf: spentOf,
    formatSpent: formatSpent,
    runningId: runningId,
    toLocalInput: toLocalInput,
    fromLocalInput: fromLocalInput,
    priorityRank: priorityRank,
    colorOf: colorOf,
    defaultState: defaultState,
    normalize: normalize,
    applyOp: applyOp,
    stats: stats,
    openEntry: openEntry,
    entriesOn: entriesOn,
    spentOn: spentOn,
    sortTodos: sortTodos,
    groupTodos: groupTodos,
    groupById: groupById,
    todoById: todoById,
    lunar: Lunar
  };
});
