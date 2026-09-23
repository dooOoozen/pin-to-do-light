# Where does a window sit in the z-order, and is it the desktop wearing a disguise?
#
# The deck steps aside for "a film or a game": a foreign application whose window covers its
# monitor. On this machine that test fires on a plain click on the desktop, and the boot log
# names the window: class TXMiniSkin, process DesktopMgr64 — a desktop organiser that draws
# the wallpaper itself. It is not in the shell's list of desktop class names, so it looks
# exactly like a video.
#
# The structural difference between that and a video is where the window sits: a desktop
# surface is at the bottom of the z-order and a film is at the top. EnumWindows walks
# top-level windows in z-order, top first, so this prints the index and says which one the
# foreground holds — the number that decides whether the fix can be "is it the bottom-most
# window" instead of a list of vendor class names.
#
#   powershell -NoProfile -File tools/zorder.ps1
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class Z {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint w);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int l, t, r, b; }
  public const uint GW_HWNDFIRST = 0, GW_HWNDLAST = 1;
}
"@
$fg = [Z]::GetForegroundWindow()
$all = @()
[void][Z]::EnumWindows({
  param($h, $l)
  if (-not [Z]::IsWindowVisible($h)) { return $true }
  $c = New-Object System.Text.StringBuilder 256; [void][Z]::GetClassNameW($h, $c, 256)
  $t = New-Object System.Text.StringBuilder 256; [void][Z]::GetWindowTextW($h, $t, 256)
  $p = [uint32]0; [void][Z]::GetWindowThreadProcessId($h, [ref]$p)
  $pr = try { (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch { '?' }
  $r = New-Object Z+R; [void][Z]::GetWindowRect($h, [ref]$r)
  $script:all += , [pscustomobject]@{
    h = $h; cls = $c.ToString().Trim(); title = $t.ToString().Trim(); proc = $pr
    w = ($r.r - $r.l); hh = ($r.b - $r.t); x = $r.l; y = $r.t
  }
  return $true
}, [IntPtr]::Zero)
"visible top-level windows, z-order top first: " + $all.Count
$last = $all[$all.Count - 1]
$first = $all[0]
"top    : $($first.cls) | $($first.proc) | $($first.w)x$($first.hh)@$($first.x),$($first.y)"
"bottom : $($last.cls) | $($last.proc) | $($last.w)x$($last.hh)@$($last.x),$($last.y)"
""
"GetWindow(GW_HWNDFIRST/GW_HWNDLAST) agrees with the enumeration order:"
"  first=$([Z]::GetWindow($last.h, 0) -eq $first.h)  last=$([Z]::GetWindow($first.h, 1) -eq $last.h)"
""
$i = 0
foreach ($w in $all) {
  $i++
  $mark = ''
  if ($w.h -eq $fg) { $mark = '  <== foreground' }
  if ($w.cls -like '*TXMini*' -or $w.proc -like 'DesktopMgr*' -or $w.cls -in @('Progman','WorkerW','SHELLDLL_DefView','SysListView32')) { $mark += '  [desktop-ish]' }
  if ($i -le 6 -or $i -gt $all.Count - 8 -or $mark) {
    '{0,3}  {1,-34} {2,-22} {3,5}x{4,-5} @{5,6},{6,-6} {7}{8}' -f $i, $w.cls, $w.proc, $w.w, $w.hh, $w.x, $w.y, $w.title.Substring(0, [Math]::Min(28, $w.title.Length)), $mark
  }
}
