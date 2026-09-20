param([int]$X=182,[int]$Y=182,[int]$W=1256,[int]$H=809)
Add-Type -AssemblyName System.Drawing
$b=New-Object System.Drawing.Bitmap 1,1; $g=[System.Drawing.Graphics]::FromImage($b)
$white=0;$dark=0;$other=0;$tot=0
for ($yy=$Y+20; $yy -lt $Y+$H-10; $yy+=23) {
  $row=''
  for ($xx=$X+20; $xx -lt $X+$W-10; $xx+=61) {
    $g.CopyFromScreen($xx,$yy,0,0,(New-Object System.Drawing.Size 1,1)); $c=$b.GetPixel(0,0)
    $tot++
    if ($c.R -gt 246 -and $c.G -gt 246 -and $c.B -gt 246) { $white++ }
    elseif ($c.R -lt 40 -and $c.G -lt 40 -and $c.B -lt 40) { $dark++ }
    else { $other++ }
  }
}
$g.Dispose();$b.Dispose()
Write-Output ("sampled $tot points inside panel: white=$white dark=$dark other=$other")
