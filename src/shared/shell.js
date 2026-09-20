/**
 * DASHBOARD 1971 — foreground window classification.
 * Shared by the main process (desktop-only visibility) and the check scripts.
 * The focus watcher emits one line per foreground window:
 *
 *     <hwnd>|<window class>|<process name>
 *
 * The shell (taskbar, start menu, volume flyout, task view, alt-tab, search)
 * is deliberately neither the desktop nor another app: touching those windows
 * must not change the card layer, or every taskbar click would wake the deck.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonShell = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DESKTOP_CLASSES = /^(Progman|WorkerW|SHELLDLL_DefView|SysListView32|SHELLDLL_ViewHost|DesktopDock)$/i;
  var SHELL_CLASSES = /^(Shell_TrayWnd|Shell_SecondaryTrayWnd|NotifyIconOverflowWindow|TopLevelWindowForOverflowXamlIsland|TaskListThumbnailWnd|XamlExplorerHostIslandWindow|Windows\.UI\.Core\.CoreWindow|Windows\.UI\.Composition|ForegroundStaging|MultitaskingViewFrame|Shell_InputSwitchTopLevelWindow|Shell_Dim|#32768|BaseBar|MSCandUIWindow)$/i;
  var SHELL_PROCS = /^(ShellExperienceHost|StartMenuExperienceHost|SearchHost|SearchApp|TextInputHost|ShellHost|Widgets|WidgetService|LockApp|ShellServiceHost)$/i;
  /* the packaged app is "DASHBOARD 1971", the dev run is "electron"; the hwnd
     match below is the reliable test, this is only a fallback */
  var OWN_PROCS = /(dashboard\s*1971|dashboard-1971|neondeck)/i;

  /* 'own' (the card layer) | 'dash' (our task panel) | 'desktop' (wallpaper)
     | 'shell' (system UI) | 'app' (any other program)
     ownHandles/dashHandles: window handles of the app's own windows (strings) */
  function classify(line, ownHandles, dashHandles) {
    var parts = String(line || '').split('|');
    var hwnd = parts[0] || '';
    var cls = parts[1] || '';
    var proc = parts[2] || '';
    if (!hwnd && !cls && !proc) return 'desktop';  /* no foreground window at all */
    if (hwnd && ownHandles && ownHandles.indexOf(hwnd) >= 0) return 'own';
    if (hwnd && dashHandles && dashHandles.indexOf(hwnd) >= 0) return 'dash';
    if (OWN_PROCS.test(proc)) return 'own';
    if (SHELL_PROCS.test(proc)) return 'shell';
    if (SHELL_CLASSES.test(cls)) return 'shell';
    if (DESKTOP_CLASSES.test(cls)) return 'desktop';
    return 'app';
  }

  /* should the card layer be on screen for this foreground window? */
  function visible(line, ownHandles, dashHandles) {
    var kind = classify(line, ownHandles, dashHandles);
    return kind === 'own' || kind === 'desktop';
  }

  return { classify: classify, visible: visible };
});
