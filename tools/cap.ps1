param([int]$X=208,[int]$Y=208,[int]$W=1256,[int]$H=809,[string]$Out='panel.png')
Add-Type -AssemblyName System.Drawing
$b=New-Object System.Drawing.Bitmap $W,$H
$g=[System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($X,$Y,0,0,(New-Object System.Drawing.Size $W,$H))
$g.Dispose(); $b.Save((Join-Path (Get-Location) $Out),[System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
Write-Output "saved $Out ($W x $H)"
