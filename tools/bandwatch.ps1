# Catch the caption band in the act, with a timestamp the app's own log can be matched to.
#
# Every probe so far has been taken after the fact and has come back clean, which proves
# nothing either way: the band is intermittent, and the moment it is up is the moment nobody is
# looking. This watches the layer window's own top rows continuously and keeps the evidence —
# a PNG plus the window's geometry, style and non-client height at that instant — printed in
# GetTickCount units, which is the same clock the WinEvent hook reports its strips in (`t=`),
# so a hit here and a `hook strip` line there are directly comparable without guessing.
#
# It reads the window rect every pass on purpose. The window moves between monitors and the
# second monitor's top edge is not y=0 in the virtual desktop (it is -88 on this machine), and
# a hardcoded probe coordinate is how "there is no band there" got concluded once already.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/bandwatch.ps1 -Minutes 30
param([int]$Minutes = 30, [int]$Every = 400, [string]$Proc = 'pin-tauri',
      [string]$Class = 'Tauri Window', [string]$OutDir = "$env:TEMP\bandwatch")
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class BW {
  [DllImport("user32.dll")] public static extern bool EnumWindows(E cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out R r);
  [DllImport("kernel32.dll")] public static extern uint GetTickCount();
  public delegate bool E(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int l, t, r, b; }
  public static IntPtr Found = IntPtr.Zero;
  public static string Cls = "", Pn = "";
  public static bool Run(IntPtr h, IntPtr l) {
    var c = new StringBuilder(256); GetClassNameW(h, c, c.Capacity);
    if (!string.Equals(c.ToString(), Cls, StringComparison.OrdinalIgnoreCase)) return true;
    if (!IsWindowVisible(h)) return true;
    uint pid; GetWindowThreadProcessId(h, out pid);
    try { if (!string.Equals(System.Diagnostics.Process.GetProcessById((int)pid).ProcessName, Pn, StringComparison.OrdinalIgnoreCase)) return true; }
    catch { return true; }
    Found = h; return false;
  }
}
"@
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
[BW]::Cls = $Class
[BW]::Pn = $Proc
$until = (Get-Date).AddMinutes($Minutes)
$hits = 0
$lastTick = -1
$grabbed = $false
Write-Output ("watching " + $Proc + "/" + $Class + " for " + $Minutes + " min, every " + $Every + "ms -> " + $OutDir)
while ((Get-Date) -lt $until) {
  [BW]::Found = [IntPtr]::Zero
  [void][BW]::EnumWindows([BW+E] { param($h, $l) [BW]::Run($h, $l) }, [IntPtr]::Zero)
  $h = [BW]::Found
  if ($h -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 2000; continue }
  $r = New-Object BW+R; [void][BW]::GetWindowRect($h, [ref]$r)
  $cr = New-Object BW+R; [void][BW]::GetClientRect($h, [ref]$cr)
  $w = $r.r - $r.l; $ht = $r.b - $r.t
  $nc = $ht - $cr.b
  $style = [BW]::GetWindowLong($h, -16)
  $cap = (($style -band 0x00C00000) -eq 0x00C00000)
  $bandH = [Math]::Min(24, [Math]::Max(4, $ht - 4))
  # the layer covers a whole monitor, so its right edge lands exactly on the virtual screen's
  # right edge — and CopyFromScreen refuses a rectangle that touches it. The exception used to
  # be swallowed, which is how a watcher ran 45 minutes and reported nothing while the band it
  # was built to find was on screen the whole time. Two pixels of margin, and the error is
  # printed the first time it happens.
  $sw = [Math]::Max(16, $w - 16)
  $bmp = New-Object System.Drawing.Bitmap($sw, $bandH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try { $g.CopyFromScreen($r.l, $r.t, 0, 0, (New-Object System.Drawing.Size($sw, $bandH))) }
  catch { if (-not $grabbed) { Write-Output ("GRAB FAILED tick=" + [BW]::GetTickCount() + " " + $_.Exception.Message); $grabbed = $true } }
  $g.Dispose()
  $n = 0; $tot = 0; $sumR = 0; $sumG = 0; $sumB = 0; $minR = 999; $maxR = -1
  for ($y = 1; $y -lt $bandH; $y += 2) {
    for ($x = 8; $x -lt ($sw - 8); $x += 12) {
      $p = $bmp.GetPixel($x, $y)
      $tot++
      # the band is a pale blue-grey (measured 195,209,223), not white: an earlier version
      # asked for R,G > 195 and watched a band that was on screen the whole time
      $mn = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
      if ($mn -gt 150) { $n++ }
      $sumR += $p.R; $sumG += $p.G; $sumB += $p.B
      if ($p.R -lt $minR) { $minR = $p.R }
      if ($p.R -gt $maxR) { $maxR = $p.R }
    }
  }
  $frac = if ($tot -gt 0) { $n / $tot } else { 0 }
  $avgR = if ($tot -gt 0) { [int]($sumR / $tot) } else { 0 }
  $avgG = if ($tot -gt 0) { [int]($sumG / $tot) } else { 0 }
  $avgB = if ($tot -gt 0) { [int]($sumB / $tot) } else { 0 }
  $spread = if ($maxR -gt 0) { $maxR - $minR } else { 0 }
  # a caption is a flat light strip: nearly every sample light, and nearly the same value
  # light-fraction alone is the discriminator here (measured: 91% on a frame with the band, 2%
# without). A spread test was dropped on purpose: the band's own dark title text is what makes
# the spread large, so testing for flatness rejects the exact thing being looked for.
$flat = ($frac -gt 0.85)
  $tick = [BW]::GetTickCount()
  if ($flat -and ($tick - $lastTick -gt 3000)) {
    $lastTick = $tick
    $hits++
    $f = Join-Path $OutDir ("band-" + $tick + ".png")
    $bmp.Save($f, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output ("HIT tick=" + $tick + " hits=" + $hits + " rect=" + $w + "x" + $ht + "+" + $r.l + "," + $r.t +
      " nc=" + $nc + " captionBit=" + $cap + " style=0x" + ("{0:X8}" -f $style) +
      " light=" + [Math]::Round($frac * 100) + "% avg=" + $avgR + "," + $avgG + "," + $avgB + " spread=" + $spread + " -> " + $f)
  }
  $bmp.Dispose()
  Start-Sleep -Milliseconds $Every
}
Write-Output ("watch ended: hits=" + $hits + " dir=" + $OutDir)
