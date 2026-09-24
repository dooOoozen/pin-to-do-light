param([int]$For=45000,[int]$Every=120,[string]$OutDir="C:/Users/25817/AppData/Local/Temp/flashburst",[string]$Only="m2")
# Catch a flash whose shape nobody knows.
#
# Every probe so far asked a specific question — "is the top strip light?", "is the caption
# composed?" — and each answered no, which means the question was wrong rather than the
# artifact absent. This one asks nothing: it watches both displays, keeps a small fingerprint
# of each frame, and writes the full frame out whenever the picture changes more than a
# cursor blink does. Whatever the white box is, it is a change, and changes get saved.
Add-Type -AssemblyName System.Drawing
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 82L)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
# monitor 1 is the working screen at 0,0; monitor 2 sits at 1920,-88 and CopyFromScreen
# refuses a rectangle that touches the virtual screen edge, so it is pulled in by a pixel
$mons = @(
  @{ n = "m1"; x = 0; y = 0; w = 1920; h = 1080 },
  @{ n = "m2"; x = 1921; y = -87; w = 1918; h = 1078 }
) | Where-Object { $_.n -eq $Only }
foreach ($m in $mons) {
  $m.bmp = New-Object System.Drawing.Bitmap $m.w, $m.h
  $m.g = [System.Drawing.Graphics]::FromImage($m.bmp)
  $m.small = New-Object System.Drawing.Bitmap 120, 68
  $m.sg = [System.Drawing.Graphics]::FromImage($m.small)
  $m.sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $m.prev = $null
  $m.kept = 0
}
$end = (Get-Date).AddMilliseconds($For)
$frames = 0
while ((Get-Date) -lt $end) {
  foreach ($m in $mons) {
    $m.g.CopyFromScreen($m.x, $m.y, 0, 0, (New-Object System.Drawing.Size $m.w, $m.h))
    $m.sg.DrawImage($m.bmp, 0, 0, 120, 68)
    $sig = @()
    for ($y = 0; $y -lt 68; $y += 2) {
      for ($x = 0; $x -lt 120; $x += 3) {
        $p = $m.small.GetPixel($x, $y)
        $sig += [int](($p.R -shl 16) -bor ($p.G -shl 8) -bor $p.B)
      }
    }
    $diff = 0
    if ($null -ne $m.prev) {
      for ($i = 0; $i -lt $sig.Count; $i++) {
        $d = [math]::Abs($sig[$i] - $m.prev[$i])
        if ($d -gt 24) { $diff++ }
      }
    }
    # 40 of 1360 sampled pixels moving is more than an animation tick or a caret blink
    if ($null -eq $m.prev -or $diff -ge 40) {
      $m.kept++
      $p = Join-Path $OutDir ("{0}-{1:d3}-{2}-d{3}.jpg" -f $m.n, $m.kept, (Get-Date -Format "HHmmss.fff"), $diff)
      $m.bmp.Save($p, $codec, $ep)
    }
    $m.prev = $sig
  }
  $frames++
  Start-Sleep -Milliseconds $Every
}
foreach ($m in $mons) {
  $m.g.Dispose(); $m.sg.Dispose(); $m.bmp.Dispose(); $m.small.Dispose()
  Write-Output ($m.n + " kept=" + $m.kept)
}
Write-Output ("sampled=" + $frames)
