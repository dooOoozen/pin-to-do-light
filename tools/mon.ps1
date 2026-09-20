Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;using System.Runtime.InteropServices;
public class D2 { [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr h,int t,out uint dx,out uint dy);
 [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
 [DllImport("gdi32.dll")] public static extern int GetDeviceCaps(IntPtr h,int i); }
"@
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  $dpiX=0u; $dpiY=0u
  [D2]::GetDpiForMonitor($s.Handle, 0, [ref]$dpiX, [ref]$dpiY) | Out-Null
  $b=$s.Bounds; $wa=$s.WorkingArea
  Write-Output ("  " + $s.DeviceName + " primary=" + $s.Primary + " bounds=" + $b.Width + "x" + $b.Height + " at " + $b.X + "," + $b.Y + "  work=" + $wa.Width + "x" + $wa.Height + " at " + $wa.X + "," + $wa.Y + "  dpi=" + $dpiX + " (scale=" + ($dpiX/96.0) + ")")
}
