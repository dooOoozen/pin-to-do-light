// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// wry passes these by default; setting the browser args replaces that default, so
/// they have to be re-added by hand whichever mode is chosen.
const FEATURES: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

fn main() {
    /* WebView2 is its own system-installed runtime, so the Electron-side memory win
       does not carry over for free: Tauri's own process is ~13 MB but WebView2 spawns
       a ~97 MB GPU process of its own. These are the same three switches that took
       the Electron build from 239 MB to 91 MB. They must be set before the
       CoreWebView2Environment exists, which is why this happens here and not in
       setup(). */
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        if std::env::args().any(|a| a == "--gpu") {
            /* An A/B switch, not a shipping mode. It exists because a black strip
               across a hovered card looked exactly like a promoted compositor layer
               (will-change:transform + backface-visibility:hidden) whose exposed
               pixels are never repainted under software compositing. That theory was
               wrong — the strip was the window region clipping the card's real
               painted box — so keep this for future memory experiments, but do not
               reach for it as the explanation for a clipped card. */
            FEATURES.to_string()
        } else {
            // a longer list (crash reporter, breakpad, back-forward cache, translate)
            // bought 1.5 MB and crashpad still spawned: dropped as risk without gain
            format!("--disable-gpu --disable-gpu-compositing --in-process-gpu {FEATURES}")
        },
    );

    pin_tauri_lib::run()
}
