/**
 * DASHBOARD 1971 — desktop overlay renderer.
 *
 * Deck interaction model:
 *   STANDBY   cards filed inside the deck (sheet count = cards in the group)
 *   OVERVIEW  hover the deck → compact title-only cards (sized by their title)
 *             spread tightly beside the deck; hovering one lifts it
 *   DEPLOYED  click the deck → squarish cards scatter across the desktop at
 *             remembered positions, the deck stays as the anchor card
 *
 * Clicking a card completes it (flip + dim + check stamp + sound); clicking the
 * completed card again before recalling un-completes it. Double click edits.
 */
(function () {
  'use strict';

  const D = window.NeonData;
  const API = window.API;
  const doc = document;
  const $ = (sel, root) => (root || doc).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || doc).querySelectorAll(sel));

  const DEPLOY_W = 224;
  const DEPLOY_H = 196;
  const COMPACT_H = 40;
  const LEAVE_MS = 130;

  let S = null;
  let area = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  let cs = 1;
  let ds = 1;
  let mode = 'collapsed';
  let activeGroupId = null;
  let modalOpen = false;
  let drag = null;
  let deckDrag = null;
  let suppressClickUntil = 0;
  let ignoring = true;
  let cursorFeed = true;
  let moveCount = 0;
  let lastHit = null;
  let lastPointer = { x: -1, y: -1 };
  let rafPending = false;
  let collapseTimer = null;
  let suppressUntil = 0;
  let pendingRender = false;
  let spread = null;
  let lastSpreadScale = 1;
  let lastDeckSig = '';
  let lastChipsSig = '';
  let dashboardOpen = false;
  let ignoreFrozen = false;
  let testPointerMode = false;
  let clickTimer = null;
  let suppressCardClickUntil = 0;
  let tucked = false;
  let tuckTimer = null;
  let autoTuck = true;
  let popTimer = null;
  let tuckGuardUntil = 0;
  let popGuardUntil = 0;
  let hoverArmed = true;
  let hoverRearmAfter = 0;
  let audioCtx = null;
  let lastSound = '';

  const recentlyDone = new Set();

  const defaultCache = new Map();
  const cleanupTimers = new Map();
  const el = {};

  /* test hooks (used by the scripted self test) */
  window.__nd = {
    freezeIgnore: (v) => { ignoreFrozen = !!v; },
    testPointer: (v) => { testPointerMode = !!v; },
    cursorFeed: (v) => { cursorFeed = !!v; },
    /* the scripted self test pushes a cursor frame through the same path the
       main-process feed uses, without racing the real pointer */
    cursorCmd: (x, y, inside) => {
      lastPointer = { x: x, y: y };
      if (inside !== false) updateHover(x, y);
      queueHitTest();
    },
    /* the whole command branch, so the tucked-approach rule can be probed at a
       measured distance instead of being read off the constants */
    cursorFrame: (x, y, inside) => {
      onCommand({ type: 'cursor', x: x, y: y, inside: inside === true });
    },
    dockRect: () => {
      const r = el.dock ? el.dock.getBoundingClientRect() : null;
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    },
    /* the real invariant the tests care about: would a click here land on us?
       answered from the region when it is live, from the toggle when it is not,
       so the assertions do not have to know which mechanism is switched on */
    swallowsAt: (x, y) => {
      if (shapeOn) {
        const spans = buildSpans();
        if (spans === null) return true;
        for (let i = 0; i < spans.length; i++) {
          const r = spans[i];
          if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) return true;
        }
        return false;
      }
      lastPointer = { x: x, y: y };
      hitTest();
      return !ignoring;
    },
    ignoring: () => ignoring,
    mode: () => mode,
    tuck: (v) => setTucked(!!v),
    hoverInfo: () => ({
      mode: mode, tucked: tucked, armed: hoverArmed,
      rearmIn: Math.round(hoverRearmAfter - Date.now()),
      popGuardIn: Math.round(popGuardUntil - Date.now()),
      tuckGuardIn: Math.round(tuckGuardUntil - Date.now()),
      autoTuck: autoTuck, test: testPointerMode
    }),
    autoTuck: (v) => { autoTuck = !!v; if (!autoTuck) cancelTuck(); },
    /* the region the OS is currently clipping and hit-testing us to */
    shapeOn: () => shapeOn,
    shape: () => buildSpans(),
    region: () => regionCheck(),
    leaks: (all) => regionLeaks(all),
    lag: () => pushedLag(),
    /* the spans the OS was told about, verbatim: a per-frame sampler is the only way to
       see a gap that closes again in three frames */
    pushed: () => (shapePushed ? lastPushed : null),
    hitRects: () => hitRects.length,
    moves: () => moveCount,
    lastHit: () => lastHit,
    probe: (x, y) => {
      const p = (isFinite(x) && isFinite(y)) ? { x: x, y: y } : lastPointer;
      const node = doc.elementFromPoint(p.x, p.y);
      const pad = ignoring ? 8 : 12;
      let inRect = false;
      for (let i = 0; i < hitRects.length; i++) {
        const r = hitRects[i];
        if (p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad) { inRect = true; break; }
      }
      return {
        x: Math.round(p.x), y: Math.round(p.y),
        node: node ? (node.id || node.className || node.tagName) : null,
        interactive: !!(node && node.closest && node.closest('.interactive')),
        inRect: inRect,
        rects: hitRects.map((r) => [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)])
      };
    },
    spread: () => spread,
    debug: () => {
      const list = visibleTodos();
      return {
        mode: mode,
        cs: cs,
        area: { w: Math.round(area.width), h: Math.round(area.height) },
        placements: Object.keys(S.placements),
        items: list.map((t, i) => {
          const p = placementFor(t, i, list.length);
          return { id: t.id, i: i, x: p.x, y: p.y, rot: p.rot };
        }),
        dom: $$('.todo-card', el.cardLayer).map((c) => ({
          id: c.dataset.id,
          rot: c.style.getPropertyValue('--rot'),
          px: c.style.getPropertyValue('--tx'),
          py: c.style.getPropertyValue('--ty')
        }))
      };
    },
    holdArea: () => holdRects().reduce((a, r) => a + Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top), 0),
    lastSound: () => lastSound
  };

  /* ---------------------------------------------------------------- boot */

  init();

  async function init() {
    el.cardLayer = $('#cardLayer');
    el.dock = $('#dock');
    el.deckStack = $('#deckStack');
    el.sheets = $('#deckSheets');
    el.face = $('#deckFace');
    el.index = $('#deckIndex');
    el.count = $('#deckCount');
    el.name = $('#deckName');
    el.meter = $('#deckMeter');
    el.ratio = $('#deckRatio');
    el.tools = $('#dockTools');
    el.toolDashboard = $('#toolDashboard');
    el.toolAutoTuck = $('#toolAutoTuck');
    el.chips = $('#groupChips');
    el.modal = $('#modalRoot');
    el.toast = $('#toastRoot');

    S = await API.getState();
    syncArea();
    activeGroupId = S.settings.activeGroupId || (S.groups[0] && S.groups[0].id);
    doc.body.dataset.mode = mode;

    applyChrome();
    renderAll();
    bindEvents();
    setInterval(tickTimers, 1000);
    setInterval(reminderTick, 20000);
    setTimeout(reminderTick, 3000);

    API.onState(onState);
    API.onCommand(onCommand);
    syncHost();
    applyVisibility();

    requestAnimationFrame(() => {
      renderAll();
      hitTest();
      probeShape();
      reportRender('first-frame');
      setTimeout(() => reportRender('t+2s'), 2000);
      setTimeout(() => reportRender('t+6s'), 6000);
      /* a dead cursor feed and a dead armPop are indistinguishable from the outside,
         so report the chain counters on a slow cadence while this is being debugged */
      let lastChain = '';
      setInterval(() => {
        const d = el.dock ? el.dock.getBoundingClientRect() : null;
        const tail = 'cursor chain: frames=' + cursorFrames + ' near=' + cursorNear +
          ' arms=' + popArms + ' tucked=' + tucked + ' ignoring=' + ignoring +
          ' dock=' + (d ? Math.round(d.left) + ',' + Math.round(d.top) + ' ' + Math.round(d.width) + 'x' + Math.round(d.height) : '-') +
          ' ptr=' + lastPointer.x + ',' + lastPointer.y;
        if (!API.feedStats) { API.bootNote(tail); return; }
        Promise.resolve(API.feedStats()).then((f) => {
          const line = tail + ' | host on=' + (f && f.on) + ' emitted=' + (f && f.emitted) +
            ' off=' + (f && f.off) + ' unchanged=' + (f && f.unchanged) + ' noWin=' + (f && f.no_window) +
            ' emitFail=' + (f && f.emit_fail) + ' layer=' + (f && f.layer && (f.layer.x + ',' + f.layer.y + ' ' + f.layer.width + 'x' + f.layer.height)) +
              ' scale=' + (f && f.scale) + ' cur=' + (f && f.cursor);
          /* only write when something actually changed: a 24/7 widget idling must
             not append a line forever */
          if (line !== lastChain) { lastChain = line; API.bootNote(line); }
        });
      }, 30000);
    });
  }

  /* A pixel probe against a desktop that happens to be paper-coloured proves
     nothing, so ask the renderer what it actually drew. */
  function reportRender(when) {
    if (!API.bootNote) return;
    const cards = $$('.todo-card', el.cardLayer);
    const docked = cards.filter((c) => c.classList.contains('docked')).length;
    const d = el.dock ? el.dock.getBoundingClientRect() : null;
    API.bootNote(when
      + ' mode=' + mode
      + ' tucked=' + tucked
      + ' shown=' + layerShown
      + ' cards=' + cards.length + '/' + docked + '-docked'
      /* hitRects is deliberately not reported: under the region path it is the
         legacy rect array, which excludes the tucked dock and so reads 0 while the
         sliver is live. region= is the truth here. */
      + ' ' + regionCheck() + ' leaks=' + regionLeaks()
      + ' dock=' + (d ? Math.round(d.left) + ',' + Math.round(d.top) + ' ' + Math.round(d.width) + 'x' + Math.round(d.height) : 'none')
      + ' vis=' + document.visibilityState);
  }

  function syncArea() {
    area = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function onResize() {
    syncArea();
    defaultCache.clear();
    computeScale();
    renderAll();
  }

  function onState(next) {
    const structural = !S || S.settings.edge !== next.settings.edge ||
      S.settings.cardScale !== next.settings.cardScale ||
      S.settings.deckScale !== next.settings.deckScale ||
      S.settings.autoScale !== next.settings.autoScale;
    S = next;
    if (!D.groupById(S, activeGroupId)) {
      activeGroupId = S.settings.activeGroupId;
      setMode('collapsed');
    }
    applyChrome();
    if (structural) defaultCache.clear();
    if (Date.now() < suppressUntil) return;
    if (drag || deckDrag) { pendingRender = true; return; }
    renderAll();
    syncHost();
    /* the desktop-only and overlay switches live in the state, so a change to either
       has to re-run the policy -- and the foreground watcher is only started from
       setShown(), which no-ops when visibility itself did not change. It runs whenever
       the layer is on at all: the fullscreen rule needs it even with desktop-only off. */
    applyVisibility();
    if (S.settings.overlay !== false) {
      API.foregroundWatch(true);
    }
  }

  /* ------------------------------------------------ host policy
     In the Electron build these lived in the main process, which owned the state.
     Here the reducer stays in the renderer, so the visibility rule, the reminder
     sweep and the tray/shortcut/autostart summary all live beside it and the host
     is only told what to do. */

  let foregroundKind = 'desktop';
  let foregroundOver = true;
  let foregroundFull = false;
  let forceUntil = 0;
  let cursorFrames = 0;
  let cursorNear = 0;
  let popArms = 0;
  let nearWas = false;
  /* how close the pointer has to come to the tucked dock to wake it. The old rule reused
     the card hover margin — 40 CSS px to the side and 120 above and below — which made the
     deck pop while the cursor was still in the middle of the desktop. */
  const WAKE_X = 14;
  const WAKE_Y = 30;
  /* how far outside the held rects the pointer still counts as "by the deck", used only
     to decide when a manually recalled deck may arm itself again */
  const HOVER_NEAR = 120;
  let layerShown = null;
  let lastSummary = '';

  function setShown(want, opts) {
    opts = opts || {};
    if (layerShown === want) return;
    layerShown = want;
    API.setLayerVisible(want);
    /* both watchers track the *settings*, never the current shown state: turning the
       layer off must not also turn off the only signals that can bring it back */
    API.cursorWatch(S.settings.overlay !== false);
    API.foregroundWatch(S.settings.overlay !== false);
    if (!want) return;
    tuckGuardUntil = Date.now() + 900;
    hoverArmed = true;
    /* coming back on screen is not the same as being woken up. After a film ends the
       pointer is wherever it was left, and popping the whole deck open there is the
       opposite of what the user wanted by hiding it in the first place. */
    if (opts.wake !== false) onCommand({ type: 'awake' });
  }

  /* mirrors applyOverlayVisibility(): the user preference wins, then the desktop-only
     rule, and shell UI in front must never change anything or every taskbar click
     would wake the deck */
  let hiddenBy = '';

  function applyVisibility() {
    if (!S) return;
    if (S.settings.overlay === false) { hiddenBy = 'off'; setShown(false); return; }
    const forced = Date.now() < forceUntil;
    /* a film or a game owns the whole screen. The deck is a desktop ornament and has no
       business being topmost over that, whether or not desktop-only is switched on. */
    if (foregroundFull && !forced) { hiddenBy = 'fullscreen'; setShown(false); return; }
    if (S.settings.desktopOnly === true && !forced) {
      if (foregroundKind === 'shell' || foregroundKind === 'dash') return;
      /* an app on the other monitor is not covering this desktop */
      if (foregroundKind === 'app' && foregroundOver) { hiddenBy = 'desktop'; setShown(false); return; }
    }
    setShown(true, { wake: hiddenBy !== 'fullscreen' });
    hiddenBy = '';
  }

  function syncHost() {
    if (!S || !API.syncHost) return;
    const st = S.settings;
    const summary = {
      openCount: S.todos.filter((t) => !t.done).length,
      overlay: st.overlay !== false,
      desktopOnly: st.desktopOnly === true,
      launchAtLogin: !!st.launchAtLogin,
      shortcuts: st.shortcuts !== false,
      hotkey: String(st.hotkey || ''),
      reminders: st.reminders !== false
    };
    const key = JSON.stringify(summary);
    if (key === lastSummary) return;
    lastSummary = key;
    API.syncHost(summary);
  }

  function onTrayAction(action) {
    const st = S.settings;
    if (action === 'panel') API.toggleDashboard();
    else if (action === 'quick-add') quickAdd();
    else if (action === 'overlay') API.op({ type: 'settings:update', patch: { overlay: !(st.overlay !== false) } });
    else if (action === 'desktop-only') API.op({ type: 'settings:update', patch: { desktopOnly: !(st.desktopOnly === true) } });
    else if (action === 'autostart') API.op({ type: 'settings:update', patch: { launchAtLogin: !st.launchAtLogin } });
    else if (action === 'repack') onCommand({ type: 'reset-layout' });
    else if (action === 'settings') API.openDashboard('settings');
  }

  function quickAdd() {
    if (S.settings.overlay === false) API.op({ type: 'settings:update', patch: { overlay: true } });
    forceUntil = Date.now() + 6000;   /* the modal is ours: only a short grace window */
    applyVisibility();
    onCommand({ type: 'quick-add' });
  }

  /* overdue open tasks get one reminder each: stamp it, wake the deck briefly, and
     raise a system notification */
  function reminderTick() {
    if (!S || S.settings.reminders === false) return;
    const now = Date.now();
    let fired = null;
    S.todos.forEach((t) => {
      if (t.done || !t.dueAt || t.remindedAt || fired) return;
      const due = new Date(t.dueAt).getTime();
      if (isNaN(due) || due > now) return;
      fired = t;
    });
    if (!fired) return;
    API.op({ type: 'todo:update', id: fired.id, patch: { remindedAt: D.isoNow() } });
    forceUntil = Date.now() + 10000;   /* then obey desktop-only again */
    applyVisibility();
    API.notify('PIN TO-DO // 任务到期', fired.title);
  }

  function onCommand(cmd) {
    if (!cmd || !cmd.type) return;
    if (cmd.type === 'quick-add') openTodoModal({});
    else if (cmd.type === 'reset-layout') {
      defaultCache.clear();
      API.op({ type: 'placements:reset', groupId: activeGroupId });
      if (mode !== 'deployed') setMode('deployed'); else renderAll();
      toast('卡片已重新排布 // REPACKED');
    } else if (cmd.type === 'relayout') {
      syncArea();
      defaultCache.clear();
      computeScale();
      renderAll();
    } else if (cmd.type === 'reminder') {
      flashTodo(cmd.id);
    } else if (cmd.type === 'deploy') {
      setMode('deployed');
    } else if (cmd.type === 'recall') {
      setMode('collapsed');
    } else if (cmd.type === 'dashboard-state') {
      dashboardOpen = !!cmd.open;
      updateDashboardTool();
    } else if (cmd.type === 'awake') {
      /* the layer was (re)shown: re-arm the guard and let it tuck itself idle */
      tuckGuardUntil = Date.now() + 900;
      hoverArmed = true;
      popOut();
    } else if (cmd.type === 'tucked') {
      if (cmd.value) tuckGuardUntil = Date.now() + 1400;
      setTucked(!!cmd.value);
    } else if (cmd.type === 'foreground') {
      /* replaces the PowerShell focus-watch child: the host reports what is in
         front, the renderer decides what the layer does about it */
      foregroundKind = cmd.what || 'app';
      foregroundOver = cmd.over !== false;
      foregroundFull = cmd.fullscreen === true;
      applyVisibility();
    } else if (cmd.type === 'tray') {
      onTrayAction(cmd.action);
    } else if (cmd.type === 'cursor') {
      if (!cursorFeed) return;       /* the scripted self test feeds the cursor itself */
      if (testPointerMode) return;   /* …or drives the pointer with synthetic moves */
      const p = { x: cmd.x, y: cmd.y };
      lastPointer = p;
      cursorFrames++;
      if (tucked) {
        /* under Electron this edge-approach check only ever ran off forwarded
           mousemove; Tauri has no forwarding, so the cursor feed has to carry it */
        const rect = el.dock ? rectOfNode(el.dock) : null;
        const near = rect && p.x >= rect.left - WAKE_X && p.x <= rect.right + WAKE_X &&
          p.y >= rect.top - WAKE_Y && p.y <= rect.bottom + WAKE_Y;
        if (near) {
          cursorNear++;
          if (!nearWas) {
            /* the crossing itself is the mouseenter equivalent: pop at once. Waiting
               out armPop's 620 ms guard on every approach is what felt like lag */
            popArms++;
            popOut();
          } else {
            armPop();
          }
          nearWas = true;
        } else {
          cancelArmPop();
          nearWas = false;
        }
      } else if (cmd.inside) {
        /* always evaluate the hover: a pointer that arrives and stops must open the
           spread by itself once the deck has popped out */
        updateHover(p.x, p.y);
      }
      queueHitTest();
    }
  }

  /* ---------------------------------------------------------------- scale + geometry */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function autoFactor() {
    const auto = S.settings.autoScale !== false;
    return auto ? clamp(Math.min(area.width / 1920, area.height / 1080), 0.72, 1.45) : 1;
  }

  function computeScale() {
    const base = autoFactor();
    cs = clamp(base * (Number(S.settings.cardScale) || 1), 0.45, 2.4);
    ds = clamp(base * (Number(S.settings.deckScale) || 1), 0.5, 2);
    doc.body.style.setProperty('--cs', cs.toFixed(3));
    doc.body.style.setProperty('--ds', ds.toFixed(3));
  }

  function fontk() {
    return clamp(Number(S.settings.cardFontScale) || 1.15, 0.8, 1.6);
  }

  function deployW() { return DEPLOY_W * cs * fontk(); }
  function deployH() { return DEPLOY_H * cs * fontk(); }
  function chipk() {
    return clamp(Number(S.settings.chipFontScale) || 1, 0.8, 1.6);
  }

  /* The chip's box is decided by this number, so it has to be the width the title
     really takes at the size the CSS will paint it: 13.5px * --cs * --chipk. The
     per-character estimate this replaces was calibrated at chipk=1, so with the
     user's chipFontScale 1.25 every title measured 13% narrower than the text that
     was about to be laid out in it. The chip then took a second line inside a fixed
     40px, overflow:hidden box — a title sliced clean through the glyphs.
     The --ps spread scale multiplies the font size and --cw together, so it cancels
     out of the measurement. */
  let measureCtx = null;
  let measureFont = '';
  const measureCache = new Map();

  function chipFontSpec() {
    const live = el.cardLayer && $('.card-title', el.cardLayer);
    const ts = live ? getComputedStyle(live) : getComputedStyle(doc.body);
    return (ts.fontWeight || '700') + ' ' + (13.5 * cs * chipk()).toFixed(2) + 'px ' +
      (ts.fontFamily || 'monospace');
  }

  function textWidthPx(text) {
    const font = chipFontSpec();
    if (font !== measureFont) {
      measureFont = font;
      measureCache.clear();
      if (!measureCtx) {
        const cv = doc.createElement('canvas');
        measureCtx = cv.getContext ? cv.getContext('2d') : null;
      }
      if (measureCtx) measureCtx.font = font;
    }
    const key = text + '\u0000' + font;
    let w = measureCache.get(key);
    if (w !== undefined) return w;
    if (measureCtx) {
      w = measureCtx.measureText(text).width;
    } else {
      /* no 2d context: fall back to the old per-glyph estimate, but at the real size */
      const per = 13.5 * cs * chipk();
      w = 0;
      for (const ch of text) {
        w += /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch) ? per : per * 0.6;
      }
    }
    if (measureCache.size > 600) measureCache.clear();
    measureCache.set(key, w);
    return w;
  }

  function compactWidth(title) {
    const t = String(title == null ? '' : title);
    /* the chip is border-box: 9px horizontal padding at --cs (see the overview
       .todo-card.compact rule) plus the unscaled 1px print border on each side */
    const frame = 18 * cs + 2;
    return clamp(textWidthPx(t) + frame + 2, 110 * cs, 560 * cs);
  }

  function compactHeight() {
    /* one line of the chip font, its 7px vertical padding and its border. The old
       constant 40 only held a line at chipk=1, so a bigger chip font had nowhere
       to go but out of the box. */
    return Math.max(COMPACT_H * cs, 13.5 * cs * chipk() * 1.35 + 14 * cs + 2);
  }

  function deckRect() {
    const node = el.deckStack || el.dock;
    return node.getBoundingClientRect();
  }
  function deckCenter() {
    const r = deckRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function inwardDir() {
    const edge = S.settings.edge;
    if (edge === 'right') return { x: -1, y: 0 };
    if (edge === 'left') return { x: 1, y: 0 };
    if (edge === 'top') return { x: 0, y: 1 };
    return { x: 0, y: -1 };
  }
  function isVerticalEdge() {
    return S.settings.edge === 'left' || S.settings.edge === 'right';
  }
  function inflate(r, n) {
    return { left: r.left - n, top: r.top - n, right: r.right + n, bottom: r.bottom + n };
  }
  function union(a, b) {
    return {
      left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom)
    };
  }
  function pointIn(p, r) {
    return !!r && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  }

  function updateDockOrigin() {
    const c = deckCenter();
    doc.body.style.setProperty('--dx', c.x + 'px');
    doc.body.style.setProperty('--dy', c.y + 'px');
  }

  function layoutDock() {
    if (!el.dock || deckDrag) return;
    let pos = Number(S.settings.dockPos);
    if (!isFinite(pos)) pos = 0.5;
    pos = clamp(pos, 0, 1);
    const r = el.dock.getBoundingClientRect();
    if (isVerticalEdge()) {
      const range = Math.max(0, area.height - r.height - 24);
      el.dock.style.top = Math.round(12 + range * pos) + 'px';
      el.dock.style.left = '';
    } else {
      const range = Math.max(0, area.width - r.width - 24);
      el.dock.style.left = Math.round(12 + range * pos) + 'px';
      el.dock.style.top = '';
    }
  }

  /* ---------------------------------------------------------------- mode */

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    markRectsDirty(900);
    doc.body.dataset.mode = next;
    /* The Electron build only needed the cursor poll while the deck was open, since
       forwarded mousemove did the waking there. Under Tauri this feed is the ONLY way
       a collapsed deck is ever approached again, so gating it on mode deadlocks the
       layer: it pops once, collapses, and can never be woken. Track the setting. */
    API.cursorWatch(S.settings.overlay !== false);
    /* the dock origin must be fresh before the cards retarget it */
    updateDockOrigin();
    renderCards();
    updateChrome();
    requestAnimationFrame(() => {
      layoutDock();
      updateDockOrigin();
      refreshHitRects(true);
      queueHitTest();
    });
    /* cards are still flying — refresh once they have landed */
    setTimeout(() => { refreshHitRects(true); hitTest(); }, 430);
  }

  /* putting the cards back may also retract the deck — unless the automatic
     retraction is switched off */
  function tuckAfterRecall() {
    if (S.settings.dockAutoTuck !== false) setTucked(true);
  }

  function toggleDeploy() {
    if (mode === 'deployed') {
      /* the scatter is a transient look at the desk: putting the cards back also
         retracts the deck */
      recall();
      tuckAfterRecall();
      return;
    }
    deploy();
  }

  function deploy() {
    if (!visibleTodos().length) {
      toast('这个分组还没有任务 // EMPTY DECK');
      return;
    }
    defaultCache.clear();
    setMode('deployed');
    toast('卡片已散布 // DEPLOYED');
  }
  function recall() {
    /* recalling means "done looking": stay filed until the pointer clearly
       leaves the deck and the grace period has passed */
    recentlyDone.clear();
    hoverArmed = false;
    hoverRearmAfter = Date.now() + 600;
    setMode('collapsed');
    toast('卡片已收回 // RECALLED');
  }

  function scheduleCollapse() {
    if (modalOpen || drag || deckDrag || mode === 'deployed') return;
    if (collapseTimer) clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
      collapseTimer = null;
      if (modalOpen || drag || deckDrag || mode === 'deployed') return;
      setMode('collapsed');
    }, LEAVE_MS);
  }
  function cancelCollapse() {
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
  }

  function flashTodo(id) {
    setMode('overview');
    const card = $('.todo-card[data-id="' + id + '"]', el.cardLayer);
    if (card) {
      card.classList.add('fresh');
      setTimeout(() => card.classList.remove('fresh'), 700);
    }
  }

  /* ---- tucked state (not on the desktop): the deck retracts to the edge ---- */

  function setTucked(value) {
    cancelTuck();
    applyTuck(!!value);
  }

  function applyTuck(value) {
    if (tucked === value) return;
    if (value) {
      /* file the cards against the current deck position first, then slide the
         deck away — otherwise retracting cards chase a moving target */
      setMode('collapsed');
      cancelCollapse();
      cancelArmPop();
      cancelTuck();
      tucked = true;
      doc.body.classList.add('tucked');
      markRectsDirty(900);
      refreshHitRects(true);
      setTimeout(() => { updateDockOrigin(); refreshHitRects(true); }, 260);
    } else {
      tucked = false;
      doc.body.classList.remove('tucked');
      markRectsDirty(900);
      refreshHitRects(true);
      setTimeout(() => { updateDockOrigin(); hitTest(); refreshHitRects(true); }, 240);
    }
  }

  function popOut() {
    cancelArmPop();
    cancelTuck();
    if (!tucked) return;
    applyTuck(false);
    markRectsDirty(900);
    popGuardUntil = Date.now() + 360;   /* let the pop finish before hover-spread */
    setTimeout(() => { refreshHitRects(true); hitTest(); }, 340);
  }

  function maybeReTuck() {
    /* idle: after a while without the pointer near the deck it retracts itself
       (the automatic retraction can be switched off from the deck toolbar) */
    if (!autoTuck || S.settings.dockAutoTuck === false || tucked || tuckTimer) return;
    tuckTimer = setTimeout(() => {
      tuckTimer = null;
      if (tucked) return;
      const p = lastPointer;
      const near = holdRects().some((r) => pointIn(p, inflate(r, 40)));
      if (!near) applyTuck(true);
    }, 600);
  }

  function cancelTuck() {
    if (tuckTimer) { clearTimeout(tuckTimer); tuckTimer = null; }
  }

  /* while tucked the layer is fully click-through: the pop is triggered by the
     forwarded pointer moves, so clicking behind it can never wake the deck.
     A deliberate hover is required, and any foreground change (taskbar, volume
     flyout, another app) keeps the deck asleep for a while. */
  function armPop() {
    if (popTimer || Date.now() < tuckGuardUntil) return;
    popTimer = setTimeout(() => {
      popTimer = null;
      if (!tucked || Date.now() < tuckGuardUntil) return;
      const rect = el.dock ? rectOfNode(el.dock) : null;
      if (!rect) return;
      const p = lastPointer;
      const near = p.x >= rect.left - 26 && p.x <= rect.right + 26 && p.y >= rect.top - 26 && p.y <= rect.bottom + 26;
      if (near) popOut();
    }, 620);
  }

  function cancelArmPop() {
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
  }

  /* ---------------------------------------------------------------- data helpers */

  function activeGroup() { return D.groupById(S, activeGroupId) || S.groups[0]; }
  function sortedGroups() { return S.groups.slice().sort((a, b) => a.order - b.order); }
  function groupItems(groupId) {
    return D.sortTodos(S.todos.filter((t) => t.groupId === groupId), 'smart');
  }
  function visibleTodos() {
    const hideDone = S.settings.hideCompleted !== false;
    const list = S.todos.filter((t) => {
      /* a pinned card belongs to the desk, not to whichever deck is open: switching
         groups must not sweep it away under the user's hand */
      if (t.groupId !== activeGroupId && !isPinned(t)) return false;
      if (!hideDone) return true;
      /* finished cards stay on the desk until the deck is recalled, so the flip
         animation and the sound can be seen — clicking again undoes it */
      return !t.done || recentlyDone.has(t.id);
    });
    return D.sortTodos(list, 'smart');
  }

  /* ---------------------------------------------------------------- sound */

  function playSound(kind) {
    if (S.settings.sound === false) return;
    lastSound = kind;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime;
      const blip = (freq, at, dur, gain) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + at);
        o.stop(t0 + at + dur + 0.02);
      };
      if (kind === 'done') {
        blip(880, 0, 0.14, 0.10);
        blip(1320, 0.075, 0.2, 0.085);
      } else {
        blip(420, 0, 0.16, 0.08);
      }
    } catch (e) { /* audio unavailable */ }
  }

  /* ---------------------------------------------------------------- render */

  function applyChrome() {
    const st = S.settings;
    D.EDGES.forEach((e) => doc.body.classList.toggle('edge-' + e, st.edge === e));
    doc.body.classList.toggle('no-anim', st.animations === false);
    doc.documentElement.classList.toggle('no-anim', st.animations === false);
    /* the card layer takes the same palette as the panel, user overrides included */
    if (window.NeonTheme) window.NeonTheme.apply(st);
    else doc.documentElement.dataset.theme = st.theme === 'ink' ? 'ink' : 'paper';
    doc.body.style.opacity = String(Math.min(1, Math.max(0.3, Number(st.opacity) || 1)));
    doc.body.style.setProperty('--uis', String(Math.min(2, Math.max(0.8, Number(st.uiScale) || 1.3))));
    doc.body.style.setProperty('--fontk', String(Math.min(1.6, Math.max(0.8, Number(st.cardFontScale) || 1))));
    doc.body.style.setProperty('--chipk', String(Math.min(1.6, Math.max(0.8, Number(st.chipFontScale) || 1))));
    computeScale();
  }

  function renderAll() {
    renderDeck();
    renderChips();
    layoutDock();
    updateDockOrigin();
    renderCards();
    updateDashboardTool();
  }

  function sheetTransform(i, step) {
    const edge = S.settings.edge;
    const k = i + 1;
    const d = step * k;
    const along = -d * 0.35;
    const rot = (i % 2 ? 1 : -1) * (0.7 + i * 0.2);
    if (edge === 'right') return 'translate(' + d.toFixed(1) + 'px,' + along.toFixed(1) + 'px) rotate(' + rot.toFixed(2) + 'deg)';
    if (edge === 'left') return 'translate(' + (-d).toFixed(1) + 'px,' + along.toFixed(1) + 'px) rotate(' + (-rot).toFixed(2) + 'deg)';
    if (edge === 'top') return 'translate(' + along.toFixed(1) + 'px,' + (-d).toFixed(1) + 'px) rotate(' + rot.toFixed(2) + 'deg)';
    return 'translate(' + along.toFixed(1) + 'px,' + d.toFixed(1) + 'px) rotate(' + (-rot).toFixed(2) + 'deg)';
  }

  function renderDeck() {
    const g = activeGroup();
    const accent = D.PALETTE[g.color] || D.PALETTE.brick;
    const items = groupItems(g.id);
    const done = items.filter((t) => t.done).length;
    const open = items.length - done;
    const blocks = 8;
    const filled = items.length ? Math.round(blocks * (done / items.length)) : 0;
    const sheets = Math.min(items.length, 12);

    /* rebuilding the stack/meter is only needed when they actually change */
    const deckSig = [g.id, g.name, accent, items.length, done].join('\u0001');
    if (deckSig !== lastDeckSig) {
      lastDeckSig = deckSig;
      if (el.sheets) {
        el.sheets.innerHTML = '';
        const step = clamp(26 / Math.max(1, sheets), 2, 6.5);
        for (let i = sheets - 1; i >= 0; i--) {
          const sheet = doc.createElement('div');
          sheet.className = 'deck-sheet';
          sheet.style.transform = sheetTransform(i, step);
          sheet.style.zIndex = String(30 - i);
          el.sheets.appendChild(sheet);
        }
      }
      if (el.meter) {
        el.meter.innerHTML = '';
        for (let i = 0; i < blocks; i++) {
          const b = doc.createElement('i');
          if (i < filled) { b.className = 'on'; b.style.background = accent; b.style.borderColor = '#14120d'; }
          el.meter.appendChild(b);
        }
      }
    }

    if (el.index) {
      el.index.style.background = accent;
      el.index.title = g.name;
    }
    /* the DECK band carries the group colour in every mode */
    if (el.dock) el.dock.style.setProperty('--accent', accent);
    if (el.count) el.count.textContent = String(open);
    if (el.name) el.name.textContent = g.name;
    if (el.ratio) {
      el.ratio.textContent = 'DONE ' + done + '/' + items.length + ' · STACK ' + (items.length > 12 ? '12+' : sheets);
    }
    if (el.toolAutoTuck) {
      const auto = S.settings.dockAutoTuck !== false;
      el.toolAutoTuck.classList.toggle('on', auto);
      el.toolAutoTuck.title = auto ? '卡片堆会自动缩进屏幕（点击关闭）' : '卡片堆不再自动缩进（点击开启）';
    }
  }

  function renderChips() {
    if (!el.chips) return;
    el.chips.innerHTML = '';
    sortedGroups().forEach((g) => {
      const open = S.todos.filter((t) => t.groupId === g.id && !t.done).length;
      const accent = D.PALETTE[g.color] || D.PALETTE.brick;
      const btn = doc.createElement('button');
      btn.className = 'gchip interactive' + (g.id === activeGroupId ? ' active' : '');
      btn.dataset.group = g.id;
      btn.title = g.name + ' · ' + open + ' 项未完成（单击切换 / 双击编辑）';
      btn.innerHTML = '<span class="chip-swatch"></span><span class="chip-name"></span><span class="chip-count"></span>';
      btn.querySelector('.chip-swatch').style.background = accent;
      btn.querySelector('.chip-name').textContent = g.name;
      btn.querySelector('.chip-count').textContent = open;
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); switchGroup(g.id); });
      btn.addEventListener('dblclick', (ev) => { ev.stopPropagation(); openGroupModal(g); });
      el.chips.appendChild(btn);
    });
    const add = doc.createElement('button');
    add.className = 'gchip add interactive';
    add.title = '新建分组';
    add.innerHTML = '<span class="chip-swatch"></span><span class="chip-name">新建分组</span>';
    add.addEventListener('click', (ev) => { ev.stopPropagation(); openGroupModal(null); });
    el.chips.appendChild(add);
  }

  /* ---- hover spread: compact, title sized, tightly stacked beside the deck ---- */

  function computeSpread(n) {
    if (!n) return { slots: [], bounds: null, scale: 1 };
    const vertical = isVerticalEdge();
    const dir = inwardDir();
    /* along-edge direction: down the screen for the side edges, right for top/bottom */
    const lat = vertical ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const c = deckCenter();
    const deck = deckRect();
    const gap = Math.max(1.5, 2 * cs);
    const items = visibleTodos().map((t) => ({ w: compactWidth(t.title), h: compactHeight() }));

    /* for side edges the chips stack by height, for top/bottom by width */
    const alongSize = (it, scale) => (vertical ? it.h * scale : it.w * scale);
    const perpSize = (it, scale) => (vertical ? it.w * scale : it.h * scale);
    const baseTotal = items.reduce((a, it) => a + alongSize(it, 1), 0) + gap * (n - 1);

    const deckLen = vertical ? deck.height : deck.width;
    const centerAlong = vertical ? c.y : c.x;
    const screenHalf = (vertical ? area.height : area.width) / 2 - 16;
    const startAbs = centerAlong - deckLen / 2 + Math.max(8, 12 * cs);
    const avail = Math.max(80, (centerAlong + screenHalf) - startAbs);
    const scale = baseTotal > avail ? Math.max(0.42, avail / baseTotal) : 1;
    const deckHalf = (vertical ? deck.width : deck.height) / 2;
    const offset = Math.max(8, 12 * cs);

    let cursor = startAbs;
    const slots = [];
    let bounds = null;
    items.forEach((it) => {
      const along = alongSize(it, scale);
      const perp = perpSize(it, scale);
      const aroundCenter = cursor + along / 2 - centerAlong;
      cursor += along + gap * scale;
      const depth = deckHalf + offset + perp / 2;
      const x = c.x + lat.x * aroundCenter + dir.x * depth;
      const y = c.y + lat.y * aroundCenter + dir.y * depth;
      const w = vertical ? perp : along;
      const hh = vertical ? along : perp;
      slots.push({ x: Math.round(x), y: Math.round(y), rot: 0, w: w, h: hh });
      const r = { left: x - w / 2, top: y - hh / 2, right: x + w / 2, bottom: y + hh / 2 };
      bounds = bounds ? union(bounds, r) : r;
    });
    return { slots: slots, bounds: bounds, scale: scale };
  }

  function holdRects() {
    const rects = [inflate(deckRect(), 6)];
    if (mode === 'overview' && spread) {
      spread.slots.forEach((s) => {
        rects.push({ left: s.x - s.w / 2, top: s.y - s.h / 2, right: s.x + s.w / 2, bottom: s.y + s.h / 2 });
      });
    }
    return rects;
  }

  function renderCards(opts) {
    opts = opts || {};
    const list = visibleTodos();
    const n = list.length;
    const all = groupItems(activeGroupId);
    /* pinned cards are already out on the desk: the spread only lines up the
       cards that still live in the deck */
    const flow = list.filter((t) => !isPinned(t));
    spread = mode === 'overview' ? computeSpread(flow.length) : null;
    if (spread) lastSpreadScale = spread.scale;
    /* keep the last spread scale while retracting so the chip box never resizes mid-flight */
    doc.body.style.setProperty('--ps',
      String(mode === 'overview' && spread ? spread.scale : (mode === 'collapsed' ? lastSpreadScale : 1)));

    const existing = new Map();
    $$('.todo-card', el.cardLayer).forEach((c) => existing.set(c.dataset.id, c));
    const seen = new Set();

    list.forEach((t, i) => {
      seen.add(t.id);
      let card = existing.get(t.id);
      const isNew = !card;
      if (isNew) {
        card = buildCard(t);
        el.cardLayer.appendChild(card);
      }
      const slot = spread ? spread.slots[flow.indexOf(t)] || spread.slots[spread.slots.length - 1] : null;
      updateCard(card, t, i, n, all, slot);
      if (isNew && mode !== 'collapsed') {
        card.classList.add('docked');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (mode !== 'collapsed') card.classList.remove('docked');
        }));
        if (opts.spawnId === t.id) {
          card.classList.add('fresh');
          setTimeout(() => card.classList.remove('fresh'), 600);
        }
      }
    });

    existing.forEach((card, id) => {
      if (seen.has(id)) return;
      if (mode === 'collapsed') { card.remove(); return; }
      /* the group changed while the deck is open: the outgoing cards fly home
         instead of vanishing, so a switch reads as "A retracts, B spreads" */
      const dockC = deckCenter();
      card.classList.remove('interactive');
      card.classList.add('docked', 'leaving');
      card.style.setProperty('--tx', Math.round(dockC.x) + 'px');
      card.style.setProperty('--ty', Math.round(dockC.y) + 'px');
      card.style.setProperty('--sc', '0.5');
      card.style.setProperty('--rot', card.style.getPropertyValue('--drot') || '0deg');
      card.style.zIndex = '5';
      setTimeout(() => card.remove(), 760);
    });
    $$('.todo-card', el.cardLayer).forEach((c) => c.style.setProperty('--n', String(n)));
    renderEmptyState(n);
    markRectsDirty(500);
    refreshHitRects();
  }

  /* the running duration has to tick without re-rendering the whole card */
  function tickTimers() {
    const nodes = $$('[data-spent]', el.cardLayer);
    if (!nodes.length) return;
    const now = Date.now();
    nodes.forEach((n) => {
      const t = D.todoById(S, n.dataset.spent);
      if (!t) return;
      const text = '\u23F1 ' + D.formatSpent(D.spentOf(t, now));
      if (n.textContent !== text) n.textContent = text;
    });
  }

  function renderEmptyState(n) {
    let empty = $('.deck-empty', el.cardLayer);
    const show = n === 0 && (mode === 'overview' || mode === 'deployed');
    if (show) {
      if (!empty) {
        empty = doc.createElement('div');
        empty.className = 'deck-empty';
        empty.innerHTML = '<div class="big">NO CARDS</div><div class="small">该分组暂无任务 · 点击 ＋ 登记</div>';
        el.cardLayer.appendChild(empty);
      }
    } else if (empty) {
      empty.remove();
    }
  }

  function buildCard(t) {
    const card = doc.createElement('article');
    card.className = 'todo-card';
    card.dataset.id = t.id;
    card.innerHTML =
      '<span class="card-wm"></span>' +
      '<div class="card-body">' +
      '  <button class="card-pin" data-act="pin" title="钉在桌面">' +
      '    <span class="pin-label"></span>' +
      '    <svg class="pin-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="#8d3a27" d="M9.2 2.6h5.6l-1 2.1v2.9l2.1 2v2.1h-4.4v6.9l-1.3 3.8-1.3-3.8v-6.9H4.5V9.6l2.1-2V4.7z"/></svg>' +
      '  </button>' +
      '  <div class="card-top">' +
      '    <h3 class="card-title"></h3>' +
      '    <span class="card-dot"></span>' +
      '  </div>' +
      '  <div class="card-notes"></div>' +
      '  <div class="card-bot"></div>' +
      '</div>' +
      '<div class="card-tools">' +
      '  <button class="icon-btn" data-act="timer" title="开始计时">\u25B6</button>' +
      '  <button class="icon-btn" data-act="edit" title="编辑">\u270E</button>' +
      '  <button class="icon-btn danger" data-act="delete" title="删除">\u2715</button>' +
      '</div>' +
      '<div class="card-flip"><i>\u2713</i></div>';
    return card;
  }

  function isPinned(t) {
    const p = S.placements[t.id];
    return !!(p && p.pinned);
  }

  function updateCard(card, t, i, n, all, slot) {
    const g = D.groupById(S, t.groupId) || S.groups[0];
    const accent = D.PALETTE[g.color] || D.PALETTE.brick;
    const idx = all.findIndex((x) => x.id === t.id);
    const idxText = String((idx < 0 ? i : idx) + 1).padStart(2, '0');
    const repText = D.repeatText(t);
    const pinned = isPinned(t);

    card.style.setProperty('--accent', accent);
    card.style.setProperty('--i', String(i));
    card.style.setProperty('--n', String(n));
    card.classList.toggle('pinned', pinned);
    card.classList.toggle('interactive', pinned || mode === 'overview' || mode === 'deployed');
    /* a pinned card lives on the desk in every mode: full size, never filed */
    if (pinned) {
      card.classList.add('deployed');
      card.classList.remove('compact');
    } else if (mode === 'deployed') {
      card.classList.add('deployed');
      card.classList.remove('compact');
    } else if (mode === 'overview') {
      card.classList.add('compact');
    }

    if (!(drag && drag.id === t.id)) {
      if (pinned || mode === 'deployed') {
        const p = placementFor(t, i, n);
        if (pinned) saveSpot(t, p);
        card.style.setProperty('--tx', p.x + 'px');
        card.style.setProperty('--ty', p.y + 'px');
        card.style.setProperty('--rot', p.rot + 'deg');
        card.style.setProperty('--sc', '1');
        card.style.setProperty('--cw', deployW() + 'px');
      } else if (mode === 'overview' && spread && slot) {
        card.style.setProperty('--tx', slot.x + 'px');
        card.style.setProperty('--ty', slot.y + 'px');
        card.style.setProperty('--rot', slot.rot + 'deg');
        card.style.setProperty('--sc', '1');
        card.style.setProperty('--cw', (slot.w / (spread.scale || 1)) + 'px');
        card.style.setProperty('--chh', compactHeight() + 'px');
      }
    }

    card.classList.toggle('docked', mode === 'collapsed' && !pinned);
    /* pinned cards always sit on top; otherwise higher priority cards stack up */
    card.style.zIndex = pinned ? '88' : (mode === 'deployed' ? String(40 - D.priorityRank(t.priority) * 5) : '');
    const hsh = hash(t.id);
    card.style.setProperty('--drot', (((hsh >>> 3) % 1400) / 100 - 7).toFixed(1) + 'deg');
    card.style.setProperty('--dur', (0.36 + (hsh % 15) / 100).toFixed(2) + 's');

    /* one single transform expression for every state: the flight home only
       changes the values, so it can never jump to a stale/missing target */
    if (mode === 'collapsed' && !pinned) {
      const dockC = deckCenter();
      card.style.setProperty('--tx', Math.round(dockC.x) + 'px');
      card.style.setProperty('--ty', Math.round(dockC.y) + 'px');
      card.style.setProperty('--rot', card.style.getPropertyValue('--drot') || '0deg');
      card.style.setProperty('--sc', '0.5');
    }

    card.classList.toggle('done', !!t.done);
    const pinBtn = $('.card-pin', card);
    if (pinBtn) {
      pinBtn.classList.toggle('on', pinned);
      pinBtn.title = pinned ? '取消钉住（收回时会一起收回）' : '钉在桌面（收回时保留）';
      const pinLabel = $('.pin-label', pinBtn);
      if (pinLabel) pinLabel.textContent = pinned ? '已钉在桌面' : '钉在桌面';
    }
    const timerBtn = $('[data-act="timer"]', card);
    if (timerBtn) {
      const ticking = !!t.timerStartedAt;
      timerBtn.classList.toggle('on', ticking);
      timerBtn.textContent = ticking ? '\u23F8' : '\u25B6';
      timerBtn.title = ticking ? '暂停计时' : '开始计时';
    }

    /* the DOM content is only rewritten when something actually changed — this
       keeps the completion animation smooth (no churn while it runs) */
    const sig = [t.title, t.notes || '', t.priority, t.dueAt || '', repText, t.spawnedFrom || '',
      t.done ? 1 : 0, idxText, accent, g.name, t.timerStartedAt ? 1 : 0, D.spentOf(t) > 0 ? 1 : 0].join('\u0001');
    if (card.__sig === sig) return;
    card.__sig = sig;

    const wm = $('.card-wm', card);
    if (wm) wm.textContent = idxText;
    $('.card-title', card).textContent = t.title;
    const dot = $('.card-dot', card);
    if (dot) dot.style.background = accent;

    const notes = $('.card-notes', card);
    notes.textContent = t.notes || '';
    notes.style.display = t.notes ? '' : 'none';

    const bot = $('.card-bot', card);
    bot.innerHTML = '';
    if (t.priority && t.priority !== 'none') {
      const prio = doc.createElement('span');
      prio.className = 'badge prio-' + t.priority;
      prio.textContent = 'P·' + D.PRIORITY_LABEL[t.priority];
      bot.appendChild(prio);
    }
    if (t.dueAt) {
      const span = doc.createElement('span');
      let cls = 'due-plain';
      if (!t.done && D.isOverdue(t)) cls = 'due-overdue';
      else if (D.isToday(t)) cls = 'due-today';
      else if (D.isUpcoming(t)) cls = 'due-soon';
      span.className = 'badge ' + cls;
      span.textContent = '\u25B8 ' + D.formatDue(t.dueAt);
      bot.appendChild(span);
    }
    if (repText) {
      const rep = doc.createElement('span');
      rep.className = 'badge repeat';
      rep.textContent = '\u21BB ' + repText;
      bot.appendChild(rep);
    }
    if (t.spawnedFrom) {
      const nxt = doc.createElement('span');
      nxt.className = 'badge next';
      nxt.textContent = '\u21BB 下一次';
      bot.appendChild(nxt);
    }
    const spent = D.spentOf(t);
    if (spent > 0 || t.timerStartedAt) {
      const tm = doc.createElement('span');
      tm.className = 'badge timer' + (t.timerStartedAt ? ' running' : '');
      tm.dataset.spent = t.id;
      tm.textContent = '\u23F1 ' + D.formatSpent(spent);
      bot.appendChild(tm);
    }
    const grp = doc.createElement('span');
    grp.className = 'card-group';
    const swatch = doc.createElement('i');
    swatch.style.background = accent;
    grp.appendChild(swatch);
    grp.appendChild(doc.createTextNode(g.name));
    bot.appendChild(grp);
  }

  /* ---------------------------------------------------------------- chrome */

  function updateChrome() {
    renderDeck();
    requestAnimationFrame(() => { layoutDock(); updateDockOrigin(); });
  }

  function updateDashboardTool() {
    if (!el.toolDashboard) return;
    el.toolDashboard.title = dashboardOpen ? '关闭任务面板' : '打开任务面板';
    el.toolDashboard.textContent = dashboardOpen ? '▧' : '▤';
    el.toolDashboard.classList.toggle('on', dashboardOpen);
  }

  /* ---------------------------------------------------------------- placement */

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function placementFor(t, index, total) {
    const p = S.placements[t.id];
    /* 0,0 is what the ledger leaves behind: it has no idea how big the desk is, so the
       card that has never been out is placed here and the spot written back once */
    if (p && (p.x || p.y)) return { x: p.x, y: p.y, rot: p.rot };
    return defaultPlacement(t, index, total);
  }

  const spotSaved = new Set();
  function saveSpot(t, p) {
    const cur = S.placements[t.id];
    if (!cur || !cur.pinned || cur.x || cur.y || spotSaved.has(t.id)) return;
    spotSaved.add(t.id);
    API.op({ type: 'placement:set', todoId: t.id, x: Math.round(p.x), y: Math.round(p.y), rot: p.rot, pinned: true });
  }

  function defaultPlacement(t, index, total) {
    const key = t.id + '|' + Math.round(area.width) + 'x' + Math.round(area.height) + '|' + total + '|' + cs.toFixed(2);
    if (defaultCache.has(key)) return defaultCache.get(key);

    const edge = S.settings.edge || 'right';
    const W = deployW(), H = deployH();
    const pad = 24;
    const reserve = Math.max(190, 190 * ds) + 26;
    let x0 = pad, y0 = pad, x1 = area.width - pad, y1 = area.height - pad;
    if (edge === 'right') x1 -= reserve;
    if (edge === 'left') x0 += reserve;
    if (edge === 'top') y0 += reserve - 40;
    if (edge === 'bottom') y1 -= reserve + 40;

    const AW = Math.max(320, x1 - x0);
    const AH = Math.max(240, y1 - y0);
    const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(total * 1.6))));
    const rows = Math.max(1, Math.ceil(total / cols));
    const col = index % cols;
    const row = Math.floor(index / cols) % rows;
    const cellW = AW / cols;
    const cellH = AH / rows;
    const h = hash(t.id);
    const jx = (((h % 1000) / 1000) - 0.5) * Math.min(110, cellW * 0.34);
    const jy = ((((h >>> 10) % 1000) / 1000) - 0.5) * Math.min(90, cellH * 0.46);
    let x = x0 + cellW * (col + 0.5) + jx;
    let y = y0 + cellH * (row + 0.5) + jy;
    if (rows === 1) y += (index % 2 ? 1 : -1) * Math.min(120, AH * 0.13);

    /* balanced tilt: alternating sign, varied magnitude */
    const sign = index % 2 === 0 ? -1 : 1;
    const rot = sign * (2.2 + ((h >>> 5) % 32) / 10);

    x = clamp(x, W / 2 + pad, area.width - W / 2 - pad);
    y = clamp(y, H / 2 + pad, area.height - H / 2 - pad);
    if (edge === 'right') x = Math.min(x, area.width - reserve - W / 2 + 46);
    if (edge === 'left') x = Math.max(x, reserve + W / 2 - 46);
    if (edge === 'top') y = Math.max(y, reserve + H / 2 - 40);
    if (edge === 'bottom') y = Math.min(y, area.height - reserve - H / 2 + 40);

    const res = { x: Math.round(x), y: Math.round(y), rot: Math.round(rot * 10) / 10 };
    defaultCache.set(key, res);
    return res;
  }

  /* ---------------------------------------------------------------- hit testing */

  /* ---- hit testing: rect based (cheap, no per-move layout work) ---- */

  let hitRects = [];
  let lastHitRefresh = 0;
  let rectsDirtyUntil = 0;

  /* layout-changing moments (mode change, slide, drag, modal, re-render) open a
     short window in which a hit-test miss is allowed to remeasure the rects */
  function markRectsDirty(ms) {
    rectsDirtyUntil = Math.max(rectsDirtyUntil, Date.now() + (ms || 600));
  }

  function rectOfNode(node) {
    const r = node.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  function refreshHitRects(force) {
    const now = Date.now();
    if (!force && now - lastHitRefresh < 150) return;  /* keep animations smooth */
    lastHitRefresh = now;
    const rects = [];
    if (modalOpen) {
      rects.push({ left: 0, top: 0, right: area.width, bottom: area.height });
    } else {
      if (!tucked && el.dock) rects.push(rectOfNode(el.dock));
      /* any card that is out on the desk is clickable, pinned ones included —
         they even stay clickable while the deck itself is retracted */
      $$('.todo-card', el.cardLayer).forEach((c) => {
        if (!c.classList.contains('docked')) rects.push(rectOfNode(c));
      });
    }
    hitRects = rects;
    pushShape();
  }

  /* ---- region hit testing ----------------------------------------------------------------
     A window region is clipped *and* hit-tested by the OS, so the cards stay clickable
     while the rest of the layer falls through to the desktop with no WS_EX_TRANSPARENT
     toggling — and therefore no racing DWM, no dropped fast clicks and no dependency on
     forwarded mousemove. Tilted cards are staircased into scanline spans because a
     region is rect-unions only. Outside the region nothing is drawn either, so a wrong
     rect shows up immediately as a clipped card rather than as a silent input bug.
 */

  const SHAPE_PAD_REST = 8;   /* the hard print shadow is offset 3px with zero blur */
  const SHAPE_PAD_MOVE = 90;  /* while a transition is in flight, cover the path */
  const SHAPE_PAD_DOCK = 12;  /* .dock-ruler is positioned 9px outside the dock box */
  const SHAPE_STEP = 4;       /* px per span: staircase resolution for the tilt */
  let shapeOn = false;        /* main process confirmed setShape works */
  let shapeSig = '';
  let shapeTimer = null;
  let shapeReq = 0;         /* counts requests so a trailing re-run can be detected */
  let lastPushed = null;      /* the spans actually handed to SetWindowRgn */
  let shapePushed = false;    /* whether lastPushed means anything yet */
  let settleTimer = null;     /* re-cut the region once the wide pads expire */
  let dragSweep = null;       /* union of where the dragged box has been this grab */
  let hoveredCard = null;     /* the card the browser reports as :hover */

  function fullWindowHit() {
    /* Only the two states that are genuinely full-screen by design claim the whole
       layer: the editor modal (its backdrop exists to swallow outside clicks) and
       the scatter, where any click anywhere has to gather the cards back. A drag in
       progress must NOT do this: pointerdown on a deck tool sets deckDrag too, and
       claiming the whole work area paints a full-screen surface over everything,
       which under software compositing looks exactly like "the panel went white". */
    return modalOpen || mode === 'deployed';
  }

  /* Does this card still put pixels on screen right now? A card being filed into the
     deck keeps fading for opacity .26s plus a per-card stagger — around 285 ms — while
     the docked class has already dropped it out of the region. A window region clips
     drawing as well as hit testing, so that window reads as a hard cut across the
     card, which is what "the spread has a gap in it" looks like. */
  function cardPaints(c) {
    if (!c.classList.contains('docked')) return true;
    const cs = getComputedStyle(c);
    return cs.display !== 'none' && cs.visibility !== 'hidden' &&
      parseFloat(cs.opacity) > 0.02;
  }

  /* everything that can legitimately want a click right now */
  function liveNodes() {
    const out = interactiveNodes();
    $$('.todo-card', el.cardLayer).forEach((c) => {
      if ((!c.classList.contains('docked') || cardPaints(c)) && out.indexOf(c) < 0) out.push(c);
    });
    if (el.modal && modalOpen) out.push(el.modal);
    /* a scheduled receipt prints into this window, and SetWindowRgn clips drawing as
       well as input, so a machine outside the region is a machine that is not there */
    const rig = doc.querySelector('.rcp');
    if (rig) out.push(rig);
    /* live children of the toast host, not the host: it is a full-height column and
       would claim a strip of the desktop for nothing */
    if (el.toast) {
      Array.prototype.forEach.call(el.toast.children, (n) => out.push(n));
    }
    return out;
  }

  function padFor(node, box) {
    let pad = SHAPE_PAD_REST + (node === el.dock ? SHAPE_PAD_DOCK : 0);
    /* A hovered chip is scaled to 1.09 by CSS, which pushes its painted edge out by
       4.5% of its own size — 24px per side on a 535px long-title chip, well past the
       8px rest pad. So the card the browser says is hovered gets a pad sized for its
       own grown box. Scoped to the hovered card on purpose: a blanket allowance would
       put a 35px ring of swallowed desktop clicks around every chip at rest, and the
       re-cut on pointerover/transitionrun already follows the hover (verified from
       outside the page with WindowFromPoint and the pixel colour at the grown edge). */
    /* The lift is CSS :hover, and the browser can be saying "hovered" a frame before
       pointerover reaches us — or while the layer is momentarily click-through, when no
       pointer event arrives at all. Naming only the tracked card leaves every other chip
       cut at its grown edge, which is the clipped corner. So in the two modes where a
       card does lift, every card carries the allowance; the cost is a few pixels of
       swallowed desktop clicks between chips that are already touching each other. */
    const lifts = node.classList && node.classList.contains('todo-card') &&
      (node === hoveredCard || mode === 'overview' || mode === 'deployed');
    if (lifts && box) {
      pad += Math.ceil(Math.max(box.width, box.height) * 0.05);
    }
    return pad;
  }

  function interactiveNodes() {
    const out = [];
    let fading = false;
    /* the dock belongs in the region even while tucked: a window region clips
       *drawing* as well as hit testing, so leaving it out erases the 22px sliver
       that is supposed to stay on the edge (CSS translateX(-100% + 22px)) */
    if (el.dock) out.push(el.dock);
    /* the fanned sheets are absolutely positioned and translate well outside the
       dock's own layout box, and a region clips *drawing* as well as input: leaving
       them out is what makes a hovered, spread deck look partly see-through along
       its edges. They are invisible in the scatter, where opacity 0 skips them. */
    $$('.deck-sheet', el.dock).forEach((s) => {
      const cs = getComputedStyle(s);
      if (cs.opacity !== '0' && cs.visibility !== 'hidden') out.push(s);
    });
    /* .interactive is toggled per card by paintCard(). A card is covered whenever it
       paints at all: the fading-into-deck window above, and the loose pinned ones. */
    $$('.todo-card', el.cardLayer).forEach((c) => {
      if (!cardPaints(c)) return;
      if (c.classList.contains('docked')) fading = true;
      out.push(c);
      /* the big index number is positioned 10px below the card box, which is past the
         rest pad, so its own box has to be in the region too */
      const wm = c.querySelector && c.querySelector('.card-wm');
      if (wm && wm.offsetWidth && wm.offsetHeight) out.push(wm);
    });
    /* and it has to leave the region the moment the fade ends, so keep the geometry
       dirty until the settle re-cut has had its chance to look again */
    if (fading) markRectsDirty(420);
    return out;
  }

  /* the four corners of a transformed element, in client px: the layout box mapped
     through the linear part of its transform, re-centred on the AABB centre */
  function quadOf(node, box) {
    /* the caller usually already has the box: a drag rebuilds the region on every
       pointermove, and a second getBoundingClientRect per node is a second forced
       layout on the one path that must stay under a frame */
    const r = box || node.getBoundingClientRect();
    if (!isFinite(r.left) || r.width <= 0 || r.height <= 0) return null;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let a = 1, b = 0, c = 0, d = 1;
    try {
      const m = new DOMMatrixReadOnly(getComputedStyle(node).transform || 'none');
      a = m.a; b = m.b; c = m.c; d = m.d;   /* e/f dropped: translate only positions */
    } catch (e) { /* no DOMMatrix: fall back to the axis-aligned box */ }
    const hw = node.offsetWidth / 2, hh = node.offsetHeight / 2;
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return corners.map((p) => ({ x: cx + (p[0] * a + p[1] * c), y: cy + (p[0] * b + p[1] * d) }));
  }

  /* convex quad -> horizontal spans, each widened by pad so the shape is the quad
     plus a pad-wide border without needing true polygon offsetting */
  function spansOfQuad(quad, pad) {
    let top = quad[0].y, bot = quad[0].y;
    for (let i = 1; i < 4; i++) { if (quad[i].y < top) top = quad[i].y; if (quad[i].y > bot) bot = quad[i].y; }
    /* An untilted box is one rect, not a staircase of fourteen. The hover spread lays
       every chip out with rot 0 and the painted-box pass below is axis-aligned by
       construction, so the scanline loop emitted the same row over and over — and
       each row is a CreateRectRgn plus a CombineRgn on a path that runs every frame,
       ending in a SetWindowRgn that repaints the window. Measured on the user's own
       board: 896 rects at rest, 1873 mid-animation, for eleven cards. The staircase
       only earns its cost for a quad that is actually tilted. */
    const l = Math.min(quad[0].x, quad[1].x, quad[2].x, quad[3].x);
    const r = Math.max(quad[0].x, quad[1].x, quad[2].x, quad[3].x);
    if (Math.abs(quad[0].y - quad[1].y) < 0.01 && Math.abs(quad[3].y - quad[2].y) < 0.01 &&
      Math.abs(quad[0].x - quad[3].x) < 0.01 && Math.abs(quad[1].x - quad[2].x) < 0.01) {
      const x = Math.floor(l - pad), xe = Math.ceil(r + pad), yb = Math.ceil(bot + pad), y = Math.floor(top - pad);
      return xe > x && yb > y ? [{ x: x, y: y, width: xe - x, height: yb - y }] : [];
    }
    const out = [];
    const y0 = Math.floor(top - pad), y1 = Math.ceil(bot + pad);
    for (let y = y0; y < y1; y += SHAPE_STEP) {
      /* a row whose centre falls outside the quad must still be emitted, or the
         vertical pad never exists and card edges get clipped; clamp the scanline
         into the quad so the pad ring inherits the nearest cross-section */
      const scan = Math.min(bot - 0.01, Math.max(top + 0.01, y + SHAPE_STEP / 2));
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 4; i++) {
        const p = quad[i], q = quad[(i + 1) % 4];
        if ((scan >= p.y) !== (scan >= q.y)) {
          const x = p.x + ((scan - p.y) / (q.y - p.y)) * (q.x - p.x);
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
      }
      if (hi < lo) continue;
      const x = Math.floor(lo - pad), r = Math.ceil(hi + pad);
      if (r - x <= 0) continue;
      out.push({ x: x, y: y, width: r - x, height: Math.min(SHAPE_STEP, y1 - y) });
    }
    return out;
  }

  /* the pads widen while something is animating, so this is a condition that has to
     be re-checked once the animation is over, not only during it */
  function movingNow() {
    return Date.now() < rectsDirtyUntil || popGuardUntil > Date.now();
  }

  /* During the spread a card travels on the order of 200 px in half a second while the
     region is re-cut at most every 40 ms, so the painted card runs ahead of the region and
     its leading edge is clipped for a few frames. Measured on a real pop: 60 frames out of
     ~5000 with card0's corner outside the spans, marching from x=1700 down to x=1498 as the
     card flew left. The drag path already solves this by accumulating where the box *has
     been*; the same trick belongs on every animating node, so the region is always ahead of
     the pixels it has to show rather than chasing them. */
  const sweptBoxes = new Map();
  const LEAD_MS = 90;     /* how far ahead of the pixels to draw the region */
  const LEAD_CAP = 260;   /* px: a fast flick must not claim the whole screen */
  function sweptBox(node, b) {
    const now = Date.now();
    const prev = sweptBoxes.get(node);
    let out = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    if (prev && now - prev.at < 500) {
      /* where it has been: keeps a card that decelerates inside the region it vacates */
      if (now - prev.at < 600) {
        out.left = Math.min(out.left, prev.left); out.top = Math.min(out.top, prev.top);
        out.right = Math.max(out.right, prev.right); out.bottom = Math.max(out.bottom, prev.bottom);
      }
      /* where it is going: the region is rebuilt every few tens of ms while a spreading
         card moves hundreds of px per second, so covering the past still leaves the
         leading edge outside. Measured: 31 frames of a pop with card0's corner ahead of
         every span the OS had been told about. */
      const dt = Math.max(1, now - prev.at);
      const clamp = (v) => Math.max(-LEAD_CAP, Math.min(LEAD_CAP, v));
      const ex = clamp((b.left - prev.left) / dt * LEAD_MS);
      const ey = clamp((b.top - prev.top) / dt * LEAD_MS);
      out.left = Math.min(out.left, out.left + ex); out.top = Math.min(out.top, out.top + ey);
      out.right = Math.max(out.right, out.right + ex); out.bottom = Math.max(out.bottom, out.bottom + ey);
    }
    if (sweptBoxes.size > 96) sweptBoxes.clear();
    sweptBoxes.set(node, { left: b.left, top: b.top, right: b.right, bottom: b.bottom, at: now });
    return out;
  }

  function buildSpans() {
    if (fullWindowHit()) return null;           /* null = whole window is ours */
    const moving = movingNow();
    /* A drag outruns the refresh throttle: the region is re-cut at most every 150 ms
       and a fast drag moves further than the animation pad in that time, so the box
       arrives at pixels the region still says are not ours. While a drag is in flight
       the region therefore covers the whole swept area, not just where the node is
       this instant — and it is dropped again on release. */
    const dragging = !!(drag || deckDrag);
    const spans = [];
    liveNodes().forEach((n) => {
      const b = n.getBoundingClientRect();
      const pad = moving ? SHAPE_PAD_MOVE : padFor(n, b);
      const q = quadOf(n, b);
      const box = isFinite(b.width) && b.width > 0 && b.height > 0;
      /* the affine quad is only worth its own rects where it differs from the painted
         box — an unrotated card has both identical, and every extra rect is another
         CreateRectRgn + CombineRgn on the interaction path */
      if (q && box) {
        const qw = Math.max(q[0].x, q[1].x, q[2].x, q[3].x) - Math.min(q[0].x, q[1].x, q[2].x, q[3].x);
        const qh = Math.max(q[0].y, q[1].y, q[2].y, q[3].y) - Math.min(q[0].y, q[1].y, q[2].y, q[3].y);
        if (Math.abs(qw - b.width) > 1 || Math.abs(qh - b.height) > 1) {
          spans.push.apply(spans, spansOfQuad(q, pad));
        }
      }
      /* the box the browser says it actually painted: a region clips drawing, so any
         corner this under-covers is a corner the user sees cut off */
      if (box) {
        /* unconditional, not only while something is animating: the dirty window that
           marks "moving" is opened once when the pop starts, and a card with a 200 ms
           stagger is still flying after it closes. Sweeping always costs one Map lookup
           per node and costs nothing at rest, where the swept box equals the live box. */
        const c = sweptBox(n, b);
        spans.push.apply(spans, spansOfQuad([{ x: c.left, y: c.top },
          { x: c.right, y: c.top }, { x: c.right, y: c.bottom },
          { x: c.left, y: c.bottom }], pad));
      }
    });
    /* accumulated across time, not across nodes: this is where the dragged box has
       *been* since the grab, so the region is always ahead of the pixels it must show */
    if (moving && spreadEnvelope && (mode === 'overview' || mode === 'deployed')) {
      const e = spreadEnvelope;
      spans.push.apply(spans, spansOfQuad([{ x: e.l, y: e.t }, { x: e.r, y: e.t },
        { x: e.r, y: e.b }, { x: e.l, y: e.b }], SHAPE_PAD_REST));
    }
    if (dragging && dragSweep) {
      const s = dragSweep;
      spans.push.apply(spans, spansOfQuad([{ x: s.l, y: s.t }, { x: s.r, y: s.t },
        { x: s.r, y: s.b }, { x: s.l, y: s.b }], SHAPE_PAD_REST));
    }
    return spans;
  }

  function noteSweep(node) {
    if (!node) return;
    const b = node.getBoundingClientRect();
    if (!isFinite(b.width) || b.width <= 0 || b.height <= 0) return;
    dragSweep = dragSweep ? {
      l: Math.min(dragSweep.l, b.left), t: Math.min(dragSweep.t, b.top),
      r: Math.max(dragSweep.r, b.right), b: Math.max(dragSweep.b, b.bottom)
    } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
  }

  /* a card straightening and scaling on hover changes its own outline, so the
     region has to chase it — but only for the length of the transition */
  function shapeInvalidate(ms) {
    if (!shapeOn) return;
    markRectsDirty(ms || 420);
    refreshHitRects(true);
  }

  function scheduleSettle() {
    if (settleTimer) clearTimeout(settleTimer);
    const until = Math.max(rectsDirtyUntil, popGuardUntil);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      refreshHitRects(true);
    }, Math.max(120, until - Date.now() + 60));
  }

  function pushShape() {
    if (!shapeOn) return;
    shapeReq++;
    /* During a drag take the leading edge. The 40 ms coalesce exists to keep
       SetWindowRgn off the animation path, but a flick can move the box 600 px between
       two refreshes, and a region one frame behind is exactly the clip the user sees.
       The swept area keeps the region a superset of the path for the rest of the grab,
       so pushing early costs nothing a later push would not have cost anyway. */
    if (drag || deckDrag) { applyShape(); return; }
    if (shapeTimer) return;
    shapeTimer = setTimeout(() => {
      shapeTimer = null;
      const seen = shapeReq;
      applyShape();
      /* something moved while this was being applied: go again rather than leave the
         region matching an earlier frame for as long as nothing else asks */
      if (shapeReq !== seen) pushShape();
    }, 40);
  }

  function applyShape() {
    const wasMoving = movingNow();
    const spans = buildSpans();
    /* a region built with the wide animation pads has to be re-cut once they
       expire, or the layer goes on owning a 90px band around the deck forever */
    if (wasMoving) scheduleSettle();
    /* a stable signature keeps SetWindowRgn off the animation path entirely */
    const sig = spans === null ? 'F' : spans.reduce((s, r) => s + r.x + ',' + r.y + ',' + r.width + ',' + r.height + ';', '');
    if (sig === shapeSig) return;
    shapeSig = sig;
    /* a full-window rect rather than null: SetWindowRgn(NULL) is the one branch
       whose behaviour under software compositing is unverified, and an explicit
       rect the size of the window is the same shape without it */
    API.setShape(spans === null ? [{ x: 0, y: 0, width: area.width, height: area.height }] : spans);
    lastPushed = spans;
    shapePushed = true;
    /* the settle pass is the only moment the spread is exactly where it will live, so it
       is the only honest time to record the envelope */
    if (!wasMoving && (mode === 'overview' || mode === 'deployed')) learnSpread();
    setIgnore(spans !== null && spans.length === 0);
  }

  /* "the deck vanished" has two very different causes — the geometry says the
     sliver is outside our region, or the region we pushed is stale. Ask which,
     because a screenshot of a white desktop cannot tell them apart. */
  /* The region clips drawing as well as hit testing, so any node that paints
     outside the boxes the region was built from silently loses that part to the
     desktop behind it — which reads as "the card is partly transparent". Walk the
     real quads (rotation included) of everything a card draws and name the ones
     that fall outside, instead of guessing which child overflows. */
  function regionLeaks(all) {
    if (!shapeOn) return 'off';
    /* The region that was actually handed to Windows, not one built just now. Comparing
       live boxes against spans recomputed from those same live boxes is tautologically
       tight, so this could never report a leak, the watchdog below never fired, and a
       region that went stale while a card grew under the cursor stayed stale until
       something else happened to move. Before the first push there is nothing to
       compare against, so fall back to the live build. */
    const spans = shapePushed ? lastPushed : buildSpans();
    if (spans === null) return 'full-window';
    const hit = (x, y) => spans.some((r) =>
      x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
    const out = [];
    /* all=1 walks the whole document so an unexpected floater can be named rather
       than guessed at; the default keeps to the things the region claims to cover */
    let list;
    if (all) {
      list = Array.prototype.slice.call(doc.querySelectorAll('body *'));
    } else {
      list = $$('.todo-card', el.cardLayer).filter((c) => !c.classList.contains('docked'));
      if (el.dock) list.push(el.dock);
      list = list.concat(Array.prototype.slice.call((el.dock || doc.body).querySelectorAll('*')));
    }
    list.forEach((m) => {
      if (!m.offsetWidth || !m.offsetHeight) return;
      /* effective, not own, visibility: a child of a card that has faded to nothing
         still reports opacity 1, and reporting it as a leak hides the real ones */
      let p = m, seen = true;
      for (; p && p !== doc.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.02) {
          seen = false;
          break;
        }
      }
      if (!seen) return;
      /* getBoundingClientRect is the real painted box: it already carries the
         ancestor perspective that quadOf's affine reconstruction throws away. Testing
         the same quad the region is built from would always come back tight. */
      const b = m.getBoundingClientRect();
      /* a full-window box that paints nothing of its own is a positioning host, not
         something the region can clip away */
      if (b.width >= area.width * 0.98 && b.height >= area.height * 0.98 && m !== el.modal) return;
      const corners = [[b.left, b.top], [b.right - 0.01, b.top],
        [b.left, b.bottom - 0.01], [b.right - 0.01, b.bottom - 0.01]];
      const bad = corners.filter((q) => !hit(q[0], q[1]));
      if (bad.length) {
        const label = (m.getAttribute && m.getAttribute('class')) || m.tagName;
        out.push(label + ' x' + bad.length +
          ' @' + Math.round(b.left) + ',' + Math.round(b.top) +
          ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
      }
    });
    return out.length ? 'LEAK ' + out.length + '[' + out.slice(0, 8).join(' | ') + ']' : 'tight';
  }

  /* Every re-cut is driven by an event — a hover, a transition, an animation, a resize.
     If one of those is ever missed the region keeps clipping a card that is still being
     painted, and nothing else will ever correct it: the deck looks dented until the next
     interaction. So ask the question directly, from the painted boxes, on a slow timer
     while nothing is moving. applyShape() no-ops when the signature has not changed, so
     a healthy layer pays one buildSpans() per tick and no SetWindowRgn at all. */
  /* The envelope the last spread ended in. During a pop the region cannot catch up with
     the pixels by re-cutting — measured, 32 frames of a 460 ms flight still had the
     leading corner outside whatever had been pushed — so it covers where the cards are
     going instead. The layout is stable, so the last settled spread is the best possible
     prediction of the next one, and after the first pop the artifact is gone. */
  let spreadEnvelope = null;
  function learnSpread() {
    let box = null;
    $$('.todo-card', el.cardLayer).forEach((c) => {
      const cs = getComputedStyle(c);
      if (cs.opacity === '0' || cs.visibility === 'hidden') return;
      const b = c.getBoundingClientRect();
      if (!isFinite(b.width) || b.width <= 0) return;
      box = box ? {
        l: Math.min(box.l, b.left), t: Math.min(box.t, b.top),
        r: Math.max(box.r, b.right), b: Math.max(box.b, b.bottom)
      } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
    });
    if (box && box.r - box.l > 2 && box.b - box.t > 2) spreadEnvelope = box;
  }

  /* The self-heal. It has to ask pushedLag(), not regionLeaks(): the latter used to
     rebuild the spans from live geometry and compare them with the same live geometry,
     which always agreed, so this watchdog could never fire and a region left stale by a
     card growing under the cursor stayed stale until something else moved. pushedLag
     only reads the spans already handed over, so the check is cheap enough to run at a
     cadence short enough that a stale region is a blink rather than a permanent notch. */
  setInterval(() => {
    if (!shapeOn || drag || deckDrag || modalOpen) return;
    if (movingNow()) return;
    if (pushedLag().indexOf('LAG') !== 0) return;
    markRectsDirty(400);
    refreshHitRects(true);
  }, 400);

  /* ---- 定时出票 ----
     The card layer owns this clock, because it is the only window that is always open:
     a scheduled receipt has to print with the task panel shut. It lands beside the deck
     and takes itself away, so the desk is not left holding a machine. */
  let rcpFired = '';
  setInterval(() => {
    if (!window.Receipt || !S || !S.settings) return;
    const key = window.Receipt.due(S, new Date(), rcpFired);
    if (!key) return;
    rcpFired = key;
    const r = el.dock ? el.dock.getBoundingClientRect() : null;
    API.forceShowLayer(14000);
    window.Receipt.auto(S, r ? { x: r.left - 150, y: r.top } : null);
    /* the paper moves on a schedule the page cannot hook from here, so the region keeps
       chasing it for as long as the machine is up */
    const chase = setInterval(() => {
      if (!window.Receipt.active()) { clearInterval(chase); return; }
      markRectsDirty(900);
      refreshHitRects(true);
    }, 120);
    setTimeout(() => clearInterval(chase), 16000);
  }, 15000);

  /* The invariant the user can actually see: is everything being painted right now
     inside the region the OS was *told about*? Comparing live geometry against live
     geometry always agrees — this compares against what was last pushed, which is the
     only way to see the region lagging a drag. */
  function pushedLag() {
    if (!shapeOn) return 'off';
    if (lastPushed === null) return 'full-window';
    let bad = 0;
    let who = '';
    liveNodes().forEach((n) => {
      const b = n.getBoundingClientRect();
      if (!isFinite(b.width) || b.width <= 0 || b.height <= 0) return;
      const pts = [[b.left + 1, b.top + 1], [b.right - 1, b.top + 1],
        [b.left + 1, b.bottom - 1], [b.right - 1, b.bottom - 1]];
      pts.forEach((p) => {
        const hit = lastPushed.some((r) =>
          p[0] >= r.x && p[0] < r.x + r.width && p[1] >= r.y && p[1] < r.y + r.height);
        if (!hit) {
          bad++;
          if (!who) who = ((n.getAttribute && n.getAttribute('class')) || n.tagName) +
            '@' + Math.round(p[0]) + ',' + Math.round(p[1]);
        }
      });
    });
    return bad ? 'LAG ' + bad + ' first=' + who : 'covered';
  }

  function regionCheck() {
    if (!shapeOn) return 'region=off';
    if (!el.dock) return 'region=nodock';
    const d = el.dock.getBoundingClientRect();
    const x0 = Math.max(0, d.left), y0 = Math.max(0, d.top);
    const x1 = Math.min(area.width, d.right), y1 = Math.min(area.height, d.bottom);
    const want = buildSpans();
    const pushed = lastPushed === null ? 'null' : String(lastPushed.length);
    const live = want === null ? 'FULL' : String(want.length);
    if (x1 - x0 <= 2 || y1 - y0 <= 2) return 'region=offscreen want=' + live + ' pushed=' + pushed;
    const px = (x0 + x1) / 2, py = (y0 + y1) / 2;
    const inside = (spans) => spans === null || spans.some((r) =>
      px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height);
    const w = inside(want) ? 'ok' : 'LOST';
    const p = inside(lastPushed) ? 'ok' : 'LOST';
    return 'region=' + w + '/' + p + ' want=' + live + ' pushed=' + pushed +
      ' at=' + Math.round(px) + ',' + Math.round(py);
  }

  /* the main process answers appInfo() with whether the region path is live */
  function probeShape() {
    if (!API.appInfo) return;
    Promise.resolve(API.appInfo()).then((info) => {
      shapeOn = !!(info && info.shape);
      if (!shapeOn) return;
      ignoring = null;                 /* re-evaluate through the shape-aware path */
      refreshHitRects(true);
      console.log('[overlay] region hit testing active');
    }).catch(() => { /* browser mode or no bridge: keep cursor toggling */ });
  }

  function setIgnore(v) {
    if (ignoreFrozen) return;
    /* Under a window region the OS owns the per-point decision, so the layer must
       stay opaque to the mouse whenever any of it is on screen — WS_EX_TRANSPARENT
       would make the region itself ignored. Fully tucked is the one case where the
       transparent + forwarded-move path is still what wakes the deck. */
    /* with a live region the layer is never transparent to the mouse: the OS
       geometry test already decides what is ours, and the tucked sliver stays
       clickable instead of needing a hover */
    if (shapeOn) v = false;
    if (v === ignoring) return;
    ignoring = v;
    API.setIgnoreMouse(v);
  }

  function hitTest(ev) {
    if (ev && isFinite(ev.clientX)) lastPointer = { x: ev.clientX, y: ev.clientY };
    if (drag && Date.now() - drag.lastMove > 5000) cancelCardDrag();
    /* the scatter is modal by design: a click anywhere has to reach the layer so
       it can put the cards back */
    if (drag || deckDrag || modalOpen || mode === 'deployed') { setIgnore(false); return; }
    const pt = lastPointer;
    if (pt.x < 0 || pt.y < 0) return;
    /* cheap rect pre-filter, then confirm with a real hit test so rotated cards,
       rulers and gaps never steal clicks from the desktop */
    const pad = ignoring ? 8 : 12; /* hysteresis keeps an active layer from flapping */
    const nearRects = () => {
      for (let i = 0; i < hitRects.length; i++) {
        const r = hitRects[i];
        if (pt.x >= r.left - pad && pt.x <= r.right + pad && pt.y >= r.top - pad && pt.y <= r.bottom + pad) return true;
      }
      return false;
    };
    let candidate = nearRects();
    if (!candidate && Date.now() < rectsDirtyUntil && Date.now() - lastHitRefresh > 90) {
      /* a rect measured mid-animation (or during a dock drag) can be stale;
         remeasure once before declaring the spot empty desktop */
      refreshHitRects(true);
      candidate = nearRects();
    }
    if (!candidate) { setIgnore(true); lastHit = { pt: pt, candidate: false, interactive: false, node: null }; return; }
    const node = doc.elementFromPoint(pt.x, pt.y);
    const interactive = !!(node && node.closest && node.closest('.interactive'));
    lastHit = { pt: pt, candidate: true, interactive: interactive, node: node ? (node.id || node.className || node.tagName) : null };
    setIgnore(!interactive);
  }

  function queueHitTest(ev) {
    if (ev && isFinite(ev.clientX)) lastPointer = { x: ev.clientX, y: ev.clientY };
    /* entering is handled synchronously so a fast click never falls through */
    hitTest();
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      hitTest();
    });
  }

  /* leave the deck/cards: retract the spread (after a short grace) and, when the
     desktop is not in front, tuck the deck back against the edge */
  function updateHover(x, y) {
    if (modalOpen || drag || deckDrag || mode === 'deployed') return;
    const rects = holdRects();
    const inside = rects.some((r) => pointIn({ x: x, y: y }, r));
    const near = rects.some((r) => pointIn({ x: x, y: y }, inflate(r, HOVER_NEAR)));
    if (!hoverArmed) {
      /* recalled: stay filed until the pointer is clearly away and the grace passed */
      if (Date.now() < hoverRearmAfter || near) return;
      hoverArmed = true;
    }
    if (inside) {
      if (Date.now() < popGuardUntil) return;  /* the pop is still animating */
      cancelCollapse();
      cancelTuck();
      if (tucked) popOut();                    /* a pointer that arrives and stops still opens it */
      if (mode === 'collapsed') setMode('overview');
    } else {
      if (mode === 'overview') scheduleCollapse();
      maybeReTuck();
    }
  }

  /* ---------------------------------------------------------------- events */

  function bindEvents() {
    /* the same desktop-not-a-webpage rule as the panel: no browser menu on a
       right-click over a card or the deck */
    doc.addEventListener('contextmenu', (ev) => { ev.preventDefault(); return false; });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        doc.body.classList.remove('fading');
        doc.body.classList.add('appear');
        setTimeout(() => doc.body.classList.remove('appear'), 320);
      }
    });
    window.addEventListener('mousemove', (ev) => {
      if (testPointerMode && ev.__test !== true) return;
      moveCount++;
      lastPointer = { x: ev.clientX, y: ev.clientY };
      if (tucked) {
        const rect = el.dock ? rectOfNode(el.dock) : null;
        const near = rect && ev.clientX >= rect.left - 26 && ev.clientX <= rect.right + 26 &&
          ev.clientY >= rect.top - 26 && ev.clientY <= rect.bottom + 26;
        if (near) armPop(); else cancelArmPop();
      } else {
        updateHover(ev.clientX, ev.clientY);
      }
      queueHitTest();
    }, { passive: true });
    window.addEventListener('mouseleave', () => {
      if (mode === 'overview') scheduleCollapse();
      setIgnore(true);
    });
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);

    el.face.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (Date.now() < suppressClickUntil) return;
      toggleDeploy();
    });
    el.face.addEventListener('dblclick', (ev) => { ev.stopPropagation(); openQuickModal(); });
    el.face.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleDeploy(); }
    });

    el.deckStack.addEventListener('pointerdown', onDeckPointerDown);

    /* tucked deck pops out as soon as the pointer reaches the edge strip */
    /* a real cursor drifting over the dock must not wake it during the scripted
       self test (synthetic moves drive the deck there) */
    el.dock.addEventListener('mouseenter', () => { if (!testPointerMode) popOut(); });
    /* walking onto a spread chip leaves the dock element — only retract when the
       pointer actually leaves the whole deck + chip cluster */
    el.dock.addEventListener('mouseleave', () => {
      if (drag || deckDrag) return;
      const p = lastPointer;
      const near = holdRects().some((r) => pointIn(p, inflate(r, 8)));
      if (!near) maybeReTuck();
    });

    /* Which card the browser itself says is hovered — the same hit test that drives
       :hover, so the pad allowance grows and shrinks with the CSS lift. */
    el.cardLayer.addEventListener('pointerover', (ev) => {
      const c = ev.target && ev.target.closest ? ev.target.closest('.todo-card') : null;
      if (c !== hoveredCard) hoveredCard = c;
      shapeInvalidate();
    });
    el.cardLayer.addEventListener('pointerout', (ev) => {
      const c = ev.target && ev.target.closest ? ev.target.closest('.todo-card') : null;
      /* moving between a card's own children is not leaving it */
      if (c && ev.relatedTarget && c.contains(ev.relatedTarget)) return;
      if (hoveredCard) hoveredCard = null;
      shapeInvalidate();
    });
    el.dock.addEventListener('pointerover', () => shapeInvalidate());
    el.dock.addEventListener('pointerout', () => shapeInvalidate());
    /* The general case, not one hook per effect: anything that animates a card's
       outline — the hover lift, a scale, a future easing — has to re-cut the region
       when it starts (so the wide pads cover the travel) and again when it ends (so
       the region settles onto the final box). */
    el.cardLayer.addEventListener('transitionrun', () => shapeInvalidate(420));
    el.cardLayer.addEventListener('transitionend', () => shapeInvalidate(300));
    el.cardLayer.addEventListener('transitioncancel', () => shapeInvalidate(300));
    /* Keyframes are the other half of the story and fire none of the above: the pop-in
       starts at scale 1.12 and the completion flip turns and shrinks the card. A region
       measured before that animation began is smaller than the card while it runs, which
       is the clipped corner — so the same wide-then-settle pair applies to animations. */
    ['animationstart', 'animationiteration'].forEach((ev) => {
      el.cardLayer.addEventListener(ev, () => shapeInvalidate(600));
    });
    ['animationend', 'animationcancel'].forEach((ev) => {
      el.cardLayer.addEventListener(ev, () => shapeInvalidate(300));
    });
    el.dock.addEventListener('animationstart', () => shapeInvalidate(600));
    el.dock.addEventListener('animationend', () => shapeInvalidate(300));

    el.cardLayer.addEventListener('click', (ev) => {
      const card = ev.target.closest('.todo-card');
      if (!card) return;
      const btn = ev.target.closest('[data-act]');
      if (btn) {
        ev.stopPropagation();
        handleCardAction(btn.dataset.act, card.dataset.id, btn);
        return;
      }
      if (mode === 'collapsed') return;
      ev.stopPropagation();
      queueComplete(card, card.dataset.id);
    });
    el.cardLayer.addEventListener('dblclick', (ev) => {
      const card = ev.target.closest('.todo-card');
      if (!card || mode === 'collapsed') return;
      if (ev.target.closest('[data-act]')) return;
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      openTodoModal({ todo: D.todoById(S, card.dataset.id) });
    });

    el.cardLayer.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', cancelCardDrag);

    el.tools.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      ev.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'add') openTodoModal({});
      else if (act === 'layout') {
        defaultCache.clear();
        API.op({ type: 'placements:reset', groupId: activeGroupId });
        if (mode !== 'deployed') setMode('deployed');
        toast('已重新排布 // REPACKED');
      } else if (act === 'dashboard') {
        API.toggleDashboard();
      } else if (act === 'settings') {
        API.openDashboard('settings');
      } else if (act === 'pinall') {
        const list = visibleTodos();
        if (!list.length) {
          toast('这个分组还没有任务 // EMPTY DECK');
          return;
        }
        /* toggles: pin everything that is loose, or release everything at once */
        const allPinned = list.every((t) => isPinned(t));
        list.forEach((t, i) => {
          const p = placementFor(t, i, list.length);
          API.op({ type: 'placement:set', todoId: t.id, x: p.x, y: p.y, rot: p.rot, pinned: !allPinned });
        });
        if (!allPinned && mode !== 'deployed') setMode('deployed');
        toast(allPinned ? '已取消钉住 ' + list.length + ' 张卡片 // UNPINNED ALL'
          : '已钉住 ' + list.length + ' 张卡片 // PINNED ALL');
      } else if (act === 'autotuck') {
        const next = S.settings.dockAutoTuck === false;
        API.op({ type: 'settings:update', patch: { dockAutoTuck: next } });
        toast(next ? '卡片堆会自动缩进屏幕 // AUTO TUCK ON' : '卡片堆不再自动缩进 // AUTO TUCK OFF');
      } else if (act === 'hide') {
        doc.body.classList.add('fading');
        setTimeout(() => {
          API.hideOverlay();
          doc.body.classList.remove('fading');
        }, 190);
        toast('桌面卡片层已隐藏 · 托盘可恢复');
      }
    });

    document.addEventListener('mousedown', (ev) => {
      if (!modalOpen) return;
      if (ev.target.closest('.modal-panel')) return;
      if (ev.target.closest('.modal-backdrop')) closeModal();
    });

    document.addEventListener('click', (ev) => {
      if (modalOpen) return;
      if (ev.target.closest('.modal-root')) return;
      if (ev.target.closest('.dock') || ev.target.closest('.todo-card')) return;
      if (Date.now() < suppressCardClickUntil) return;   /* a card was just dragged */
      if (mode === 'deployed') {
        /* scattered cards: any click puts them back and retracts the deck */
        recall();
        tuckAfterRecall();
        return;
      }
      if (mode === 'overview') setMode('collapsed');
    });

    document.addEventListener('wheel', (ev) => {
      if (modalOpen || mode !== 'deployed') return;
      ev.preventDefault();
      recall();
      tuckAfterRecall();
    }, { passive: false });
  }

  function onKeyDown(ev) {
    if (ev.key === 'Escape') {
      if (modalOpen) { closeModal(); return; }
      if (mode === 'deployed') { recall(); return; }
      if (mode === 'overview') { setMode('collapsed'); return; }
      return;
    }
    if (modalOpen) return;
    const tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); openTodoModal({}); }
    if (ev.key === 'd' || ev.key === 'D') { toggleDeploy(); }
    if (ev.key === 'm' || ev.key === 'M') { API.toggleDashboard(); }
  }

  /* ---------------------------------------------------------------- completion */

  function queueComplete(card, id) {
    const t = D.todoById(S, id);
    if (!t) return;
    if (Date.now() < suppressCardClickUntil) return;
    /* wait a moment so a double click can open the editor instead */
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    clickTimer = setTimeout(() => {
      clickTimer = null;
      toggleComplete(card, id);
    }, 190);
  }

  function toggleComplete(card, id) {
    const t = D.todoById(S, id);
    if (!t) return;
    const nowDone = !t.done;
    if (nowDone) recentlyDone.add(id);
    else recentlyDone.delete(id);
    playSound(nowDone ? 'done' : 'undone');
    card.classList.remove('punch');
    void card.offsetWidth;
    card.classList.add('punch');
    card.classList.toggle('done', nowDone);
    setTimeout(() => card.classList.remove('punch'), 360);
    API.op({ type: 'todo:toggle', id: id }).then((res) => {
      if (res && res.ok && res.spawned) toast('重复任务：已生成下一次 // NEXT OCCURRENCE');
      if (res && res.ok && res.removed) toast('已撤销生成的下一次 // UNDONE');
    });
  }

  /* ---------------------------------------------------------------- deck drag */

  function onDeckPointerDown(ev) {
    if (ev.button !== 0) return;
    if (ev.target.closest('.dock-tools, .group-chips, button')) return;
    if (S.settings.dockMovable === false) return;
    markRectsDirty(900);
    const rect = el.dock.getBoundingClientRect();
    deckDrag = {
      pointerId: ev.pointerId,
      vertical: isVerticalEdge(),
      startX: ev.clientX,
      startY: ev.clientY,
      moved: false,
      rect: rect,
      grab: { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
      pos: clamp(isFinite(Number(S.settings.dockPos)) ? Number(S.settings.dockPos) : 0.5, 0, 1)
    };
    cancelCollapse();
  }

  function onDeckPointerMove(ev) {
    if (!deckDrag) return;
    const dx = ev.clientX - deckDrag.startX;
    const dy = ev.clientY - deckDrag.startY;
    if (!deckDrag.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return;
      deckDrag.moved = true;
      try { el.deckStack.setPointerCapture(deckDrag.pointerId); } catch (e) { /* ignore */ }
      doc.body.classList.add('dock-dragging');
      setIgnore(false);
    }
    ev.preventDefault();
    const r = deckDrag.rect;
    const grab = deckDrag.grab || { x: r.width / 2, y: r.height / 2 };
    if (deckDrag.vertical) {
      const range = Math.max(1, area.height - r.height - 24);
      const top = clamp(ev.clientY - grab.y, 12, 12 + range);
      el.dock.style.top = Math.round(top) + 'px';
      deckDrag.pos = (top - 12) / range;
    } else {
      const range = Math.max(1, area.width - r.width - 24);
      const left = clamp(ev.clientX - grab.x, 12, 12 + range);
      el.dock.style.left = Math.round(left) + 'px';
      deckDrag.pos = (left - 12) / range;
    }
    S.settings.dockPos = deckDrag.pos;
    updateDockOrigin();
    renderCards();
    /* the region has to follow the dock: it is clipped as well as hit tested, so a
       region left where the dock was cuts the box — and the hovered card beside it —
       in half for as long as the drag lasts. refreshHitRects throttles itself, and
       the swept area covers the distance a fast drag puts between two refreshes. */
    noteSweep(el.dock);
    markRectsDirty(400);
    refreshHitRects(true);   /* not throttled: the box is moving under the pointer */
  }

  function onDeckPointerUp(ev) {
    if (!deckDrag) return;
    const moved = deckDrag.moved;
    const pos = deckDrag.pos;
    if (moved) {
      try { el.deckStack.releasePointerCapture(deckDrag.pointerId); } catch (e) { /* ignore */ }
      doc.body.classList.remove('dock-dragging');
      suppressClickUntil = Date.now() + 350;
      API.op({ type: 'settings:update', patch: { dockPos: clamp(pos, 0, 1) } });
      toast('卡盒位置已保存 // DOCK MOVED');
    }
    deckDrag = null;
    dragSweep = null;         /* the swept area is only owed while the grab is live */
    markRectsDirty(700);
    refreshHitRects(true);
    if (pendingRender) { pendingRender = false; renderAll(); }
    queueHitTest(ev);
  }

  /* ---------------------------------------------------------------- card actions + drag */

  function bringToFront(card) {
    const max = $$('.todo-card', el.cardLayer).reduce((m, c) => Math.max(m, Number(c.style.zIndex) || 0), 0);
    card.style.zIndex = String(max + 1);
  }

  function handleCardAction(act, id, btn) {
    const t = D.todoById(S, id);
    if (!t) return;
    if (act === 'edit') { openTodoModal({ todo: t }); return; }
    if (act === 'timer') {
      API.op({ type: 'todo:timer', id: id }).then((res) => {
        const on = !!(res && res.running === id);
        toast(on ? '开始计时 // TIMER ON' : '计时已暂停 // TIMER PAUSED');
      });
      return;
    }
    if (act === 'pin') {
      const list = visibleTodos();
      const i = Math.max(0, list.findIndex((x) => x.id === id));
      const p = placementFor(t, i, list.length);
      const pinned = !isPinned(t);
      API.op({ type: 'placement:set', todoId: id, x: p.x, y: p.y, rot: p.rot, pinned: pinned });
      toast(pinned ? '已钉在桌面 // PINNED' : '已取消钉住 // UNPINNED');
      return;
    }
    if (act === 'delete') {
      if (btn.dataset.confirm === '1') {
        const timer = cleanupTimers.get(id);
        if (timer) { clearTimeout(timer); cleanupTimers.delete(id); }
        API.op({ type: 'todo:delete', id: id });
        toast('任务已删除 // PURGED');
        return;
      }
      btn.dataset.confirm = '1';
      btn.classList.add('confirm');
      btn.textContent = '!';
      btn.title = '再次点击确认删除';
      const timer = setTimeout(() => {
        btn.dataset.confirm = '';
        btn.classList.remove('confirm');
        btn.textContent = '\u2715';
        btn.title = '删除';
        cleanupTimers.delete(id);
      }, 2600);
      cleanupTimers.set(id, timer);
    }
  }

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    const card = ev.target.closest('.todo-card');
    if (!card) return;
    if (ev.target.closest('button, .card-tools, .card-pin')) return;
    /* scattered cards drag; a pinned card may be dragged in any mode */
    const id0 = card.dataset.id;
    if (mode !== 'deployed' && !(id0 && isPinned(D.todoById(S, id0) || {}))) return;
    const id = id0;
    if (!D.todoById(S, id)) return;
    const rect = card.getBoundingClientRect();
    drag = {
      id: id,
      card: card,
      dx: ev.clientX - (rect.left + rect.width / 2),
      dy: ev.clientY - (rect.top + rect.height / 2),
      startX: ev.clientX,
      startY: ev.clientY,
      moved: false,
      lastMove: Date.now(),
      pointerId: ev.pointerId,
      rot: parseFloat(card.style.getPropertyValue('--rot')) || 0,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    card.classList.add('dragging');
    bringToFront(card);
    cancelCollapse();
    try { card.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    card.addEventListener('lostpointercapture', onLostCapture, { once: true });
    card.classList.remove('fresh', 'punch'); /* never let a running animation lock the drag */
    setIgnore(false);
    ev.preventDefault();
  }

  function onPointerMove(ev) {
    if (deckDrag) { onDeckPointerMove(ev); return; }
    if (!drag) return;
    drag.lastMove = Date.now();
    const x = clamp(ev.clientX - drag.dx, deployW() / 2, area.width - deployW() / 2);
    const y = clamp(ev.clientY - drag.dy, deployH() / 2, area.height - deployH() / 2);
    if (Math.abs(ev.clientX - drag.startX) + Math.abs(ev.clientY - drag.startY) > 5) drag.moved = true;
    drag.x = x;
    drag.y = y;
    drag.card.style.setProperty('--tx', x + 'px');
    drag.card.style.setProperty('--ty', y + 'px');
    /* same reason as the deck drag: the card is being painted somewhere the region
       was not told about */
    noteSweep(drag.card);
    markRectsDirty(400);
    refreshHitRects(true);   /* not throttled: the card is moving under the pointer */
  }

  /* a drag whose pointer vanished (window lost focus, capture dropped, release
     outside the layer) must never keep the layer interactive: it would swallow
     wheel and click messages meant for the window below */
  function cancelCardDrag() {
    if (!drag) return;
    const card = drag.card;
    card.classList.remove('dragging');
    try { card.releasePointerCapture && card.releasePointerCapture(drag.pointerId); } catch (e) { /* ignore */ }
    drag = null;
    dragSweep = null;
    if (pendingRender) { pendingRender = false; renderAll(); }
    refreshHitRects(true);
    queueHitTest();
  }

  function onLostCapture(ev) {
    if (drag && drag.card === ev.target) cancelCardDrag();
  }

  function onPointerUp(ev) {
    if (deckDrag) { onDeckPointerUp(ev); return; }
    if (!drag) return;
    const card = drag.card, id = drag.id, moved = drag.moved;
    const x = drag.x, y = drag.y, rot0 = drag.rot;
    card.classList.remove('dragging');
    try { card.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    drag = null;
    if (moved) {
      const rot = clamp(rot0 + (Math.random() * 4 - 2), -16, 16);
      suppressCardClickUntil = Date.now() + 380; /* a move must not complete the card */
      API.op({ type: 'placement:set', todoId: id, x: Math.round(x), y: Math.round(y), rot: Math.round(rot * 10) / 10 });
      toast('位置已锁定 // LOCKED');
    }
    if (pendingRender) { pendingRender = false; renderAll(); }
    dragSweep = null;
    refreshHitRects(true);
    queueHitTest(ev);
  }

  /* ---------------------------------------------------------------- group switching */

  function switchGroup(id) {
    if (id === activeGroupId) { if (mode === 'collapsed') setMode('overview'); return; }
    const wasCollapsed = mode === 'collapsed';
    activeGroupId = id;
    /* the deck keeps its mode: the outgoing group's cards fly home while the new
       group's cards fly out, so a switch reads as one continuous animation */
    suppressUntil = Date.now() + 240;   /* we render below, not on the broadcast */
    API.op({ type: 'settings:update', patch: { activeGroupId: id } });
    setTimeout(() => {
      renderAll();
      if (wasCollapsed && pointIn(lastPointer, inflate(deckRect(), 14))) setMode('overview');
      setTimeout(hitTest, 60);
    }, 200);
  }

  /* ---------------------------------------------------------------- modals */

  function modalShell(title, sub, bodyHtml, footHtml) {
    return '' +
      '<div class="modal-backdrop interactive"></div>' +
      '<div class="modal-panel interactive">' +
      '  <div class="modal-head">' +
      '    <div><h2>' + title + '</h2><div class="modal-title-sub">' + sub + '</div></div>' +
      '    <button class="icon-btn" data-act="close">\u2715</button>' +
      '  </div>' +
      '  <div class="modal-body">' + bodyHtml + '</div>' +
      '  <div class="modal-foot">' + footHtml + '</div>' +
      '</div>';
  }

  function openModal(html, onMount) {
    modalOpen = true;
    el.modal.innerHTML = html;
    el.modal.classList.add('open', 'interactive');
    setIgnore(false);
    markRectsDirty(500);
    refreshHitRects(true);
    const closeBtn = $('[data-act="close"]', el.modal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    /* the card layer's own editor gets the same draggable bar as the panel's */
    if (window.NeonModalDrag) {
      NeonModalDrag.make($('.modal-panel', el.modal) || el.modal, $('.modal-head', el.modal));
    }
    if (onMount) onMount(el.modal);
    requestAnimationFrame(hitTest);
    return el.modal;
  }

  function closeModal() {
    modalOpen = false;
    el.modal.classList.remove('open', 'interactive');
    el.modal.innerHTML = '';
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    markRectsDirty(500);
    refreshHitRects(true);
    queueHitTest();
  }

  /* one-line natural-language entry (same behaviour as the panel sidebar box) */
  function openQuickModal() {
    cancelCollapse();
    if (mode === 'collapsed') setMode('overview');
    const body =
      '<div class="quick-line">' +
      '  <input class="input" id="qText" placeholder="明天五点吃火锅 -日常" autocomplete="off" />' +
      '  <span class="input-key">ENTER</span>' +
      '</div>' +
      '<div class="quick-preview tiny faint" id="qPreview">一句话登记：自动识别日期、重复与分组</div>';
    const foot =
      '<div class="spacer"></div>' +
      '<button class="btn ghost" data-act="cancel">取消</button>' +
      '<button class="btn primary" data-act="save">登记 ADD</button>';

    openModal(modalShell('快速登记 / QUICK ADD', 'ONE LINE ENTRY', body, foot), (root) => {
      const input = $('#qText', root);
      const preview = $('#qPreview', root);
      const parse = () => (window.NeonNLP ? window.NeonNLP.parse(input.value, { groups: S.groups, now: new Date() }) : null);
      const refresh = () => {
        const text = input.value.trim();
        if (!text) {
          preview.textContent = '一句话登记：自动识别日期、重复与分组';
          preview.className = 'quick-preview tiny faint';
          return;
        }
        const p = parse();
        if (!p) return;
        const g = p.groupId ? D.groupById(S, p.groupId) : D.groupById(S, D.TEMP_GROUP_ID);
        const desc = window.NeonNLP.describe(p);
        preview.textContent = '→ ' + (g ? g.name : '临时') + (desc ? ' · ' + desc : '');
        preview.className = 'quick-preview tiny ' + (p.warning ? 'warn' : 'ok');
      };
      const save = () => {
        const text = input.value.trim();
        if (!text) { input.focus(); return; }
        const p = parse();
        const groupId = (p && p.groupId) || D.TEMP_GROUP_ID;
        API.op({
          type: 'todo:add',
          title: (p && p.title) || text,
          groupId: groupId,
          dueAt: p ? p.dueAt : null,
          repeat: p ? p.repeat : 'none',
          lunar: p ? p.lunar : null,
          activate: false
        }).then((res) => {
          if (res && res.ok) {
            const g = D.groupById(S, groupId);
            toast('已登记到 ' + (g ? g.name : '临时'));
            defaultCache.clear();
            renderAll();
          }
        });
        closeModal();
      };
      input.addEventListener('input', refresh);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
      $('[data-act="save"]', root).addEventListener('click', save);
      $('[data-act="cancel"]', root).addEventListener('click', closeModal);
      setTimeout(() => input.focus(), 40);
    });
  }

  function openTodoModal(opts) {
    opts = opts || {};
    const editing = !!opts.todo;
    const t = opts.todo || null;
    const groupId = t ? t.groupId : (opts.groupId || activeGroupId);
    cancelCollapse();
    if (mode === 'collapsed') setMode('overview');

    const prio = t ? t.priority : 'none';
    const body =
      '<div class="modal-grid">' +
      '  <div class="full"><label class="label">任务 TASK</label><input class="input" id="mTitle" placeholder="要做什么？" autocomplete="off" /></div>' +
      '  <div class="full"><label class="label">备注 NOTES</label><textarea class="textarea" id="mNotes" rows="2" placeholder="可选"></textarea></div>' +
      '  <div class="full"><label class="label">计划与重复 PLAN</label><div class="plan-host" id="mPlanHost"></div></div>' +
      '  <div><label class="label">分组 GROUP</label><select class="select" id="mGroup"></select></div>' +
      '  <div><label class="label">优先级 PRIORITY</label><div class="prio-row" id="mPrio">' +
      D.PRIORITIES.map((p) => '<button type="button" class="pbtn' + (p === prio ? ' on' : '') + '" data-prio="' + p + '">' + D.PRIORITY_LABEL[p] + '</button>').join('') +
      '</div></div>' +
      '</div>';

    const foot =
      (editing ? '<button class="btn danger sm" data-act="del">删除 DEL</button>' : '') +
      '<div class="spacer"></div>' +
      '<span class="kbd">ENTER 保存</span>' +
      '<button class="btn ghost" data-act="cancel">取消</button>' +
      '<button class="btn primary" data-act="save">' + (editing ? '保存 SAVE' : '登记 ADD') + '</button>';

    openModal(modalShell(
      editing ? '编辑任务 / EDIT RECORD' : '新建任务 / NEW RECORD',
      D.groupById(S, groupId) ? D.groupById(S, groupId).name : '',
      body, foot
    ), (root) => {
      const titleInput = $('#mTitle', root);
      const notes = $('#mNotes', root);
      const group = $('#mGroup', root);
      const prioRow = $('#mPrio', root);
      let plan = null;

      sortedGroups().forEach((g) => {
        const o = doc.createElement('option');
        o.value = g.id;
        o.textContent = g.name;
        if (g.id === groupId) o.selected = true;
        group.appendChild(o);
      });

      if (t) {
        titleInput.value = t.title;
        notes.value = t.notes || '';
      }
      plan = window.NeonPlan.mount($('#mPlanHost', root), {
        dueAt: t ? t.dueAt : null,
        repeat: t ? t.repeat : 'none',
        lunar: t ? t.lunar : null
      });

      prioRow.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-prio]');
        if (!b) return;
        $$('.pbtn', prioRow).forEach((x) => x.classList.toggle('on', x === b));
      });

      const save = () => {
        const title = titleInput.value.trim();
        if (!title) { titleInput.focus(); toast('请先输入任务内容', 'warn'); return; }
        const onBtn = $('.pbtn.on', prioRow);
        const planValue = plan.get();
        const payload = {
          title: title,
          notes: notes.value,
          dueAt: planValue.dueAt,
          repeat: planValue.repeat,
          repeatUntil: planValue.repeatUntil,
          repeatCount: planValue.repeatCount,
          lunar: planValue.lunar,
          priority: onBtn ? onBtn.dataset.prio : 'none',
          groupId: group.value
        };
        if (editing) {
          API.op({ type: 'todo:update', id: t.id, patch: payload });
          toast('任务已更新 // UPDATED');
        } else {
          API.op({
            type: 'todo:add',
            title: payload.title, notes: payload.notes, dueAt: payload.dueAt,
            repeat: payload.repeat, repeatUntil: payload.repeatUntil, repeatCount: payload.repeatCount, lunar: payload.lunar, priority: payload.priority, groupId: payload.groupId
          }).then((res) => {
            if (res && res.ok && res.id) {
              defaultCache.clear();
              renderAll();
              const card = $('.todo-card[data-id="' + res.id + '"]', el.cardLayer);
              if (card) {
                card.classList.add('fresh');
                setTimeout(() => card.classList.remove('fresh'), 700);
              }
            }
          });
          toast('任务已登记 // FILED');
        }
        closeModal();
      };

      $('[data-act="save"]', root).addEventListener('click', save);
      $('[data-act="cancel"]', root).addEventListener('click', closeModal);
      const delBtn = $('[data-act="del"]', root);
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          if (delBtn.dataset.confirm === '1') {
            API.op({ type: 'todo:delete', id: t.id });
            closeModal();
            toast('任务已删除 // PURGED');
            return;
          }
          delBtn.dataset.confirm = '1';
          delBtn.textContent = '确认删除?';
        });
      }

      titleInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
      [notes, group].forEach((node) => {
        node.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey || node !== notes)) { ev.preventDefault(); save(); }
        });
      });
      setTimeout(() => { titleInput.focus(); titleInput.select(); }, 30);
    });
  }

  function openGroupModal(group) {
    const editing = !!group;
    cancelCollapse();
    if (mode === 'collapsed') setMode('overview');

    const body =
      '<div class="modal-grid">' +
      '  <div class="full"><label class="label">分组名称 GROUP NAME</label><input class="input" id="gName" autocomplete="off" placeholder="例如：工作 WORK" /></div>' +
      '  <div class="full"><label class="label">分组颜色 GROUP COLOR</label><div class="set-hint" style="margin:-2px 0 6px">用于卡片左侧色条、分组标签与卡盒指示灯（点击立即生效）</div><div class="color-row" id="gColors"></div></div>' +
      '</div>';
    const foot =
      (editing && S.groups.length > 1 && !group.locked ? '<button class="btn danger sm" data-act="del">删除分组</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn ghost" data-act="cancel">取消</button>' +
      '<button class="btn primary" data-act="save">' + (editing ? '保存 SAVE' : '创建 CREATE') + '</button>';

    openModal(modalShell(
      editing ? '编辑分组 / EDIT GROUP' : '新建分组 / NEW GROUP',
      editing ? (group.locked ? '固定分组' : 'GROUP') : '新建索引卡盒',
      body, foot
    ), (root) => {
      const name = $('#gName', root);
      const colors = $('#gColors', root);
      let picked = editing ? group.color : D.COLOR_KEYS[0];
      if (editing) name.value = group.name;

      D.COLOR_KEYS.forEach((key) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'cbtn' + (key === picked ? ' on' : '');
        b.style.background = D.PALETTE[key];
        b.dataset.color = key;
        b.title = key;
        colors.appendChild(b);
      });
      colors.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-color]');
        if (!b) return;
        picked = b.dataset.color;
        $$('.cbtn', colors).forEach((x) => x.classList.toggle('on', x === b));
        if (editing) {
          API.op({ type: 'group:update', id: group.id, patch: { color: picked } });
          toast('分组颜色已更新');
        }
      });

      const save = () => {
        const value = name.value.trim();
        if (!value) { name.focus(); toast('请输入分组名称', 'warn'); return; }
        if (editing) {
          API.op({ type: 'group:update', id: group.id, patch: { name: value, color: picked } });
          toast('分组已更新 // UPDATED');
        } else {
          API.op({ type: 'group:add', name: value, color: picked }).then((res) => {
            if (res && res.ok && res.id) switchGroup(res.id);
          });
          toast('分组已创建 // CREATED');
        }
        closeModal();
      };

      $('[data-act="save"]', root).addEventListener('click', save);
      $('[data-act="cancel"]', root).addEventListener('click', closeModal);
      const delBtn = $('[data-act="del"]', root);
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          if (delBtn.dataset.confirm === '1') {
            API.op({ type: 'group:delete', id: group.id }).then((res) => {
              if (!res.ok) toast('无法删除：固定分组或最后一个分组', 'bad');
              else toast('分组已删除 · 任务已转移');
            });
            closeModal();
            return;
          }
          delBtn.dataset.confirm = '1';
          delBtn.textContent = '确认删除（任务转移到第一个分组）?';
        });
      }
      name.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
      setTimeout(() => { name.focus(); name.select(); }, 30);
    });
  }

  /* ---------------------------------------------------------------- toast */

  function toast(text, kind) {
    if (!el.toast) return;
    const node = doc.createElement('div');
    node.className = 'toast' + (kind ? ' ' + kind : '');
    node.textContent = text;
    el.toast.appendChild(node);
    /* a toast appears where nothing else on the layer is, and stays up long enough to
       be read — outside the region the OS simply clips it away */
    shapeInvalidate(2400);
    setTimeout(() => { node.classList.add('out'); shapeInvalidate(500); }, 1900);
    setTimeout(() => { node.remove(); shapeInvalidate(500); }, 2300);
  }
})();
