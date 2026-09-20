param([int]$Root = 0, [string]$Label = 'snap', [string]$Except = 'nahimic')
$ErrorActionPreference = 'SilentlyContinue'

# WebView2 runs out of process: a Tauri app is one small exe plus a tree of
# msedgewebview2.exe children. Filtering by process NAME (as an Electron
# measurement can) would silently miss the 90 % of memory that matters here, so
# walk the actual descendant tree from the root pid.

$script:kidsBy = @{}
foreach ($p in Get-CimInstance Win32_Process) {
  $ppid = [int]$p.ParentProcessId
  if (-not $script:kidsBy.ContainsKey($ppid)) { $script:kidsBy[$ppid] = @() }
  $script:kidsBy[$ppid] += $p
}

$script:order = New-Object System.Collections.ArrayList
$script:seen = @{}
function Walk([int]$pid2) {
  if ($script:seen.ContainsKey($pid2)) { return }
  $script:seen[$pid2] = $true
  [void]$script:order.Add($pid2)
  if ($script:kidsBy.ContainsKey($pid2)) { foreach ($k in $script:kidsBy[$pid2]) { Walk([int]$k.ProcessId) } }
}
Walk $Root

$rows = @()
foreach ($id in $script:order) {
  $proc = Get-Process -Id $id
  if (-not $proc) { continue }
  $info = $kidsBy.Values | ForEach-Object { $_ } | Where-Object { [int]$_.ProcessId -eq $id }
  $cmd = ''
  $wp = Get-CimInstance Win32_Process -Filter "ProcessId=$id"
  if ($wp) { $cmd = $wp.CommandLine }
  $type = $proc.ProcessName
  if ($cmd -match '--type=([a-z-]+)') { $type = $Matches[1] }
  if ($cmd -match 'utility-sub-type=([a-zA-Z.]+)') { $type = 'util:' + $Matches[1] }
  if ($proc.ProcessName -match 'msedgewebview2') { $type = 'wv2:' + $type }
  # Windows audio/AVCP services get launched under the WebView2 browser process and
  # are not part of this app's budget; nahimicNotifSys alone is 43 MB.
  $ext = 0
  if ($Except -ne '' -and $proc.ProcessName -match $Except) { $ext = 1 }
  $rows += [pscustomobject]@{
    Pid = $id; Type = $type; Ext = $ext
    WS_MB = [math]::Round($proc.WorkingSet64 / 1MB, 1)
    Priv_MB = [math]::Round($proc.PrivateMemorySize64 / 1MB, 1)
    CPU_s = [math]::Round($proc.CPU, 1)
  }
}

Write-Output ("##### " + $Label + "  (tree from pid " + $Root + ", " + $rows.Count + " processes)")
$rows | Sort-Object Priv_MB -Descending | Format-Table -AutoSize | Out-String -Width 160 | Write-Output
$mine = @($rows | Where-Object { -not $_.Ext })
$priv = ($mine | Measure-Object Priv_MB -Sum).Sum
$ws = ($mine | Measure-Object WS_MB -Sum).Sum
$own = ($mine | Where-Object { $_.Type -notmatch 'msedgewebview2|wv2:' } | Measure-Object Priv_MB -Sum).Sum
$skipped = ($rows.Count - $mine.Count)
Write-Output (">>> {0} n={1} WS={2:N1} PRIVATE={3:N1} (app only, excl. shared system webview: {4:N1}){5}" -f `
  $Label, $mine.Count, $ws, $priv, $own, $(if ($skipped -gt 0) { "  [+$skipped external adopted process(es) left out]" } else { "" }))
