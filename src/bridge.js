/**
 * DASHBOARD 1971 — renderer API adapter.
 * Three hosts share one surface: Electron (preload bridge), Tauri (invoke), and a
 * plain browser (localStorage + BroadcastChannel, for `npm run web`).
 *
 * isElectron stays false under Tauri on purpose: it selects the <input type=file>
 * import path, which works here, and suppresses the toast for the autostart toggle,
 * which has not been ported yet.
 */
(function () {
  'use strict';

  const D = window.NeonData;
  const native = window.dashboard1971;
  const TAURI = window.__TAURI__;

  if (native && native.isElectron) {
    window.API = native;
    window.IS_ELECTRON = true;
    return;
  }

  function fanoutTo(set, copy) {
    set.forEach((cb) => { try { cb(copy); } catch (e) { /* ignore */ } });
  }

  /* ---------------------------------------------------------------- tauri */
  if (TAURI && TAURI.core) {
    const invoke = TAURI.core.invoke;
    const stateListeners = new Set();
    const commandListeners = new Set();
    let state = null;

    /* the layer is invisible at rest and the host has no console, so boot progress
       and page errors are written back through a command instead */
    const note = (text) => { try { invoke('boot_note', { note: text }); } catch (e) { /* ignore */ } };
    window.addEventListener('error', (ev) => {
      note('ERROR ' + (ev.message || '?') + ' @' + (ev.filename || '?') + ':' + (ev.lineno || 0));
    });
    window.addEventListener('unhandledrejection', (ev) => {
      note('REJECT ' + String((ev.reason && ev.reason.message) || ev.reason));
    });
    note('bridge tauri: NeonData=' + (D ? 'ok' : 'MISSING') + ' stage=' + document.readyState);

    function payloadOf(event) {
      const p = event && event.payload;
      if (typeof p === 'string') { try { return JSON.parse(p); } catch (e) { return null; } }
      return p;
    }

    if (TAURI.event) {
      TAURI.event.listen('state', (e) => {
        const next = payloadOf(e);
        if (!next) return;
        state = D.normalize(next);
        fanoutTo(stateListeners, JSON.parse(JSON.stringify(state)));
      });
      TAURI.event.listen('command', (e) => {
        const cmd = payloadOf(e);
        if (cmd) fanoutTo(commandListeners, cmd);
      });
    }

    window.API = {
      isElectron: false,
      isTauri: true,
      getState: async () => {
        const raw = await invoke('state_load');
        state = raw ? D.normalize(JSON.parse(raw)) : D.defaultState();
        note('getState ' + (raw ? 'from disk' : 'defaults') + ' todos=' + state.todos.length);
        return JSON.parse(JSON.stringify(state));
      },
      /* the reducer lives in shared/data.js and stays in the renderer; the host
         only persists and rebroadcasts, so no schema had to be mirrored in Rust */
      op: async (op) => {
        if (!state) await window.API.getState();
        const res = D.applyOp(state, op);
        if (res.ok) await invoke('state_commit', { json: JSON.stringify(state) });
        return res;
      },
      onState: (cb) => { stateListeners.add(cb); return () => stateListeners.delete(cb); },
      onCommand: (cb) => { commandListeners.add(cb); return () => commandListeners.delete(cb); },
      setIgnoreMouse: (value) => { invoke('set_click_through', { ignore: !!value }); },
      /* the key must match the Rust parameter name exactly: Tauri deserialises
         command arguments by name, and a mismatch silently yields None for an
         Option<Vec<T>>, which here meant "whole window" every single time */
      setShape: (spans) => { invoke('set_layer_shape', { spans: spans === null ? null : spans }); },
      hideOverlay: () => window.API.op({ type: 'settings:update', patch: { overlay: false } }),
      showOverlay: () => window.API.op({ type: 'settings:update', patch: { overlay: true } }),
      forceShowOverlay: () => { invoke('overlay_show', { show: true }); invoke('cursor_watch', { on: true }); },
      cursorWatch: (on) => { invoke('cursor_watch', { on: !!on }); },
      /* host primitives that the Electron build kept in its main process and that
         now live in the renderer: transient window visibility, the foreground
         watcher that replaced focus-watch.ps1, and the one-way summary that drives
         the tray menu, the global shortcut and the autostart registration */
      setLayerVisible: (on) => { invoke('overlay_show', { show: !!on }); },
      forceShowLayer: (ms) => { invoke('force_show', { ms: ms || 6000 }); },
      foregroundWatch: (on) => { invoke('foreground_watch', { on: !!on }); },
      syncHost: (summary) => { invoke('sync_host', { summary }); },
      bootNote: (text) => { invoke('boot_note', { note: text }); },
      /* a white panel can mean the stylesheet never applied or it can mean the
         compositor never showed anything; these two readings tell them apart */
      reportRender: (tag) => {
        const cs = getComputedStyle(document.body);
        const first = document.querySelector('.sidebar, .side, main, .app');
        const r = first ? first.getBoundingClientRect() : null;
        invoke('boot_note', {
          note: tag + ' sheets=' + document.styleSheets.length +
            ' bodyBg=' + cs.backgroundColor + ' bodyColor=' + cs.color +
            ' nodes=' + document.getElementsByTagName('*').length +
            ' first=' + (first ? first.className + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) : 'none') +
            ' zoom=' + cs.zoom,
        });
      },
      feedStats: () => invoke('feed_stats'),
      openDashboard: (view) => invoke('open_dashboard', { view: view || null }),
      takePanelView: () => invoke('panel_take_view'),
      panelReady: () => { invoke('panel_ready'); },
      closeDashboard: () => { invoke('close_dashboard'); },
      toggleDashboard: () => invoke('toggle_dashboard'),
      /* CSS `zoom` on the root is NOT a stand-in for page zoom: the drag ghost is
         positioned with translate3d(clientX, clientY), and an ancestor CSS zoom
         multiplies that offset again, so the card lands 1.3x away from the pointer
         (and the scroll port stops matching). Ask WebView2 for its real zoom. */
      setZoom: (factor) => {
        const k = Math.min(2, Math.max(0.8, Number(factor) || 1));
        invoke('set_webview_zoom', { factor: k }).catch((e) => {
          if (API.bootNote) API.bootNote('set_zoom(' + k + ') failed: ' + e);
        });
      },
      quit: () => { if (TAURI.process) TAURI.process.exit(); },
      notify: (title, body) => { invoke('notify', { title: String(title || ''), body: String(body || '') }); },
      /* a receipt is only worth printing if the user can find the file afterwards, so
         the host writes it and says where; the renderer never guesses a path */
      savePng: (dataUrl, name, dir) => invoke('save_png', { dataUrl: String(dataUrl || ''), name: String(name || 'receipt.png'), dir: String(dir || '') }),
      openDir: (path) => invoke('open_dir', { path: String(path || '') }),
      receiptDir: () => invoke('receipt_dir'),
      monitors: () => invoke('monitors'),
      setDeckMonitor: (index) => invoke('set_deck_monitor', { index: Number(index) }),
      workArea: async () => invoke('work_area'),
      appInfo: async () => invoke('app_info'),
      exportData: async () => JSON.stringify(state, null, 2),
      importData: async () => ({ ok: false, error: 'canceled' }),
      setLoginItem: async () => ({ ok: true }),
      win: {
        minimize() { if (TAURI.window) TAURI.window.getCurrentWindow().minimize(); },
        toggleMax() { if (TAURI.window) TAURI.window.getCurrentWindow().toggleMaximize(); },
        close() { if (TAURI.window) TAURI.window.getCurrentWindow().close(); }
      }
    };
    window.IS_ELECTRON = false;
    return;
  }

  /* ---------------------------------------------------------------- browser */
  const KEY = 'dashboard1971.state.v1';
  const LEGACY_KEY = 'neondeck.state.v1';
  let state = null;
  const stateListeners = new Set();
  const commandListeners = new Set();
  let channel = null;
  try { channel = new BroadcastChannel('dashboard1971'); } catch (e) { channel = null; }

  function load() {
    try {
      /* take over web-preview data saved under the previous app name once */
      const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
      state = raw ? D.normalize(JSON.parse(raw)) : D.defaultState();
      if (raw && !localStorage.getItem(KEY)) {
        try { localStorage.setItem(KEY, raw); } catch (e) { /* ignore */ }
        try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ }
      }
    } catch (e) {
      state = D.defaultState();
    }
    if (!state) state = D.defaultState();
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function fanout() {
    const copy = JSON.parse(JSON.stringify(state));
    stateListeners.forEach((cb) => { try { cb(copy); } catch (e) { /* ignore */ } });
  }

  load();
  persist();

  if (channel) {
    channel.onmessage = (ev) => {
      if (ev && ev.data && ev.data.type === 'state') { load(); fanout(); }
    };
  }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { load(); fanout(); }
  });

  window.API = {
    isElectron: false,
    getState: async () => JSON.parse(JSON.stringify(state)),
    op: async (op) => {
      const res = D.applyOp(state, op);
      if (res.ok) { persist(); fanout(); }
      return res;
    },
    onState: (cb) => { stateListeners.add(cb); return () => stateListeners.delete(cb); },
    onCommand: (cb) => { commandListeners.add(cb); return () => commandListeners.delete(cb); },
    setIgnoreMouse: () => {},
    setShape: () => {},
    setLayerShape: () => {},
    hideOverlay: () => document.documentElement.classList.add('overlay-hidden'),
    showOverlay: () => document.documentElement.classList.remove('overlay-hidden'),
    forceShowOverlay: () => document.documentElement.classList.remove('overlay-hidden'),
    cursorWatch: () => {},
    setLayerVisible: () => {},
    forceShowLayer: () => {},
    foregroundWatch: () => {},
    syncHost: () => {},
    bootNote: () => {},
    feedStats: async () => null,
    closeDashboard: () => window.close(),
    openDashboard: () => window.open('dashboard.html', '_blank'),
    toggleDashboard: () => window.open('dashboard.html', '_blank'),
    setZoom: (factor) => {
      const k = Math.min(2, Math.max(0.8, Number(factor) || 1.3));
      document.documentElement.style.zoom = String(k);
    },
    quit: () => {},
    notify: (title, body) => {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') new Notification(title, { body });
      else Notification.requestPermission().then((p) => { if (p === 'granted') new Notification(title, { body }); });
    },
    workArea: async () => ({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }),
    appInfo: async () => ({ version: 'web', mode: 'browser' }),
    exportData: async () => JSON.stringify(state, null, 2),
    importData: async () => ({ ok: false, error: 'browser-mode' }),
    setLoginItem: async () => ({ ok: false, error: 'browser-mode' }),
    win: { minimize() {}, toggleMax() {}, close() { window.close(); } }
  };
  window.IS_ELECTRON = false;
  window.webCommand = (cmd) => commandListeners.forEach((cb) => { try { cb(cmd); } catch (e) { /* ignore */ } });
})();
