param([int]$X=1921,[int]$Y=-87,[int]$W=1918,[int]$H=40,[int]$For=6000,[int]$Every=40)
# Watch the strip at the top of the card layer and say, on the record, whether a caption band
# was ever painted there during the window. A screenshot cannot answer this: the band is on
# screen for a few hundred milliseconds and the only capture that would catch it is one taken
# inside that window, which is what this loop is.
#
# It reports the frames rather than a verdict, because a threshold that has never seen the
# thing it is looking for is not evidence of its absence: the first run of this probe printed
# bandFrames=0 and that told me nothing about whether the band was there.
Add-Type -AssemblyName System.Drawing
$b=New-Object System.Drawing.Bitmap $W,$H
$g=[System.Drawing.Graphics]::FromImage($b)
$end=(Get-Date).AddMilliseconds($For)
# Keep the five frames with the most light pixels in the strip, and print what their rows were
# made of. The first cut of this probe asked "is this row near-white?" and answered no for
# every frame, which proved nothing except that the band's colour was never measured.
$best=@()
$shots=0
$of=[math]::Floor($W/11)
while ((Get-Date) -lt $end) {
  $g.CopyFromScreen($X,$Y,0,0,(New-Object System.Drawing.Size $W,$H))
  $shots++
  $frac=0.0; $rows=@()
  for ($y=0; $y -lt 24; $y+=2) {
    $near=0
    for ($x=0; $x -lt $W; $x+=11) {
      $p=$b.GetPixel($x,$y)
      if ($p.R -gt 200 -and $p.G -gt 200 -and $p.B -gt 200) { $near++ }
    }
    $rows += ($y.ToString() + ":" + [math]::Round($near/$of, 2))
    $frac += ($near/$of)
  }
  $frac = [math]::Round($frac/12, 3)
  $best += ,@($frac, (Get-Date -Format "HH:mm:ss.fff"), ($rows -join " "))
  if ($best.Count -gt 60) { $best = @($best | Sort-Object {[double]$_[0]} | Select-Object -Last 5) }
  Start-Sleep -Milliseconds $Every
}
Write-Output ("sampled=" + $shots)
foreach ($e in ($best | Sort-Object {[double]$_[0]} -Descending | Select-Object -First 5)) {
  Write-Output ("light=" + $e[0] + " at " + $e[1] + "  rows " + $e[2])
}
$g.Dispose(); $b.Dispose()
