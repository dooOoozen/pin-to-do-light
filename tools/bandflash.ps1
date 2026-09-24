# How long is the band visible, in seconds, after an activation?
#
# The fix under test does not stop the stale caption from being painted into the layered
# window's surface — it reallocates that surface shortly afterwards, which turns a band that
# used to sit there until the next resize into a flash. Whether that is good enough is a
# number, not an impression: this activates the window once and samples the strip every 150 ms
# for eight seconds, then prints the on/off timeline and the measured visible duration.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/bandflash.ps1
param([string]$Proc = 'pin-tauri', [string]$Class = 'Tauri Window', [int]$Samples = 54, [int]$Every = 150)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public static class BF{
 [DllImport("user32.dll")] public static extern bool EnumWindows(E cb,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h,StringBuilder s,int m);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
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
[BF]::C=$Class;[BF]::P=$Proc
[void][BF]::EnumWindows([BF+E]{param($h,$l)[BF]::Run($h,$l)},[IntPtr]::Zero)
if([BF]::F -eq [IntPtr]::Zero){'no layer window';exit 1}
$h=[BF]::F

function Cool{
  $r=New-Object BF+R; [void][BF]::GetWindowRect($h,[ref]$r)
  $w=$r.r-$r.l; $sw=[Math]::Max(64,$w-16)
  $bmp=New-Object System.Drawing.Bitmap($sw,20)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  try { $g.CopyFromScreen($r.l,$r.t,0,0,(New-Object System.Drawing.Size($sw,20))) } catch {}
  $g.Dispose()
  $n=0;$tot=0
  for($y=1;$y -lt 20;$y+=2){ for($x=8;$x -lt ($sw-8);$x+=12){ $p=$bmp.GetPixel($x,$y); $tot++
    $mn=[Math]::Min($p.R,[Math]::Min($p.G,$p.B))
    if($mn -gt 150 -and ($p.B - $p.R) -gt 8){$n++} } }
  $bmp.Dispose()
  return [Math]::Round(100.0*$n/[Math]::Max(1,$tot))
}

$desk=[BF]::ByClass('Progman'); if($desk -eq [IntPtr]::Zero){$desk=[BF]::ByClass('WorkerW')}
$base = Cool
[void][BF]::SetForegroundWindow($desk); Start-Sleep -Milliseconds 600
$pre = Cool
# the trigger: activate the layer, then watch the strip without touching anything else
[void][BF]::SetForegroundWindow($h)
$tl = @()
$onSince = -1; $total = 0
for($i=0; $i -lt $Samples; $i++){
  $c = Cool
  $on = ($c -gt 50)
  if($on){ $total++; if($onSince -lt 0){ $onSince = $i } }
  elseif($onSince -ge 0){ $onSince = -1 }
  $tl += ($(if($on){'#'}{'.'}))
  Start-Sleep -Milliseconds $Every
}
Write-Output ("baseline=" + $base + "%  before-activate=" + $pre + "%")
Write-Output ("timeline (each char = " + $Every + "ms from activation): " + ($tl -join ''))
Write-Output ("visible samples=" + $total + " of " + $Samples + "  first-on=" + $(if($total){[Math]::Round(1000.0*(0)*$Every)}else{'-'}) + "ms  total-visible≈" + [Math]::Round($total*$Every/1000.0,2) + "s")
