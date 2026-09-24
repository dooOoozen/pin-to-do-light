param([int]$X=1921,[int]$Y=-87,[int]$W=1918,[int]$H=1078,[int]$Count=14,[int]$Gap=120,[string]$OutDir="burst")
# Catch a flash by taking a burst, not a screenshot. One process, one Graphics object, frames
# written as JPEG so the encode is fast enough to keep the gap near the 120 ms asked for —
# a per-frame PowerShell launch would have cost more than the flash lasts.
Add-Type -AssemblyName System.Drawing
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 72L)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$b = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($b)
for ($i = 0; $i -lt $Count; $i++) {
  $g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size $W, $H))
  $p = Join-Path $OutDir ("f{0:d2}-{1}.jpg" -f $i, (Get-Date -Format "HHmmss.fff"))
  $b.Save($p, $codec, $ep)
  Start-Sleep -Milliseconds $Gap
}
$g.Dispose(); $b.Dispose()
Write-Output ("burst of " + $Count + " frames into " + $OutDir)
