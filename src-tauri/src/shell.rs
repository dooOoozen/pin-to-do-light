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
