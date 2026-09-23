# Which window becomes "the thing in front" when the desktop is clicked?
#
# The deck hides itself when a *foreign application* covers the screen (the film/game rule).
# The report is that clicking the desktop triggers it, which means the window that answers
# to GetForegroundWindow after that click is being classified as an application. Class names
# alone decide that classification, so this lists them — with the owning process and whether
# the window really spans a work area — without touching the foreground or the running app.
#
#   powershell -NoProfile -File tools/fgprobe.ps1
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class W {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr m, out MI i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int l, t, r, b; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public R rc; public R wa; public int flags; }
}
"@
function CoversWorkArea($h) {
  $m = [W]::MonitorFromWindow($h, 2)   # MONITOR_DEFAULTTONEAREST
  if ($m -eq [IntPtr]::Zero) { return '?' }
  $i = New-Object W+MI; $i.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($i)
  if (-not [W]::GetMonitorInfo($m, [ref]$i)) { return '?' }
  $r = New-Object W+R
  if (-not [W]::GetWindowRect($h, [ref]$r)) { return '?' }
  $wa = $i.wa
  $w = $r.r - $r.l; $hh = $r.b - $r.t
  $ww = $wa.r - $wa.l; $wh = $wa.b - $wa.t
  # covers the work area (what the old, wrong test measured) and covers the whole monitor
  # (what the deck actually requires) are different questions, so print both
  $overW = ($r.l -le $wa.l + 2) -and ($r.t -le $wa.t + 2) -and ($r.r -ge $wa.r - 2) -and ($r.b -ge $wa.b - 2)
  $overM = ($r.l -le $i.rc.l + 24) -and ($r.t -le $i.rc.t + 24) -and ($r.r -ge $i.rc.r - 24) -and ($r.b -ge $i.rc.b - 24)
  "{0}/{1} {2}x{3}@{4},{5}" -f $overW, $overM, $w, $hh, $r.l, $r.t
}
$fg = [W]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][W]::GetClassNameW($fg, $sb, 512)
$fp = [uint32]0
[void][W]::GetWindowThreadProcessId($fg, [ref]$fp)
$fproc = try { (Get-Process -Id $fp -ErrorAction Stop).ProcessName } catch { '?' }
"foreground right now: class=" + $sb.ToString() + " pid=" + $fp + " process=" + $fproc +
  " covers=" + (CoversWorkArea $fg)
""
"handle    coversWork/Mon   pid   process                   class                                          title"
"---------  --------------  ----  ------------------------  ---------------------------------------------  ---------------"
$rows = @()
[void][W]::EnumWindows({
  param($h, $l)
  if (-not [W]::IsWindowVisible($h)) { return $true }
  $cn = New-Object System.Text.StringBuilder 512
  [void][W]::GetClassNameW($h, $cn, 512)
  $tt = New-Object System.Text.StringBuilder 512
  [void][W]::GetWindowTextW($h, $tt, 512)
  $pid2 = [uint32]0; [void][W]::GetWindowThreadProcessId($h, [ref]$pid2)
  $proc = try { (Get-Process -Id $pid2 -ErrorAction Stop).ProcessName } catch { '?' }
  $cov = CoversWorkArea $h
  if ($cov -notlike 'True*') { return $true }     # only windows big enough to be a cover
  $script:rows += , ('{0:x8}  {1,-14}  {2,-5} {3,-24} {4,-46} {5}' -f `
    $h.ToInt64(), $cov, $pid2, $proc, $cn.ToString().Trim(), $tt.ToString().Trim())
  return $true
}, [IntPtr]::Zero)
$rows | ForEach-Object { $_ }
