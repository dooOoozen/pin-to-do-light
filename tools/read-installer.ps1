# Reads the text of the installer wizard without installing anything: starts setup, walks the
# UI tree, prints every visible string, then closes the window.
param([string]$Exe = "")
# The console default is the OEM code page, which turns the Chinese wizard text into mojibake.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($Exe -eq "") {
  $Exe = Join-Path $PSScriptRoot "..\src-tauri\target\release\bundle\nsis\Pin To-Do_0.1.0_x64-setup.exe"
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$p = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds 3
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
if ($wins.Count -eq 0) { Write-Output "NO-WINDOW pid=$($p.Id)"; Stop-Process -Id $p.Id -Force; exit 1 }
foreach ($w in $wins) {
  Write-Output ("WINDOW title=[" + $w.Current.Name + "] class=" + $w.Current.ClassName +
    " rect=" + $w.Current.BoundingRectangle)
  $all = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $all) {
    $n = $e.Current.Name
    if ($n -and $n.Trim().Length -gt 0) {
      $ct = $e.Current.ControlType.ProgrammaticName -replace "ControlType\.", ""
      Write-Output ("  " + $ct + " :: " + $n)
    }
  }
  try { $src = [System.Windows.Automation.WindowPattern]::Identified; $w.GetCurrentPattern($src).Close() }
  catch { Write-Output "  close-failed: $_" }
}
Start-Sleep -Milliseconds 500
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Write-Output "DONE"
