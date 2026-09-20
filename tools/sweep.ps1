Add-Type -AssemblyName System.Drawing
$b=New-Object System.Drawing.Bitmap 1,1; $g=[System.Drawing.Graphics]::FromImage($b)
$ink=0; $paper=0; $other=0
foreach ($y in 390..650 | Where-Object { ($_ % 6) -eq 0 }) {
  foreach ($x in 0,4,8,12,16,20,26,32,38) {
    $g.CopyFromScreen($x,$y,0,0,(New-Object System.Drawing.Size 1,1)); $c=$b.GetPixel(0,0)
    $dInk=[math]::Abs($c.R-20)+[math]::Abs($c.G-18)+[math]::Abs($c.B-13)
    $dPaper=[math]::Abs($c.R-247)+[math]::Abs($c.G-240)+[math]::Abs($c.B-225)
    if ($dInk -lt 40) { $ink++ } elseif ($dPaper -lt 45) { $paper++ } else { $other++ }
  }
}
$g.Dispose();$b.Dispose()
Write-Output ("left-edge strip (x 0..38, y 390..650): inkish=$ink  paperish=$paper  other=$other  of " + (28*9))
