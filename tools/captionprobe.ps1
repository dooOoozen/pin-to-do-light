# Reproduce the caption band on demand, and test what actually removes it.
#
# Chasing an event that happens once per boot and is gone before a probe lands has not worked.
# This makes the phenomenon deterministic: write WS_CAPTION onto the layer the way the toolkit
# does, wait for the compositor to draw it, write the clean style back the way the guard does,
# and then ask the only question that matters — is the band still on screen while the style is
# clean? Each step also records DWM's own idea of the frame (DWMWA_EXTENDED_FRAME_BOUNDS),
# because if the compositor still believes there is a 31 px frame, that is a signal readable
# from inside the app without sampling pixels at all.
#
# The original style is restored in every exit path. This touches only the layer window of the
# running instance.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/captionprobe.ps1
param([string]$Proc = 'pin-tauri', [string]$Class = 'Tauri Window', [int]$Hold = 700)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public static class CP{
 [DllImport("user32.dll")] public static extern bool EnumWindows(E cb,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h,StringBuilder s,int m);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int i);
 [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h,int i,int v);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int cx,int cy,uint f);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int a,out R v,int sz);
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
}
"@
[CP]::C=$Class;[CP]::P=$Proc
[void][CP]::EnumWindows([CP+E]{param($h,$l)[CP]::Run($h,$l)},[IntPtr]::Zero)
if([CP]::F -eq [IntPtr]::Zero){'no window';exit 1}
$h=[CP]::F
$orig=[CP]::GetWindowLong($h,-16)

function Probe([string]$label){
  $r=New-Object CP+R; [void][CP]::GetWindowRect($h,[ref]$r)
  $e=New-Object CP+R; $hr=[CP]::DwmGetWindowAttribute($h,9,[ref]$e,[Runtime.InteropServices.Marshal]::SizeOf($e))
  $w=$r.r-$r.l; $ht=$r.b-$r.t
  $sw=[Math]::Max(64,$w-16)
  $bmp=New-Object System.Drawing.Bitmap($sw,24)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $err=''
  try { $g.CopyFromScreen($r.l,$r.t,0,0,(New-Object System.Drawing.Size($sw,24))) } catch { $err='GRAB-FAIL' }
  $g.Dispose()
  $n=0;$tot=0
  for($y=1;$y -lt 24;$y+=2){ for($x=8;$x -lt ($sw-8);$x+=12){ $p=$bmp.GetPixel($x,$y); $tot++;
    if([Math]::Min($p.R,[Math]::Min($p.G,$p.B)) -gt 150){$n++} } }
  $bmp.Dispose()
  $frac=[Math]::Round(100.0*$n/[Math]::Max(1,$tot))
  $style=[CP]::GetWindowLong($h,-16)
  $cap=(($style -band 0x00C00000) -eq 0x00C00000)
  Write-Output ("{0,-22} light={1,3}% captionBit={2,-5} style=0x{3:X8} rect={4}x{5} extFrame={6},{7}..{8},{9} hr={10} {11}" -f `
    $label,$frac,$cap,$style,$w,$ht,$e.l,$e.t,$e.r,$e.b,$hr,$err)
}

try {
  Probe 'baseline'
  # 1. put the caption on, exactly the bits the toolkit writes
  [void][CP]::SetWindowLong($h,-16, ($orig -bor 0x00C80000))
  Start-Sleep -Milliseconds $Hold
  Probe 'caption written'
  # 2. take it back off, exactly what the guard does
  [void][CP]::SetWindowLong($h,-16, $orig)
  Start-Sleep -Milliseconds $Hold
  Probe 'caption stripped'
  Start-Sleep -Milliseconds 1500
  Probe 'stripped +1.5s'
  # 3. the remedy under test: a one-pixel size change and back
  $r=New-Object CP+R; [void][CP]::GetWindowRect($h,[ref]$r)
  [void][CP]::SetWindowPos($h,[IntPtr]::Zero,$r.l,$r.t,($r.r-$r.l-1),($r.b-$r.t-1),0x0014)
  [void][CP]::SetWindowPos($h,[IntPtr]::Zero,$r.l,$r.t,($r.r-$r.l),($r.b-$r.t),0x0034)
  Start-Sleep -Milliseconds $Hold
  Probe 'after nudge'
} finally {
  [void][CP]::SetWindowLong($h,-16, $orig)
  Start-Sleep -Milliseconds 300
  Probe 'restored'
}
