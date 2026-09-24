//! One HTTPS POST, with no crates.
//!
//! `reqwest` is not in this dependency graph for Windows — it appears in Cargo.lock only
//! through another platform's resolution — so adding an HTTP client here would have cost
//! hundreds of kilobytes against a 1.53 MB installer, plus a TLS backend's opinion. WinHTTP
//! ships with Windows, speaks TLS, follows the system proxy and the user's corporate root
//! certificates without asking, and is declared here the same way `win32.rs` declares
//! user32: a handful of `#[link]` signatures and no bindings crate.
//!
//! This is deliberately not a general HTTP client. It does one thing the agent needs: post a
//! JSON body to an `https://` endpoint with a bearer token and hand back the status and the
//! body. `http://` is refused outright rather than upgraded, because the payload it would
//! carry is an API key, and a silently-plaintext request is the kind of bug that looks fine
//! on a laptop and is a leak everywhere else.

use std::ffi::c_void;
use std::ptr::{null, null_mut};

type Handle = *mut c_void;

const WINHTTP_FLAG_SECURE: u32 = 0x0080_0000;
/* Read the machine's real proxy configuration — the one a browser uses, including a PAC
   script and whatever the VPN client set in 系统设置 → 代理. `DEFAULT_PROXY` (0) is the
   trap here: it means "the proxy configured for the WinHTTP *service*", which is empty
   unless an administrator ran `netsh winhttp set proxy`, so an app built that way cannot
   reach anything the user's browser reaches and reports a bare timeout. */
const WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY: u32 = 4;
const WINHTTP_QUERY_STATUS_CODE: u32 = 19;
const WINHTTP_ADDREQ_FLAG_ADD: u32 = 0x2000_0000;
const WINHTTP_ADDREQ_FLAG_REPLACE: u32 = 0x8000_0000;
const WINHTTP_NO_CLIENT_CERT_CONTEXT: *mut c_void = null_mut();

/// WinHTTP reports a number; the settings screen needs a sentence. These five cover every
/// failure seen on this machine, and the difference between them is the difference between
/// "your key is wrong", "this URL is blocked here" and "your proxy is not being used".
fn winhttp_says(code: u32) -> &'static str {
    match code {
        12002 => "连接超时（网络不通或被墙；若浏览器能打开，检查系统代理）",
        12029 => "无法建立连接（地址或端口不通）",
        12030 => "连接被重置",
        12031 => "连接被对方关闭",
        12175 => "TLS 握手失败（证书或协议问题）",
        12005 => "地址格式不正确",
        12163 => "找不到该主机（DNS）",
        _ => "WinHTTP 错误",
    }
}

#[link(name = "winhttp")]
extern "system" {
    fn WinHttpOpen(
        agent: *const u16,
        access_type: u32,
        proxy: *const u16,
        proxy_bypass: *const u16,
        flags: u32,
    ) -> Handle;
    fn WinHttpConnect(session: Handle, server: *const u16, port: u16, reserved: u32) -> Handle;
    fn WinHttpOpenRequest(
        connect: Handle,
        verb: *const u16,
        object: *const u16,
        version: *const u16,
        ref_server: *const u16,
        ref_port: *const u16,
        flags: u32,
    ) -> Handle;
    fn WinHttpAddRequestHeaders(
        request: Handle,
        headers: *const u16,
        length: u32,
        modifiers: u32,
    ) -> i32;
    fn WinHttpSetTimeouts(
        handle: Handle,
        resolve: i32,
        connect: i32,
        send: i32,
        receive: i32,
    ) -> i32;
    fn WinHttpSendRequest(
        request: Handle,
        headers: *const u16,
        headers_len: u32,
        optional: *const c_void,
        optional_len: u32,
        total_len: u32,
        context: usize,
    ) -> i32;
    fn WinHttpReceiveResponse(request: Handle, reserved: *mut c_void) -> i32;
    fn WinHttpQueryHeaders(
        request: Handle,
        level: u32,
        name: *const u16,
        buffer: *mut c_void,
        length: *mut u32,
        index: *mut u32,
    ) -> i32;
    fn WinHttpQueryDataAvailable(request: Handle, available: *mut u32) -> i32;
    fn WinHttpReadData(
        request: Handle,
        buffer: *mut c_void,
        to_read: u32,
        read: *mut u32,
    ) -> i32;
    fn WinHttpCloseHandle(handle: Handle) -> i32;
    fn GetLastError() -> u32;
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Where a POST goes, split far enough to satisfy WinHTTP's three-step shape.
struct Endpoint {
    host: String,
    path: String,
    port: u16,
    secure: bool,
}

fn split(url: &str) -> Result<Endpoint, String> {
    let (scheme, rest) = url
        .split_once("://")
        .ok_or_else(|| "url 缺少 https:// 前缀".to_string())?;
    let secure = match scheme {
        "https" => true,
        "http" => false,
        other => return Err(format!("不支持的协议 {}", other)),
    };
    let (authority, path) = match rest.split_once('/') {
        Some((a, p)) => (a.to_string(), format!("/{}", p)),
        None => (rest.to_string(), "/".to_string()),
    };
    // A userinfo or a query on the authority means the caller pasted something unexpected;
    // better to say so than to send it somewhere surprising.
    if authority.contains('@') {
        return Err("url 不应包含账号信息".to_string());
    }
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) => (
            h.to_string(),
            p.parse::<u16>().map_err(|e| e.to_string())?,
        ),
        _ => (authority.clone(), if secure { 443 } else { 80 }),
    };
    if host.is_empty() {
        return Err("url 没有主机名".to_string());
    }
    /* Cleartext is refused, because this payload carries a bearer token and a silently
       plaintext request is a leak that looks like it works. One exception, deliberately:
       loopback. Without it the agent cannot be driven against a local mock provider, and a
       mock is the only honest way to test the whole chain — and the eval set after it —
       without spending a real key on every run. */
    if !secure && !is_loopback(&host) {
        return Err("仅支持 https://（127.0.0.1 / localhost 例外，供本地 mock 使用）".to_string());
    }
    Ok(Endpoint {
        host,
        path,
        port,
        secure,
    })
}

fn is_loopback(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host == "127.0.0.1"
        || host == "::1"
        || host == "[::1]"
}

/// GET a JSON endpoint with a bearer token. Used by the connectivity test, which must be
/// able to answer "is this configured right" without spending the user's quota — the
/// standard `/models` list is free on every provider tried so far.
pub fn get_json(url: &str, bearer: &str) -> Result<(u16, String), String> {
    call("GET", url, None, bearer)
}

/// POST `body` as application/json and return `(status, response body)`.
///
/// A transport failure is an `Err`; an HTTP 4xx/5xx is **not** — it comes back with its
/// status and body intact, because the provider's error text ("model not found",
/// "insufficient credits", "this deployment requires an org") is the only thing that makes
/// the settings screen diagnosable instead of mysterious.
pub fn post_json(url: &str, body: &str, bearer: &str) -> Result<(u16, String), String> {
    call("POST", url, Some(body), bearer)
}

fn call(method: &str, url: &str, body: Option<&str>, bearer: &str) -> Result<(u16, String), String> {
    let ep = split(url)?;
    unsafe {
        let agent = wide("pin-tauri/0.1");
        let session = WinHttpOpen(
            agent.as_ptr(),
            WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
            null(),
            null(),
            0,
        );
        if session.is_null() {
            return Err(format!("WinHttpOpen 失败 ({})", GetLastError()));
        }
        // Resolve/connect are failures of the network; send/receive are failures of the
        // provider. All four are generous enough for a slow phone tether and short enough
        // that the UI never hangs on a dead endpoint.
        WinHttpSetTimeouts(session, 10_000, 15_000, 30_000, 60_000);

        let server = wide(&ep.host);
        let connect = WinHttpConnect(session, server.as_ptr(), ep.port, 0);
        if connect.is_null() {
            WinHttpCloseHandle(session);
            return Err(format!("WinHttpConnect {} 失败 ({})", ep.host, GetLastError()));
        }

        let verb = wide(method);
        let object = wide(&ep.path);
        let request = WinHttpOpenRequest(
            connect,
            verb.as_ptr(),
            object.as_ptr(),
            null(),
            null(),
            null(),
            if ep.secure { WINHTTP_FLAG_SECURE } else { 0 },
        );
        if request.is_null() {
            WinHttpCloseHandle(connect);
            WinHttpCloseHandle(session);
            return Err(format!("WinHttpOpenRequest 失败 ({})", GetLastError()));
        }

        let mut headers = String::from("Accept: application/json\r\n");
        if body.is_some() {
            headers.push_str("Content-Type: application/json\r\n");
        }
        if !bearer.is_empty() {
            headers.push_str(&format!("Authorization: Bearer {}\r\n", bearer));
        }
        let headers = wide(&headers);
        let added = WinHttpAddRequestHeaders(
            request,
            headers.as_ptr(),
            !0u32,
            WINHTTP_ADDREQ_FLAG_ADD | WINHTTP_ADDREQ_FLAG_REPLACE,
        );
        if added == 0 {
            let e = GetLastError();
            close_all(request, connect, session);
            return Err(format!("请求头被拒绝（{}：{}）", e, winhttp_says(e)));
        }

        // The payload is handed to SendRequest itself rather than streamed, which keeps the
        // whole exchange to one call and is comfortably small: a chat turn with the task
        // list is a few kilobytes.
        let bytes = body.unwrap_or("").as_bytes();
        let sending = if body.is_some() {
            (bytes.as_ptr() as *const c_void, bytes.len() as u32, bytes.len() as u32)
        } else {
            (null(), 0, 0)
        };
        let sent = WinHttpSendRequest(
            request,
            null(),
            0,
            sending.0,
            sending.1,
            sending.2,
            0,
        );
        if sent == 0 {
            let e = GetLastError();
            close_all(request, connect, session);
            return Err(format!("发送失败（{}：{}）", e, winhttp_says(e)));
        }
        if WinHttpReceiveResponse(request, null_mut()) == 0 {
            let e = GetLastError();
            close_all(request, connect, session);
            return Err(format!("等待响应失败（{}：{}）", e, winhttp_says(e)));
        }

        let mut status_buf = [0u16; 8];
        let mut len = (status_buf.len() * 2) as u32;
        let mut index = 0u32;
        let mut status = 0u16;
        if WinHttpQueryHeaders(
            request,
            WINHTTP_QUERY_STATUS_CODE,
            null(),
            status_buf.as_mut_ptr() as *mut c_void,
            &mut len,
            &mut index,
        ) != 0
        {
            /* the buffer comes back NUL-terminated inside a fixed 8-u16 slot, and a Rust
               `trim()` strips whitespace but not the terminator — parsing "200\0\0\0" fails
               and every call looks like status 0. Cut at the first NUL before parsing. */
            let text = String::from_utf16_lossy(&status_buf);
            status = text
                .split('\u{0}')
                .next()
                .unwrap_or("")
                .trim()
                .parse()
                .unwrap_or(0);
        }

        let mut out: Vec<u8> = Vec::new();
        loop {
            let mut available = 0u32;
            if WinHttpQueryDataAvailable(request, &mut available) == 0 {
                break;
            }
            if available == 0 {
                break;
            }
            let want = available.min(16 * 1024) as usize;
            let mut chunk = vec![0u8; want];
            let mut got = 0u32;
            if WinHttpReadData(
                request,
                chunk.as_mut_ptr() as *mut c_void,
                want as u32,
                &mut got,
            ) == 0
                || got == 0
            {
                break;
            }
            chunk.truncate(got as usize);
            out.append(&mut chunk);
        }
        close_all(request, connect, session);

        // Lossy on purpose: a provider that returns invalid UTF-8 has already failed, and
        // the bytes that did decode are what the user needs to read.
        Ok((status, String::from_utf8_lossy(&out).into_owned()))
    }
}

unsafe fn close_all(request: Handle, connect: Handle, session: Handle) {
    // The certificate context parameter is unused here, but naming it keeps the intent
    // visible: no client certificate is presented, ever.
    let _ = WINHTTP_NO_CLIENT_CERT_CONTEXT;
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_an_ordinary_base() {
        let e = split("https://api.deepseek.com/v1/chat/completions").unwrap();
        assert_eq!(e.host, "api.deepseek.com");
        assert_eq!(e.path, "/v1/chat/completions");
        assert_eq!(e.port, 443);
        assert!(e.secure);
    }

    #[test]
    fn refuses_plaintext_anywhere_but_this_machine() {
        assert!(split("http://api.example.com/v1/chat/completions").is_err());
        // the mock provider has to be reachable, or none of this can be tested
        assert!(split("http://127.0.0.1:11434/v1").is_ok());
        assert!(split("http://localhost:11434/v1").is_ok());
        let e = split("https://example.test:8443/v1").unwrap();
        assert_eq!(e.port, 8443);
        assert_eq!(e.path, "/v1");
    }

    #[test]
    fn a_bare_host_gets_a_root_path() {
        let e = split("https://example.test").unwrap();
        assert_eq!(e.path, "/");
    }
}
