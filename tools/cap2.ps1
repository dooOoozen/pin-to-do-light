param([int]$X = 1920, [int]$Y = 200, [int]$W = 520, [int]$H = 460, [string]$Out = 'cap.png')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
# Crops one rectangle and writes it: the card layer covers a whole screen, so a
# window-sized crop would capture unrelated desktop content. Aim it at monitor 2.
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size $W, $H))
$g.Dispose()
$bmp.Save((Join-Path (Get-Location) $Out), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "wrote $Out  $W x $H from $X,$Y"
