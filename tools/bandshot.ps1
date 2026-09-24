# Grab a small rectangle of the screen into a PNG, so "is the band there" is answered by
# pixels rather than by a description.
#
# Deliberately a crop, not a desktop screenshot: the question is one 40-row strip, and a
# full-screen capture of a working desktop shows the user's documents in a log.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/bandshot.ps1 -X 1920 -Y 0 -W 900 -H 44 -Out C:\Users\me\AppData\Local\Temp\band-m2.png
param([int]$X = 0, [int]$Y = 0, [int]$W = 900, [int]$H = 44,
      [string]$Out = "$env:TEMP\bandshot.png")
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size($W, $H)))
$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
# the top rows, summarised: how many sampled pixels are near-white, and one probe colour.
# A caption band is a flat light strip; the layer's own content at that row is either the
# desktop showing through or a card, and neither reads as 11k uniform near-white samples.
$b2 = New-Object System.Drawing.Bitmap($Out)
$n = 0
for ($y = 0; $y -lt $b2.Height; $y += 2) {
  for ($x = 0; $x -lt $b2.Width; $x += 4) {
    $p = $b2.GetPixel($x, $y)
    if ($p.R -gt 235 -and $p.G -gt 235 -and $p.B -gt 235) { $n++ }
  }
}
$row0 = $b2.GetPixel(400, 2)
$b2.Dispose()
Write-Output ("saved " + $Out + "  near-white samples=" + $n + "  row2=RGB(" + $row0.R + "," + $row0.G + "," + $row0.B + ")")
