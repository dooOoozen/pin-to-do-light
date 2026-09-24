# Alternate the foreground between the empty desktop and one application window, N times.
#
# The white caption is reported from two gestures that had never been separated: clicking the
# desktop, and clicking into another application. Both change the foreground and nothing else
# about this app, so a driver that does exactly that — and nothing else — is what the
# instrument needs. It never moves the mouse and never touches a window it was not told to.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/altfocus.ps1 -Proc notepad -Times 6
param([string]$Proc = 'notepad', [int]$Times = 6, [int]$Hold = 1600)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class Alt {
  [DllImport("user32.dll")] public static extern bool EnumWindows(E cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string n);
  public delegate bool E(IntPtr h, IntPtr l);
  public static IntPtr ByClass(string cls) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      var sb = new StringBuilder(256); GetClassNameW(h, sb, sb.Capacity);
      if (string.Equals(sb.ToString(), cls, StringComparison.OrdinalIgnoreCase) && IsWindowVisible(h)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static IntPtr ByProc(string name) {
    uint myPid = 0;
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      var sb = new StringBuilder(256); GetWindowTextW(h, sb, sb.Capacity);
      if (pid == 0 || !IsWindowVisible(h) || sb.Length == 0) return true;
      try {
        var p = System.Diagnostics.Process.GetProcessById((int)pid);
        if (string.Equals(p.ProcessName, name, StringComparison.OrdinalIgnoreCase)) { found = h; myPid = pid; return false; }
      } catch {}
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static string Name(IntPtr h) {
    if (h == IntPtr.Zero) return "-";
    var cls = new StringBuilder(256); GetClassNameW(h, cls, cls.Capacity);
    var ttl = new StringBuilder(256); GetWindowTextW(h, ttl, ttl.Capacity);
    uint pid; GetWindowThreadProcessId(h, out pid);
    string pn = "?";
    try { pn = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
    return h.ToString("X") + " " + cls + " " + pn + " " + ttl;
  }
}
"@
$desktop = [Alt]::ByClass('Progman')
if ($desktop -eq [IntPtr]::Zero) { $desktop = [Alt]::ByClass('WorkerW') }
$app = [Alt]::ByProc($Proc)
Write-Output ("desktop : " + [Alt]::Name($desktop))
Write-Output ("app     : " + [Alt]::Name($app))
if ($app -eq [IntPtr]::Zero) { Write-Output "no window for $Proc — start it first"; exit 1 }
for ($i = 1; $i -le $Times; $i++) {
  [void][Alt]::SetForegroundWindow($desktop)
  Start-Sleep -Milliseconds $Hold
  $d = [Alt]::Name([Alt]::GetForegroundWindow())
  [void][Alt]::SetForegroundWindow($app)
  Start-Sleep -Milliseconds $Hold
  $a = [Alt]::Name([Alt]::GetForegroundWindow())
  Write-Output ("round {0}: after-desktop={1} | after-app={2}" -f $i, $d, $a)
}
Write-Output "done"
