param([int]$X0=260,[int]$Y0=260,[int]$X1=1400,[int]$Y1=950,[int]$SX=38,[int]$SY=23)
Add-Type -AssemblyName System.Drawing
$b=New-Object System.Drawing.Bitmap 1,1; $g=[System.Drawing.Graphics]::FromImage($b)
$white=0;$cream=0;$dark=0;$other=0;$tot=0;$ex=@()
for($y=$Y0;$y -le $Y1;$y+=$SY){ for($x=$X0;$x -le $X1;$x+=$SX){
  $g.CopyFromScreen($x,$y,0,0,(New-Object System.Drawing.Size 1,1)); $c=$b.GetPixel(0,0); $tot++
  if($c.R -gt 250 -and $c.G -gt 250 -and $c.B -gt 250){ $white++; if($ex.Count -lt 4){$ex+="$x,$y"} }
  elseif([math]::Abs($c.R-237)+[math]::Abs($c.G-229)+[math]::Abs($c.B-211) -lt 30){ $cream++ }
  elseif($c.R -lt 60 -and $c.G -lt 60){ $dark++ } else { $other++ }
}}
$g.Dispose();$b.Dispose()
Write-Output "inside panel client: total=$tot white=$white cream=$cream dark=$dark other=$other"
Write-Output ("white at: " + ($ex -join ' '))
