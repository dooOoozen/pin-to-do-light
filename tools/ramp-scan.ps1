# Walks one vertical column of the real screen and reports whether a material's ramp is
# continuous or restarts. The DOM can say background-size: 100% 100% all day; what the
# user sees is pixels, and a tiled gradient shows up as luminance falling back down again
# part-way through a single surface. The column stays inside one plate, so a drop means a
# seam rather than a gap between panels.
#
#   .\tools\ramp-scan.ps1 -X 2500 -Y0 128 -Y1 668 -Step 6
param([int]$X = 2500, [int]$Y0 = 128, [int]$Y1 = 668, [int]$Step = 6, [switch]$Quiet)
Add-Type -AssemblyName System.Drawing
$b = New-Object System.Drawing.Bitmap 1, 1
$g = [System.Drawing.Graphics]::FromImage($b)
$lum = @(); $cols = @()
for ($y = $Y0; $y -le $Y1; $y += $Step) {
  $g.CopyFromScreen($X, $y, 0, 0, (New-Object System.Drawing.Size 1, 1))
  $c = $b.GetPixel(0, 0)
  $cols += ("#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B)
  $lum += (0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B)
}
$g.Dispose(); $b.Dispose()
$seams = 0; $worst = 0.0; $worstY = 0
for ($i = 1; $i -lt $lum.Count; $i++) {
  $d = $lum[$i] - $lum[$i - 1]
  if ($d -lt -8) {
    $seams++
    if ([math]::Abs($d) -gt $worst) { $worst = [math]::Abs($d); $worstY = $Y0 + $i * $Step }
  }
}
$mx = ($lum | Measure-Object -Maximum).Maximum
$mn = ($lum | Measure-Object -Minimum).Minimum
Write-Output ("column x=$X y=$Y0..$Y1 step=$Step samples=$($lum.Count) span=$([math]::Round($mx-$mn,1)) seams=$seams worst=$([math]::Round($worst,1))@$worstY")
if (-not $Quiet) { Write-Output ($cols -join ' ') }
