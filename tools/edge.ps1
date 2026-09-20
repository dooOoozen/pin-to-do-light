Add-Type -AssemblyName System.Drawing
$hits=0
foreach ($y in 200..900 | Where-Object { ($_ - 200) % 50 -eq 0 }) {
  $row=''
  foreach ($x in 1780,1820,1860,1890,1905,1915) {
    $b=New-Object System.Drawing.Bitmap 1,1; $g=[System.Drawing.Graphics]::FromImage($b)
    $g.CopyFromScreen($x,$y,0,0,(New-Object System.Drawing.Size 1,1)); $c=$b.GetPixel(0,0)
    $g.Dispose(); $b.Dispose()
    $ink = if ([math]::Abs($c.R-20)+[math]::Abs($c.G-18)+[math]::Abs($c.B-13) -lt 12) { $hits++; 'INK' } else { '   ' }
    $row += (' {0}:{1,3},{2,3},{3,3}{4}' -f $x,$c.R,$c.G,$c.B,$ink)
  }
  Write-Output ("y=$y " + $row)
}
Write-Output ("ink pixels found on the right edge: " + $hits)
