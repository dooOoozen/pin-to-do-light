# What actually becomes the foreground window when the desktop is clicked?
#
# The deck's "只在桌面显示" rule hides it for any *foreign application* whose window overlaps
# the screen the layer lives on, and shows it again for the desktop. The report is the exact
# inverse — click the desktop, the deck goes away — which can only mean the window that owns
# the foreground after that click is not one of the six class names the classifier treats as
# the desktop. This asks the shell to activate Program Manager (what a click on the empty
# desktop does, without needing to move the user's mouse) and prints what ended up in front,
# then restores the window that was there before.
#
#   powershell -NoProfile -File tools/focus-desktop.ps1
param([switch]$Keep)
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class F {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowW(string c, string t);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int n);
}
"@
function Name($h) {
  if ($h -eq [IntPtr]::Zero) { return '(none)' }
  $c = New-Object System.Text.StringBuilder 256; [void][F]::GetClassNameW($h, $c, 256)
  $t = New-Object System.Text.StringBuilder 256; [void][F]::GetWindowTextW($h, $t, 256)
  $p = [uint32]0; [void][F]::GetWindowThreadProcessId($h, [ref]$p)
  $pr = try { (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch { '?' }
  '{0:x8} class={1} title={2} process={3}({4})' -f $h.ToInt64(), $c.ToString().Trim(), $t.ToString().Trim(), $pr, $p
}
$before = [F]::GetForegroundWindow()
"before : $(Name $before)"
$progman = [F]::FindWindowW('Progman', 'Program Manager')
if ($progman -eq [IntPtr]::Zero) {
  # FindWindow matches class AND title at once, and the title of the desktop's own window is
  # not reliably "Program Manager" across shells — take the handle from the enumeration of
  # Progman-class windows instead, which is what actually worked in the sibling probe.
  $script:hits = @()
  [void][F]::EnumWindows({
    param($h, $l)
    $c = New-Object System.Text.StringBuilder 256; [void][F]::GetClassNameW($h, $c, 256)
    if ($c.ToString() -eq 'Progman' -or $c.ToString() -eq 'WorkerW') { $script:hits += $h }
    return $true
  }, [IntPtr]::Zero)
  if ($hits.Count) { $progman = $hits[0] }
}
"Progman: $(Name $progman)"
if ($progman -eq [IntPtr]::Zero) { 'no Progman window — cannot activate the desktop'; exit 1 }
# A background process is usually refused the foreground right; SW_SHOW first gives the
# shell a reason to accept the activation, and the RESULT line is what matters — if the
# call is refused the script says so rather than reporting the desktop as foreground.
[void][F]::ShowWindowAsync($progman, 5)
[void][F]::SetForegroundWindow($progman)
Start-Sleep -Milliseconds 900
$after = [F]::GetForegroundWindow()
"after  : $(Name $after)"
if ($after -eq $progman) { 'RESULT: the desktop itself owns the foreground' }
else { 'RESULT: something else took it — that window is what the classifier sees' }
if (-not $Keep) { [void][F]::SetForegroundWindow($before); Start-Sleep -Milliseconds 300 }
