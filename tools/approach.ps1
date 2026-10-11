<#
  Drive the REAL pointer onto the deck and leave it there. The cursor feed skips unchanged
  positions, so "arrive and stop" delivers exactly one frame — which is the case the scripted
  synthetic feed can never reproduce, and the reason the deck used to slide out and stay a
  stack. SetCursorPos is the only way to produce it.

  Second display only; the primary screen is the user's working space.

  .\tools\approach.ps1 -CenterX 3725 -CenterY 431 -Runs 6
#>
param(
  [int]$CenterX = 3725,
  [int]$CenterY = 431,
  [int]$AwayX = 2100,
  [int]$AwayY = 900,
  [int]$Runs = 6,
  [int]$OutsideMs = 2600,
  [int]$InsideMs = 2600,
  [int]$Steps = 12
)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Nudge {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
'@
$origin = [System.Windows.Forms.Cursor]::Position
for ($r = 1; $r -le $Runs; $r++) {
  [Nudge]::SetCursorPos($AwayX, $AwayY) | Out-Null
  Start-Sleep -Milliseconds $OutsideMs
  $t0 = [DateTime]::Now
  for ($s = 1; $s -le $Steps; $s++) {
    $t = $s / $Steps
    [Nudge]::SetCursorPos([int]($AwayX + ($CenterX - $AwayX) * $t), [int]($AwayY + ($CenterY - $AwayY) * $t)) | Out-Null
    Start-Sleep -Milliseconds 14
  }
  $arrived = [DateTime]::Now
  Write-Output ("run {0} arrived at {1:HH:mm:ss.fff}" -f $r, $arrived)
  Start-Sleep -Milliseconds $InsideMs
}
[Nudge]::SetCursorPos($origin.X, $origin.Y) | Out-Null
Write-Output "pointer restored to $($origin.X),$($origin.Y)"
