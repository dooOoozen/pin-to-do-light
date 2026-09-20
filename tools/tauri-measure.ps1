param([string]$Exe = 'D:\work\software\to_do_tauri\pin-tauri\src-tauri\target\release\pin-tauri.exe',
       [int]$SettleSec = 22)
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;using System.Runtime.InteropServices;using System.Collections.Generic;
public class TW {
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb,IntPtr l);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,int m,IntPtr w,IntPtr l);
 public delegate bool EnumProc(IntPtr h,IntPtr l);
 public struct RECT { public int Left,Top,Right,Bottom; }
 public static List<string> Items=new List<string>();
 public static IntPtr Small=IntPtr.Zero;
 public static void Scan(int root){
  Items.Clear(); Small=IntPtr.Zero; long best=long.MaxValue;
  EnumWindows((h,l)=>{
   if(!IsWindowVisible(h)) return true;
   uint pid; GetWindowThreadProcessId(h,out pid);
   RECT r; GetWindowRect(h,out r); int wd=r.Right-r.Left, ht=r.Bottom-r.Top;
   if(wd<=0||ht<=0) return true;
   Items.Add("hwnd="+h+" pid="+pid+" "+wd+"x"+ht);
   if(pid==(uint)root){ long a=(long)wd*ht; if(a<best && wd < 1600){best=a; Small=h;} }
   return true; }, IntPtr.Zero); }
}
"@

function Snap($label, $root) {
  & 'D:\work\software\to_do_tauri\mem-tree.ps1' -Root $root -Label $label
}

Write-Output ("launching: " + $Exe)
if (-not (Test-Path $Exe)) { throw "not found: $Exe" }
$p = Start-Process -FilePath $Exe -PassThru
$root = $p.Id
Write-Output ("root pid = " + $root)
Start-Sleep -Seconds $SettleSec

[TW]::Scan($root)
[TW]::Items | ForEach-Object { Write-Output ("  WIN " + $_) }
Snap "tauri-both-windows" $root

if ([TW]::Small -ne [IntPtr]::Zero) {
  Write-Output ("  closing dashboard hwnd " + [TW]::Small)
  [TW]::PostMessage([TW]::Small, 0x0010, [IntPtr]0, [IntPtr]0) | Out-Null
  Start-Sleep -Seconds 12
} else { Write-Output "  (no separate dashboard window found to close)" }
Snap "tauri-card-layer-only" $root

Write-Output ("  killing tree at pid " + $root)
Get-CimInstance Win32_Process -Filter "ProcessId=$root" | ForEach-Object { $_.Terminate() } | Out-Null
try { Stop-Process -Id $root -Force -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 3
Get-Process -Name msedgewebview2 -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-5) } | ForEach-Object {
  Write-Output ("  (leftover msedgewebview2 pid " + $_.Id + " -- these belong to a host that is still running)")
}
