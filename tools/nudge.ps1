# Nudge a window by one pixel and back, from outside the process, to see whether the desktop
# composer lets go of a frame it already drew.
#
# A caption painted while WS_CAPTION was briefly set can survive the style going back to
# clean: the window's own surface is invalidated by RedrawWindow, but the composed frame is
# DWM's, and a frame-only recalculation (SWP_FRAMECHANGED with no size change) has been shown
# not to dislodge it. A real size change does force a fresh non-client calculation. This is the
# cheapest way to find out which of the two the band is, without a rebuild and without asking
# anyone to look at a screen and describe it.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/nudge.ps1 -Proc pin-tauri
param([string]$Proc = 'pin-tauri', [string]$Class = 'Tauri Window', [int]$Restore = 400)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class ND {
  [DllImport("user32.dll")] public static extern bool EnumWindows(E cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int m);
  public delegate bool E(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int l, t, r, b; }
  public static IntPtr Found = IntPtr.Zero;
  public static string Cls = "";
  public static string Pn = "";
  public static bool Run(IntPtr h, IntPtr l) {
    var c = new StringBuilder(256); GetClassNameW(h, c, c.Capacity);
    if (!string.Equals(c.ToString(), Cls, StringComparison.OrdinalIgnoreCase)) return true;
    if (!IsWindowVisible(h)) return true;
    uint pid; GetWindowThreadProcessId(h, out pid);
    try { if (!string.Equals(System.Diagnostics.Process.GetProcessById((int)pid).ProcessName, Pn, StringComparison.OrdinalIgnoreCase)) return true; }
    catch { return true; }
    Found = h; return false;
  }
}
"@
[ND]::Cls = $Class
[ND]::Pn = $Proc
[void][ND]::EnumWindows([ND+E] { param($h, $l) [ND]::Run($h, $l) }, [IntPtr]::Zero)
if ([ND]::Found -eq [IntPtr]::Zero) { Write-Output "no visible $Class owned by $Proc"; exit 1 }
$h = [ND]::Found
$r = New-Object ND+R
[void][ND]::GetWindowRect($h, [ref]$r)
$w = $r.r - $r.l; $ht = $r.b - $r.t
Write-Output ("hwnd=0x{0:X} rect={1}x{2}+{3},{4}" -f [int64]$h, $w, $ht, $r.l, $r.t)
# SWP_NOZORDER|SWP_NOACTIVATE = 0x0004|0x0010, plus 0x0020 FRAMECHANGED on the restore
[void][ND]::SetWindowPos($h, [IntPtr]::Zero, $r.l, $r.t, ($w - 1), ($ht - 1), 0x0014)
Start-Sleep -Milliseconds $Restore
[void][ND]::SetWindowPos($h, [IntPtr]::Zero, $r.l, $r.t, $w, $ht, 0x0034)
$r2 = New-Object ND+R
[void][ND]::GetWindowRect($h, [ref]$r2)
Write-Output ("nudged and restored; rect now {0}x{1}+{2},{3}" -f ($r2.r - $r2.l), ($r2.b - $r2.t), $r2.l, $r2.t)
