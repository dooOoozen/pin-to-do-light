<#
  Move the real pointer across the second display for a while, so a frame measurement has
  something to measure. Deliberately uses SetCursorPos rather than synthetic DOM events: the
  card layer's hit test is a window region and a scripted MouseEvent would exercise a path no
  one can produce, which is the false green this rig exists to avoid.

  It never touches the primary display — that is the user's working screen.

  .\tools\mousesweep.ps1 -Seconds 26 -MonitorX 1920 -MonitorW 1920 -MonitorH 1032
#>
param(
  [double]$Seconds = 26,
  [int]$MonitorX = 1920,
  [int]$MonitorW = 1920,
  [int]$MonitorH = 1032
)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Sweep {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
'@
$origin = [System.Windows.Forms.Cursor]::Position
$t0 = [DateTime]::Now
$i = 0
while (([DateTime]::Now - $t0).TotalSeconds -lt $Seconds) {
  $p = ([DateTime]::Now - $t0).TotalSeconds
  # a lissajous over the whole display: crosses the deck's edge band many times either way
  $x = $MonitorX + [int](($MonitorW - 40) * (0.5 + 0.48 * [Math]::Sin($p * 1.7)))
  $y = [int](($MonitorH - 60) * (0.5 + 0.46 * [Math]::Sin($p * 0.9 + 1)))
  [Sweep]::SetCursorPos($x, $y) | Out-Null
  $i++
  Start-Sleep -Milliseconds 12
}
[Sweep]::SetCursorPos($origin.X, $origin.Y) | Out-Null
Write-Output "swept $i positions over $([int]$Seconds)s, cursor restored to $($origin.X),$($origin.Y)"
