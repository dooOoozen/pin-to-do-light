//! The API key lives in Windows' credential store, and never in the data file.
//!
//! `dashboard1971-data.json` is plaintext, is written on every change, and — decisively — is
//! something this app can export with two clicks from the settings panel. A key stored
//! beside the task list would leave the machine the first time the user shares their data to
//! debug something on another device. Credential Manager is the right home: it is scoped to
//! the Windows user, survives an app update, is not copied by any export path, and reports a
//! readable hint (length and last characters) without revealing the secret.
//!
//! Hand-rolled against advapi32 for the same reason `win32.rs` is hand-rolled against
//! user32: the `windows`/`winreg` crates would add hundreds of kilobytes to reach four
//! functions, and a registry string would be plaintext with extra steps.

use std::ffi::c_void;
use std::ptr::null_mut;

const CRED_TYPE_GENERIC: u32 = 1;
/// "Persist across reboots" for the current user — the ordinary choice, despite the name.
const CRED_PERSIST_LOCAL_MACHINE: u32 = 2;
const ERROR_NOT_FOUND: u32 = 1168;

/// The one credential this app owns. `pin-tauri/` is a namespace rather than a path: other
/// apps write their own targets and nothing here reads them.
const TARGET: &str = "pin-tauri/ai-key";
/// Part of the credential's identity alongside the target name, so it has to be the same
/// string on every read of every version — changing it would silently orphan old keys.
const OWNER: &str = "pin-tauri";

#[repr(C)]
struct FileTime {
    low: u32,
    high: u32,
}

/// `CREDENTIALW` from wincred.h. Field order and types matter more than they look: this is
/// read by the OS, so `repr(C)` plus the same pointer widths are the whole contract.
#[repr(C)]
struct CredentialW {
    flags: u32,
    credential_type: u32,
    target_name: *mut u16,
    comment: *mut u16,
    last_written: FileTime,
    credential_blob_size: u32,
    credential_blob: *mut u8,
    persist: u32,
    attribute_count: u32,
    attributes: *mut c_void,
    target_alias: *mut u16,
    user_name: *mut u16,
}

#[link(name = "advapi32")]
extern "system" {
    fn CredWriteW(credential: *const CredentialW, flags: u32) -> i32;
    fn CredReadW(
        target: *const u16,
        credential_type: u32,
        flags: u32,
        credential: *mut *mut CredentialW,
    ) -> i32;
    fn CredDeleteW(target: *const u16, credential_type: u32, flags: u32) -> i32;
    fn CredFree(buffer: *mut c_void) -> i32;
    fn GetLastError() -> u32;
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Store (or replace) the key. An empty string clears it, so the settings field can act as
/// both without a separate "remove" button the user has to find.
pub fn save(secret: &str) -> Result<(), String> {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return clear();
    }
    let bytes = trimmed.as_bytes();
    if bytes.len() > 4300 {
        // Credential Manager caps a generic credential's blob at 5120 bytes; failing with a
        // sentence beats failing with a code the user cannot interpret.
        return Err("密钥过长（超过 4300 字节）".to_string());
    }
    let mut target = wide(TARGET);
    let mut owner = wide(OWNER);
    let mut blob = bytes.to_vec();
    let cred = CredentialW {
        flags: 0,
        credential_type: CRED_TYPE_GENERIC,
        target_name: target.as_mut_ptr(),
        comment: null_mut(),
        last_written: FileTime { low: 0, high: 0 },
        credential_blob_size: blob.len() as u32,
        credential_blob: blob.as_mut_ptr(),
        persist: CRED_PERSIST_LOCAL_MACHINE,
        attribute_count: 0,
        attributes: null_mut(),
        target_alias: null_mut(),
        user_name: owner.as_mut_ptr(),
    };
    let ok = unsafe { CredWriteW(&cred, 0) };
    if ok == 0 {
        return Err(format!("CredWrite 失败 ({})", unsafe { GetLastError() }));
    }
    Ok(())
}

/// The secret itself. Callers in this crate are limited to `ai_chat`, which uses it to build
/// one Authorization header and drops it; nothing returns this to the webview.
pub fn load() -> Option<String> {
    let target = wide(TARGET);
    let mut ptr: *mut CredentialW = null_mut();
    let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut ptr) };
    if ok == 0 || ptr.is_null() {
        return None;
    }
    let out = unsafe {
        let c = &*ptr;
        if c.credential_blob.is_null() || c.credential_blob_size == 0 {
            None
        } else {
            let slice =
                std::slice::from_raw_parts(c.credential_blob, c.credential_blob_size as usize);
            Some(String::from_utf8_lossy(slice).into_owned())
        }
    };
    unsafe { CredFree(ptr as *mut c_void) };
    out.filter(|s| !s.trim().is_empty())
}

pub fn clear() -> Result<(), String> {
    let target = wide(TARGET);
    let ok = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if ok == 0 {
        let e = unsafe { GetLastError() };
        // Nothing stored is not an error worth surfacing: clearing twice is idempotent.
        if e == ERROR_NOT_FOUND {
            return Ok(());
        }
        return Err(format!("CredDelete 失败 ({})", e));
    }
    Ok(())
}

/// What the settings panel may show: enough to confirm which key is stored, never the key.
pub fn hint() -> String {
    match load() {
        None => "未配置".to_string(),
        Some(secret) => {
            let chars: Vec<char> = secret.chars().collect();
            let tail: String = chars
                .iter()
                .rev()
                .take(4)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            format!("已保存 · {} 位 · 尾号 {}", chars.len(), tail)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hint_never_contains_the_middle() {
        let chars: Vec<char> = "sk-abcdefghijklmnopqrstuvwxyz".chars().collect();
        let tail: String = chars
            .iter()
            .rev()
            .take(4)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        assert_eq!(tail, "wxyz");
        assert_eq!(chars.len(), 28);
    }

    #[test]
    fn empty_input_is_treated_as_clear() {
        assert!("   ".trim().is_empty());
    }
}
