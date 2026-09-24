param([int]$For=12000,[int]$Every=40)
# Who owns the light strip at the top of the primary screen?
#
# Four rounds of fixes aimed at the card layer's caption and the frame never once asked which
# window the reported pixels belong to. This does: it samples the top strip of each monitor,
# and the moment a row goes light it names the window answering at that point — title, class,
# process, rect — so the claim "the band is the card layer's caption" can be checked instead
# of assumed.
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;using System.Text;using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h,out int pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint f);
  public struct POINT { public int x; public int y; public POINT(int a,int b){x=a;y=b;} }
  public struct R { public int l,t,r,b; }
}
"@
function Name($hwnd) {
  if ($hwnd -eq [IntPtr]::Zero) { return "none" }
  $top = [W]::GetAncestor($hwnd, 3)   # GA_ROOT
  $sb = New-Object System.Text.StringBuilder 300
  [W]::GetWindowText($top, $sb, 300) | Out-Null
  $t = $sb.ToString()
  $sb = New-Object System.Text.StringBuilder 300
  [W]::GetClassName($top, $sb, 300) | Out-Null
  $c = $sb.ToString()
  $pid2 = 0; [W]::GetWindowThreadProcessId($top, [ref]$pid2) | Out-Null
  $proc = try { (Get-Process -Id $pid2 -ErrorAction Stop).ProcessName } catch { "?" }
  $r = New-Object W+R; [W]::GetWindowRect($top, [ref]$r) | Out-Null
  return ("[" + $t + "|" + $c + "|" + $proc + ":" + $pid2 + " " + ($r.r-$r.l) + "x" + ($r.b-$r.t) + "@" + $r.l + "," + $r.t + "]")
}
$mons = @(
  @{ n = "m1"; x = 0; y = 0 },
  @{ n = "m2"; x = 1921; y = -87 }
)
$bmps = @{}
foreach ($m in $mons) {
  $b = New-Object System.Drawing.Bitmap 1918, 26
  $bmps[$m.n] = @{ bmp = $b; g = [System.Drawing.Graphics]::FromImage($b); x = $m.x; y = $m.y }
}
$end = (Get-Date).AddMilliseconds($For)
$seen = @{}
while ((Get-Date) -lt $end) {
  foreach ($k in $bmps.Keys) {
    $e = $bmps[$k]
    $e.g.CopyFromScreen($e.x, $e.y, 0, 0, (New-Object System.Drawing.Size 1918, 26))
    $light = 0
    for ($y = 2; $y -lt 24; $y += 2) {
      $near = 0
      for ($x = 0; $x -lt 1918; $x += 13) {
        $p = $e.bmp.GetPixel($x, $y)
        if ($p.R -gt 200 -and $p.G -gt 200 -and $p.B -gt 200) { $near++ }
      }
      if ($near -gt 120) { $light++ }
    }
    if ($light -ge 6) {
      $key = $k + "-" + $light
      if (-not $seen.ContainsKey($key)) {
        $seen[$key] = 1
        Write-Output ($k + " LIGHT rows=" + $light + " at " + (Get-Date -Format "HH:mm:ss.fff") +
          " point900=" + (Name ([W]::WindowFromPoint((New-Object W+POINT ($e.x + 900), ($e.y + 8))))))
      }
    }
  }
  Start-Sleep -Milliseconds $Every
}
foreach ($e in $bmps.Values) { $e.g.Dispose(); $e.bmp.Dispose() }
Write-Output ("distinct light frames: " + $seen.Count)
