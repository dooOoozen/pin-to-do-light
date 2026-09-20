param([string]$Label = 'none', [int]$Root = 0, [string]$Points = '', [string]$Pids = '')
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;
public class LP {
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetDesktopWindow();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out WR r);
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
 public struct WR { public int L,T,R,B; }
 public static string Owner(int x,int y){
   POINT p; p.X=x; p.Y=y;
   IntPtr h=WindowFromPoint(p);
   uint pid; GetWindowThreadProcessId(h,out pid);
   string name="?";
   try{ name=System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; }catch{}
   // the rect is what tells our always-on-top 1920x1032 layer apart from the panel:
   // both are msedgewebview2, so the pid and process name alone cannot tell them
   WR r; GetWindowRect(h,out r);
   return "hwnd="+h+" pid="+pid+" proc="+name+" rect="+r.L+","+r.T+" "+(r.R-r.L)+"x"+(r.B-r.T); }
}
"@

# A spread of points across the work area, deliberately including the right edge
# strip where the card deck docks and the top-left corner where nothing of ours
# should ever be.
$pts = @(
  @(40,40), @(960,60), @(1700,540), @(1895,200), @(1895,540), @(1895,900),
  @(960,516), @(60,540), @(400,900), @(1200,980), @(1895,1010), @(600,300)
)

# which point is ours moves with the deck, so let the caller name them: '6,516;1190,24'
if ($Points -ne '') {
  $pts = @()
  foreach ($p in $Points.Split(';')) {
    $t = $p.Trim()
    if ($t -eq '') { continue }
    $xy = $t.Split(',')
    $pts += ,@([int]$xy[0], [int]$xy[1])
  }
}

$out = @()
foreach ($pt in $pts) {
  $bmp = New-Object System.Drawing.Bitmap 1,1
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($pt[0], $pt[1], 0, 0, (New-Object System.Drawing.Size 1,1))
  $c = $bmp.GetPixel(0,0)
  $g.Dispose(); $bmp.Dispose()
  $own = [LP]::Owner($pt[0], $pt[1])
  $mine = ''
  # the layer's HWND belongs to the msedgewebview2 browser child, not to the app exe,
  # so matching only the root pid reports a false negative on a point that is ours
  $pat = 'pid=' + $Root + '\b'
  if ($Pids -ne '') { $pat = 'pid=(' + ($Pids.Split(',') -join '|') + ')\b' }
  if ($Root -gt 0 -and $own -match $pat) { $mine = '  <== OUR LAYER' }
  $out += ('{0,5},{1,5}  rgb=({2,3},{3,3},{4,3})  {5}{6}' -f $pt[0], $pt[1], $c.R, $c.G, $c.B, $own, $mine)
}
Write-Output ("##### " + $Label)
$out | ForEach-Object { Write-Output ("  " + $_) }
