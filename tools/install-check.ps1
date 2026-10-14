# Two checks on the NSIS bundle, in one pass.
#
# 1. The wizard's own pages, read out of the live dialog with UIAutomation and printed — this is
#    the evidence that the language and the page order are what the template says they are. The
#    wizard is not *driven*: NSIS keeps every page's buttons in the same window tree, so a name
#    match finds 完成 on the welcome page too, and its custom-drawn buttons refuse focus, so
#    SendKeys lands wherever the user was typing. Advancing it by hand from a script is not safe.
# 2. A real install and uninstall, run silently into a scratch directory, verified by what appears
#    on disk: the binary, the desktop shortcut the template creates for silent installs, and the
#    uninstaller removing both.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/install-check.ps1
param(
  [string]$Exe = "",
  [switch]$SkipWizard,
  [string]$Dir = "D:\work\software\to_do_tauri\install-test"
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($Exe -eq "") {
  $Exe = Join-Path $PSScriptRoot "..\src-tauri\target\release\bundle\nsis\Pin To-Do_0.1.0_x64-setup.exe"
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]

function Win([int]$pid_) {
  for ($i = 0; $i -lt 40; $i++) {
    $c = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $pid_)
    $w = $AE::RootElement.FindFirst($TS::Children, $c)
    if ($w) { return $w }
    Start-Sleep -Milliseconds 250
  }
  return $null
}
function Show($w, [string]$tag) {
  Write-Host ("--- " + $tag + " title=[" + $w.Current.Name + "] rect=" + $w.Current.BoundingRectangle)
  foreach ($e in $w.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    $n = $e.Current.Name
    if ($n -and $n.Trim().Length -gt 0) {
      $ct = $e.Current.ControlType.ProgrammaticName -replace "ControlType\.", ""
      $vis = if ($e.Current.IsOffscreen) { "hidden" } else { "shown" }
      Write-Host ("    " + $ct + "/" + $vis + " [" + ($n -replace "\r?\n", " / ") + "]")
    }
  }
}

$Exe = (Resolve-Path $Exe).Path
Write-Host ("setup=" + $Exe + " size=" + ((Get-Item $Exe).Length))

# ---- 1. what the wizard actually says ----
if ($SkipWizard) { Write-Host "wizard skipped" } else {
$p = Start-Process -FilePath $Exe -PassThru
$w = Win $p.Id
if ($w) { Show $w "wizard page 1" } else { Write-Host "NO-WINDOW" }
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
"@
if ($w) { [void][W]::PostMessage($w.Current.NativeWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
Start-Sleep -Seconds 2
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Write-Host "wizard closed without installing" }

# ---- 2. silent install, then uninstall ----
if (Test-Path $Dir) { Remove-Item -Recurse -Force $Dir }
$desk = [Environment]::GetFolderPath("Desktop")
$before = @(Get-ChildItem $Desk -Filter "*.lnk" | Select-Object -ExpandProperty Name)
Write-Host ("desktop-lnk-count-before=" + $before.Count)
$s = Start-Process -FilePath $Exe -ArgumentList "/S", "/D=$Dir" -Wait -PassThru
Write-Host ("setup-exit=" + $s.ExitCode)
$exePath = Join-Path $Dir "pin-tauri.exe"
$un = Join-Path $Dir "uninstall.exe"
$reg = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Where-Object { $_.GetValue("DisplayName") -like "*Pin To-Do*" }
Write-Host ("registry-entry=" + (@($reg).Count))
Write-Host ("installed-exe=" + (Test-Path $exePath) + " uninstaller=" + (Test-Path $un))
Write-Host ("dir-contents=" + ((Get-ChildItem $Dir | Select-Object -ExpandProperty Name) -join ", "))
$after = @(Get-ChildItem $Desk -Filter "*.lnk" | Select-Object -ExpandProperty Name)
$new = @($after | Where-Object { $before -notcontains $_ })
Write-Host ("new-shortcuts=" + $new.Count + " [" + ($new -join ", ") + "]")

if (Test-Path $un) {
  $u = Start-Process -FilePath $un -ArgumentList "/S" -Wait -PassThru
  Write-Host ("uninstall-exit=" + $u.ExitCode)
  Start-Sleep -Seconds 3
  Write-Host ("after-uninstall exe-exists=" + (Test-Path $exePath))
  $after2 = @(Get-ChildItem $Desk -Filter "*.lnk" | Select-Object -ExpandProperty Name)
  $left = @($after2 | Where-Object { $before -notcontains $_ })
  $reg2 = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Where-Object { $_.GetValue("DisplayName") -like "*Pin To-Do*" }
  Write-Host ("registry-left=" + (@($reg2).Count))
  Write-Host ("shortcuts-left=" + $left.Count + " [" + ($left -join ", ") + "]")
}
if (Test-Path $Dir) { Remove-Item -Recurse -Force $Dir }
Write-Host ("cleanup dir-exists=" + (Test-Path $Dir))
Write-Host "DONE"
