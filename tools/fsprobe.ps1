param([int]$Root = 0, [int]$HoldMs = 3200)
# Does the card layer get out of the way of a fullscreen window? Raises a borderless
# window over the SECOND monitor only, and watches the layer's IsWindowVisible while it
# is up. Refuses to run if it cannot find a monitor that is not the user's own.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;using System.Collections.Generic;
public class FS {
 [DllImport("user32.dll")] public static extern bool EnumWindows(E cb,IntPtr l);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
 [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 public delegate bool E(IntPtr h,IntPtr l);
 public struct R { public int L,T,Rr,B; }
 public static List<string> Wins(int pid){
  var outp = new List<string>();
  EnumWindows((h,l)=>{
   uint p; GetWindowThreadProcessId(h,out p);
   if((int)p!=pid) return true;
   var sb=new StringBuilder(200); GetWindowTextW(h,sb,200);
   R r; GetWindowRect(h,out r);
   outp.Add(h.ToInt64()+"|"+(sb.Length)+"|"+((r.Rr-r.L)*(r.B-r.T))+"|"+IsWindowVisible(h));
   return true; }, IntPtr.Zero);
  return outp;
 }
}
"@
[void][FS]::SetProcessDPIAware()

$screens = [System.Windows.Forms.Screen]::AllScreens
$target = $null
foreach ($s in $screens) { if ($s.Bounds.Left -ge 1000) { $target = $s; break } }
if (-not $target) { Write-Output "ABORT: no second monitor found (refusing to cover the user's screen)"; exit 1 }
Write-Output ("screen=" + $target.Bounds + " primary=" + $target.Primary)

function LayerVis {
  $best = $null; $area = 0
  foreach ($w in [FS]::Wins($Root)) {
    $p = $w.Split('|')
    if ([int]$p[1] -eq 0) { continue }        # the titled window is the card layer
    if ([long]$p[2] -gt $area) { $area = [long]$p[2]; $best = $p }
  }
  if (-not $best) { return "no-layer" }
  return "hwnd=" + $best[0] + " vis=" + $best[3] + " area=" + $area
}

Write-Output ("before : " + (LayerVis))

$f = New-Object System.Windows.Forms.Form
$f.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$f.TopMost = $true
$f.ShowInTaskbar = $false
$f.BackColor = [System.Drawing.Color]::Blue
$f.Text = "FakeFullscreenProbe"
$f.Bounds = $target.Bounds
$f.Opacity = 0.92
$f.Show()
$f.Activate()

$deadline = (Get-Date).AddMilliseconds($HoldMs)
$samples = @()
while ((Get-Date) -lt $deadline) {
  [void][System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 200
  $samples += (Get-Date -Format 'ss.f') + ":" + (LayerVis)
}
Write-Output ("during : " + ($samples -join '  '))
Write-Output ("fg     : " + [FS]::GetForegroundWindow())

$f.Close()
Start-Sleep -Milliseconds 2600
Write-Output ("after  : " + (LayerVis))
