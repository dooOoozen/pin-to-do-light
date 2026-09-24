# Name every window that could be drawing a strip at the top of the screen.
#
# Three rounds of instruments have read the style of ONE handle — the layer window this
# process kept — while the claim under test was "that window has a caption". If a second
# top-level window carries the same title (a leftover from a previous instance, a hidden
# parent the toolkit creates, a shell preview), every reading taken from the first one is
# both correct and irrelevant. This lists what is actually on screen instead: every top-level
# window of a process, plus every wide window whose top edge sits within the first rows.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/whostitle.ps1 -Proc pin-tauri
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/whostitle.ps1 -Band
# ASCII only on purpose: Windows PowerShell 5.1 reads a .ps1 without a BOM as ANSI, so any
# non-ASCII literal in this file arrives as mojibake and the script will not even parse.
param([string]$Proc = 'pin-tauri', [switch]$Band, [int]$Top = 40, [int]$Wide = 1200)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
using System.Collections.Generic;
public static class WH {
  [DllImport("user32.dll")] public static extern bool EnumWindows(E cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  public delegate bool E(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int l, t, r, b; }
  public static List<IntPtr> Hits = new List<IntPtr>();
  public static string ProcName = "";
  public static bool BandOnly = false;
  public static int TopN = 40, WideN = 1200;
  static string Title(IntPtr h) { var t = new StringBuilder(512); GetWindowTextW(h, t, t.Capacity); return t.ToString(); }
  static string Class(IntPtr h) { var c = new StringBuilder(256); GetClassNameW(h, c, c.Capacity); return c.ToString(); }
  public static bool Run(IntPtr h, IntPtr l) {
    uint pid; GetWindowThreadProcessId(h, out pid);
    string pn = "";
    try { pn = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
    R r; GetWindowRect(h, out r);
    bool wide_top = IsWindowVisible(h) && r.t <= TopN && (r.r - r.l) >= WideN;
    bool byProc = string.Equals(pn, ProcName, StringComparison.OrdinalIgnoreCase);
    if (BandOnly) { if (wide_top) Hits.Add(h); }
    else if (byProc) { Hits.Add(h); }
    return true;
  }
  public static string Line(IntPtr h) {
    R r; GetWindowRect(h, out r);
    uint pid; GetWindowThreadProcessId(h, out pid);
    string pn = "?";
    try { pn = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
    int st = GetWindowLong(h, -16), ex = GetWindowLong(h, -20);
    bool caption = (st & 0x00C00000) == 0x00C00000;
    IntPtr owner = GetWindow(h, 4);
    string t = Title(h);
    return string.Format(
      "hwnd=0x{0:X} vis={1} rect={2}x{3}+{4},{5} caption={6} style=0x{7:X8} ex=0x{8:X8} class={9} proc={10}({11}) owner=0x{12:X} title={13}",
      (long)h, IsWindowVisible(h), r.r - r.l, r.b - r.t, r.l, r.t, caption, st, ex, Class(h), pn, pid, (long)owner, t);
  }
}
"@
[WH]::ProcName = $Proc
[WH]::BandOnly = [bool]$Band
[WH]::TopN = $Top
[WH]::WideN = $Wide
[void][WH]::EnumWindows([WH+E] { param($h, $l) [WH]::Run($h, $l) }, [IntPtr]::Zero)
$scope = if ($Band) { " (visible, top<=" + $Top + ", width>=" + $Wide + ")" } else { " (proc=" + $Proc + ")" }
Write-Output ("windows: " + [WH]::Hits.Count + $scope)
foreach ($h in [WH]::Hits) { Write-Output ([WH]::Line($h)) }
