# Trace the band against focus changes, in scatter mode.
#
# Reported trigger, which is the piece no amount of boot-time sampling produced: the band shows
# up only while the cards are scattered, and only when the layer loses the foreground — clicking
# on the other screen, or opening 设置 / 任务面板 from the deck menu. Both of those are the same
# event from the window manager's side: something else becomes foreground. And the measured band
# colour (about 192,203,214) is Windows 11's *inactive* caption colour, which is painted when a
# window goes from active to inactive. So this walks the window through focus changes and reads
# the pixels after each one, with the clock printed both as GetTickCount (the app's log unit)
# and as epoch milliseconds, so a hit can be lined up against a JS-side log line.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/bandtrace.ps1
param([string]$Proc = 'pin-tauri', [string]$Class = 'Tauri Window', [int]$Settle = 900)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public static class BT{
 [DllImport("user32.dll")] public static extern bool EnumWindows(E cb,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h,StringBuilder s,int m);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h,StringBuilder s,int m);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int i);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int a,out R v,int sz);
 [DllImport("kernel32.dll")] public static extern uint GetTickCount();
 public delegate bool E(IntPtr h,IntPtr l);
 [StructLayout(LayoutKind.Sequential)] public struct R { public int l,t,r,b; }
 public static IntPtr F=IntPtr.Zero; public static string C="",P="";
 public static bool Run(IntPtr h,IntPtr l){
  var sb=new StringBuilder(256);GetClassNameW(h,sb,sb.Capacity);
  if(!string.Equals(sb.ToString(),C,StringComparison.OrdinalIgnoreCase))return true;
  if(!IsWindowVisible(h))return true;
  uint pid;GetWindowThreadProcessId(h,out pid);
  try{if(!string.Equals(System.Diagnostics.Process.GetProcessById((int)pid).ProcessName,P,StringComparison.OrdinalIgnoreCase))return true;}catch{return true;}
  F=h;return true;}
 public static IntPtr ByClass(string cls){
  IntPtr found=IntPtr.Zero;
  EnumWindows((h,l)=>{var sb=new StringBuilder(256);GetClassNameW(h,sb,sb.Capacity);
    if(string.Equals(sb.ToString(),cls,StringComparison.OrdinalIgnoreCase)&&IsWindowVisible(h)){found=h;return false;}
    return true;},IntPtr.Zero);
  return found;}
}
"@
[BT]::C=$Class;[BT]::P=$Proc
[void][BT]::EnumWindows([BT+E]{param($h,$l)[BT]::Run($h,$l)},[IntPtr]::Zero)
if([BT]::F -eq [IntPtr]::Zero){'no layer window';exit 1}
$h=[BT]::F

function Show([string]$label){
  $r=New-Object BT+R; [void][BT]::GetWindowRect($h,[ref]$r)
  $e=New-Object BT+R; [void][BT]::DwmGetWindowAttribute($h,9,[ref]$e,[Runtime.InteropServices.Marshal]::SizeOf($e))
  $w=$r.r-$r.l; $ht=$r.b-$r.t
  $sw=[Math]::Max(64,$w-16); $bh=[Math]::Min(24,[Math]::Max(4,$ht-4))
  $bmp=New-Object System.Drawing.Bitmap($sw,$bh)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  try { $g.CopyFromScreen($r.l,$r.t,0,0,(New-Object System.Drawing.Size($sw,$bh))) } catch {}
  $g.Dispose()
  # cool-light, not light: a scattered card can sit in these rows and card paper (237,229,211)
  # passes a plain brightness test, while the caption is a cool grey (192,203,214). Measured on
  # saved frames: real band 91% cool, card-covered strip 0% cool.
  $n=0;$cool=0;$tot=0
  for($y=1;$y -lt $bh;$y+=2){ for($x=8;$x -lt ($sw-8);$x+=12){ $p=$bmp.GetPixel($x,$y); $tot++
    $mn=[Math]::Min($p.R,[Math]::Min($p.G,$p.B))
    if($mn -gt 150){$n++}
    if($mn -gt 150 -and ($p.B - $p.R) -gt 8){$cool++} } }
  if($cool -gt $tot*0.5){ $bmp.Save((Join-Path $env:TEMP ("bandtrace-" + $label + "-" + [BT]::GetTickCount() + ".png")), [System.Drawing.Imaging.ImageFormat]::Png) }
  $bmp.Dispose()
  $frac=[Math]::Round(100.0*$n/[Math]::Max(1,$tot))
  $cfrac=[Math]::Round(100.0*$cool/[Math]::Max(1,$tot))
  $style=[BT]::GetWindowLong($h,-16); $ex=[BT]::GetWindowLong($h,-20)
  $fg=[BT]::GetForegroundWindow()
  $fcs=New-Object System.Text.StringBuilder(256); [void][BT]::GetClassNameW($fg,$fcs,$fcs.Capacity)
  Write-Output ("{0,-16} light={1,3}% COOL={2,3}% style=0x{3:X8} ex=0x{4:X8} extTop={5} winTop={6} fg={7}({8}) tick={9}" -f `
    $label,$frac,$cfrac,$style,$ex,$e.t,$r.t,$fcs.ToString(),([int64]$fg).ToString('X'),[BT]::GetTickCount())
}

Show 'baseline'
$desk=[BT]::ByClass('Progman'); if($desk -eq [IntPtr]::Zero){$desk=[BT]::ByClass('WorkerW')}
[void][BT]::SetForegroundWindow($desk); Start-Sleep -Milliseconds $Settle
Show 'focus-desktop'
[void][BT]::SetForegroundWindow($h); Start-Sleep -Milliseconds $Settle
Show 'focus-layer'
[void][BT]::SetForegroundWindow($desk); Start-Sleep -Milliseconds $Settle
[void][BT]::SetForegroundWindow($h); Start-Sleep -Milliseconds $Settle
Show 'round-trip'
[void][BT]::SetForegroundWindow($desk); Start-Sleep -Milliseconds 1800
Show 'lost-focus+1.8s'
