//! Foreground-window classification: the port of shared/shell.js.
//!
//! The system shell (taskbar, start menu, volume flyout, task view, alt-tab, search)
//! is deliberately neither "the desktop" nor "another app": if touching it changed the
//! card layer, every taskbar click would wake the deck.

const DESKTOP_CLASSES: [&str; 6] = [
    "Progman",
    "WorkerW",
    "SHELLDLL_DefView",
    "SysListView32",
    "SHELLDLL_ViewHost",
    "DesktopDock",
];

const SHELL_CLASSES: [&str; 14] = [
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "NotifyIconOverflowWindow",
    "TopLevelWindowForOverflowXamlIsland",
    "TaskListThumbnailWnd",
    "XamlExplorerHostIslandWindow",
    "ForegroundStaging",
    "MultitaskingViewFrame",
    "Shell_InputSwitchTopLevelWindow",
    "Shell_Dim",
    "#32768",
    "BaseBar",
    "MSCandUIWindow",
    "VT_DesktopShell_GeneralWindow",
];

const SHELL_CLASS_PREFIXES: [&str; 2] = ["Windows.UI.Core.CoreWindow", "Windows.UI.Composition"];

/// Shell processes other than `explorer`, which is handled separately — see is_shell_proc.
const SHELL_PROCS: [&str; 10] = [
    "ShellExperienceHost",
    "StartMenuExperienceHost",
    "SearchHost",
    "SearchApp",
    "TextInputHost",
    "ShellHost",
    "Widgets",
    "WidgetService",
    "LockApp",
    "ShellServiceHost",
];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Own,
    Dash,
    Desktop,
    Shell,
    App,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Own => "own",
            Kind::Dash => "dash",
            Kind::Desktop => "desktop",
            Kind::Shell => "shell",
            Kind::App => "app",
        }
    }
}

fn eq(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

fn any(haystack: &[&str], needle: &str) -> bool {
    haystack.iter().any(|h| eq(h, needle))
}

/// The shell's own processes. Used for one narrower question than `classify` answers:
/// can this window be "the film you are watching"?
///
/// `explorer` is here and `classify` does not treat it as shell, because the two answers
/// have to differ: a folder window IS a foreign application for the sake of the
/// desktop-only rule, and hiding the deck behind it is the feature working. But explorer
/// never plays a film, and its top levels are exactly the windows a *spanning* desktop
/// owns — the desktop's own window on this machine measures 3840x1168 because it covers
/// both displays, which passes any monitor-sized test. So the desktop can be a cover and
/// must never be a cinema.
pub fn is_shell_proc(proc: &str) -> bool {
    any(&SHELL_PROCS, proc) || eq(proc, "explorer")
}

/// Desktop organisers: programs that draw the wallpaper and the desktop icons themselves.
///
/// Measured on the machine that reported the bug, not from a list on the internet — the
/// boot log named the window exactly once the visibility decision started logging the one
/// that made it: `TXMiniSkin | DesktopMgr64` (腾讯桌面整理). It is not in the shell's own
/// list of desktop class names, so it classifies as a foreign application, and it covers
/// the monitor because covering the monitor is what wallpaper is. Every click on the
/// desktop therefore read as "a video started" and the deck hid itself.
///
/// This is a name list and it will not catch every such program; the structural test that
/// does is `is_fullscreen`'s upper bound (a window wider than the monitor it is on is a
/// surface, not a film). Keep both: the bound catches the ones that span the desktop, the
/// names catch the ones that draw one monitor at a time.
pub fn is_desktop_surface(class: &str, proc: &str) -> bool {
    any(&DESKTOP_SURFACE_CLASSES, class) || any(&DESKTOP_SURFACE_PROCS, proc)
}

const DESKTOP_SURFACE_CLASSES: [&str; 3] = ["TXMiniSkin", "TXMiniObj", "TXMiniBar"];

const DESKTOP_SURFACE_PROCS: [&str; 2] = ["DesktopMgr64", "DesktopMgr"];

/// Identifying our own two windows goes through the window *title* rather than the
/// handle: asking Tauri for an HWND pulls in its Win32 feature, and matching on the
/// process name cannot tell the card layer from the task panel. `title` is the
/// foreground window's text.
pub fn classify(class: &str, proc: &str, title: &str) -> Kind {
    if title.starts_with("Pin To-Do") {
        return if title.contains("卡片层") { Kind::Own } else { Kind::Dash };
    }
    if any(&DESKTOP_CLASSES, class) {
        return Kind::Desktop;
    }
    if any(&SHELL_CLASSES, class) || SHELL_CLASS_PREFIXES.iter().any(|p| class.starts_with(p)) {
        return Kind::Shell;
    }
    if any(&SHELL_PROCS, proc) {
        return Kind::Shell;
    }
    Kind::App
}
