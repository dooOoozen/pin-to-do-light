param([string]$Points = '960,60;600,300;1200,980;40,40')
Add-Type -AssemblyName System.Drawing
$b = New-Object System.Drawing.Bitmap 1,1
$g = [System.Drawing.Graphics]::FromImage($b)
foreach ($p in $Points.Split(';')) {
  $xy = $p.Split(',')
  $x = [int]$xy[0]; $y = [int]$xy[1]
  $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size 1, 1))
  $c = $b.GetPixel(0, 0)
  Write-Output ("  {0,5},{1,5} = {2,3},{3,3},{4,3}" -f $x, $y, $c.R, $c.G, $c.B)
}
$g.Dispose(); $b.Dispose()
