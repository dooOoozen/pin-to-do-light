# Brings one of this app's windows to the front by its size, so a screen crop of it is a
# crop of the app and not of whatever IDE window happens to sit on the same pixels.
#   .\tools\raise.ps1 -W 1256
param([int]$W = 1256, [int]$H = 809, [int]$Tol = 4)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Raise {
  [DllImport("user32.dll")] public static extern bool EnumWindows(E cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  public delegate bool E(IntPtr h, IntPtr l);
  public struct R { public int L, T, Rr, B; }
  public static string Go(int want, int tol) {
    string hit = "";
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      R r; GetWindowRect(h, out r);
      uint pid; GetWindowThreadProcessId(h, out pid);
      string name = (System.Diagnostics.Process.GetProcessById((int)pid)).ProcessName;
      if (name != "pin-tauri") return true;
      if (Math.Abs((r.Rr - r.L) - want) <= tol) { BringWindowToTop(h); SetForegroundWindow(h); hit = "hwnd=" + h + " " + (r.Rr - r.L) + "x" + (r.B - r.T) + " at " + r.L + "," + r.T; }
      return true;
    }, IntPtr.Zero);
    return hit == "" ? "no pin-tauri window of that width" : "raised " + hit;
  }
}
"@
Write-Output ([Raise]::Go($W, $Tol))
