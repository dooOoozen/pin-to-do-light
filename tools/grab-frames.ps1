<#
  Records one rectangle of the screen as raw RGB frames plus a manifest, and drives the
  real cursor between the grabs. Deliberately uses SetCursorPos / mouse_event rather than
  synthetic DOM events: the card layer's hit testing is a window region, so a scripted
  MouseEvent would "pass" on a pixel the user could never click, which is exactly the
  false green this rig exists to avoid.

  -Steps is a small plan language, each item one action:
      move X Y | down | up | click X Y | wait MS | grab N DELAY | type TEXT
  grab writes N frames DELAY ms apart; the delay is recorded so the encoder can replay it.

  .\tools\grab-frames.ps1 -X 1930 -Y 120 -W 620 -H 420 -Out frames -Steps @('move 100 100','grab 20 80')
#>
param(
  [int]$X = 1930, [int]$Y = 120, [int]$W = 620, [int]$H = 420,
  [string]$Out = 'frames',
  [string]$Plan = '',
  [string[]]$Steps = @('grab 24 80')
)
if ($Plan) {
  # powershell -File cannot bind an array from a command line, so a choreography lives in
  # a file with one step per line; blank lines and # comments are ignored.
  $Steps = Get-Content -LiteralPath $Plan | ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith('#') }
}
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Rig {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint d, uint e, uint x, int extra);
  [DllImport("user32.dll")] public static extern bool EnumWindows(E cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  public delegate bool E(IntPtr h, IntPtr l);
  public struct R { public int L, T, Rr, B; }
  public static void Down() { mouse_event(0x0002, 0, 0, 0, 0); }
  public static void Up()   { mouse_event(0x0004, 0, 0, 0, 0); }
  /* raise the app's own window of this width: another window sitting on the same pixels
     of the second monitor would otherwise end up in the recording, which is both wrong
     and a leak of whatever that window was showing */
  public static bool Raise(int want) {
    bool hit = false;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      R r; GetWindowRect(h, out r);
      uint pid; GetWindowThreadProcessId(h, out pid);
      string nm;
      try { nm = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; }
      catch (System.Exception) { return true; }
      if (nm != "pin-tauri") return true;
      if ((r.Rr - r.L) != want) return true;
      BringWindowToTop(h); SetForegroundWindow(h); hit = true;
      return true;
    }, IntPtr.Zero);
    return hit;
  }
}
'@

$frameBytes = $W * $H * 3
$fs = [System.IO.File]::Create((Join-Path (Get-Location) "$Out.rgb"))
$bw = New-Object System.IO.BinaryWriter $fs
$delays = New-Object System.Collections.Generic.List[int]
$rowBuf = $null
$frameBytes = 0
$strideOut = 0
$bmp = New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H

function Grab-One {
  $gfx.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size $W, $H))
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                        [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $abs = [Math]::Abs($data.Stride)
  $script:strideOut = $data.Stride
  # Measured here, not read off the docs: a positive stride still hands back top-down rows
  # for a memory bitmap, and flipping on the sign produced an upside-down capture.
  $script:frameBytes = $abs * $H
  # One copy of the whole buffer, not one per row: the row loop measured 450 ms a frame,
  # which is 2 fps and cannot capture a one-second animation at all. The encoder strips
  # the row padding instead.
  $size = $abs * $H
  if ($null -eq $rowBuf -or $rowBuf.Length -ne $size) { $rowBuf = New-Object byte[] $size }
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $rowBuf, 0, $size)
  $bw.Write($rowBuf)
  $bmp.UnlockBits($data)
}

$origin = [System.Windows.Forms.Cursor]::Position
foreach ($s in $Steps) {
  $p = $s.Trim() -split '\s+'
  switch ($p[0]) {
    'move'  { [Rig]::SetCursorPos([int]$p[1], [int]$p[2]) | Out-Null; Start-Sleep -Milliseconds 60 }
    'down'  { [Rig]::Down(); Start-Sleep -Milliseconds 40 }
    'up'    { [Rig]::Up();   Start-Sleep -Milliseconds 40 }
    'click' { [Rig]::SetCursorPos([int]$p[1], [int]$p[2]) | Out-Null; Start-Sleep -Milliseconds 90
              [Rig]::Down(); Start-Sleep -Milliseconds 40; [Rig]::Up(); Start-Sleep -Milliseconds 90 }
    'wait'  { Start-Sleep -Milliseconds ([int]$p[1]) }
    'raise' { [void][Rig]::Raise([int]$p[1]); Start-Sleep -Milliseconds 250 }
    'grab'  {
      $n = [int]$p[1]; $d = [int]$p[2]
      for ($i = 0; $i -lt $n; $i++) {
        $t0 = [DateTime]::Now
        Grab-One
        $delays.Add($d)
        $sp = $d - [int]([DateTime]::Now - $t0).TotalMilliseconds
        if ($sp -gt 0) { Start-Sleep -Milliseconds $sp }
      }
    }
    default { throw "unknown step: $s" }
  }
}

$bw.Flush(); $bw.Close(); $fs.Close()
$gfx.Dispose(); $bmp.Dispose()
[Rig]::SetCursorPos($origin.X, $origin.Y) | Out-Null

$meta = '{"w":' + $W + ',"h":' + $H + ',"stride":' + $strideOut + ',"bytes":' + $frameBytes +
  ',"bgr":true,"frames":' + $delays.Count + ',"delays":[' + ($delays -join ',') + ']}'
Set-Content -Path (Join-Path (Get-Location) "$Out.json") -Value $meta -Encoding ascii
Write-Output "wrote $Out.rgb ($($delays.Count) frames of ${W}x${H}) and $Out.json"
