param([int]$FindL = 2260, [int]$FindT = 28, [int]$X = 1920, [int]$Y = -88, [int]$W = 1920, [int]$H = 1032)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class MV {
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int re, bool r);
 [DllImport("user32.dll")] public static extern bool EnumWindows(E cb,IntPtr l);
 [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 public delegate bool E(IntPtr h,IntPtr l);
 public struct R { public int L,T,Rr,B; }
 public static string Go(int fl,int ft,int x,int y,int w,int hh,bool re) {
  var found = "";
  EnumWindows((h,l)=>{
    if(!IsWindowVisible(h)) return true;
    R r; GetWindowRect(h,out r);
    if(r.L==fl && r.T==ft) { MoveWindow(h,x,y,w,hh,re); found = "hwnd="+h+" was "+(r.Rr-r.L)+"x"+(r.B-r.T); }
    return true;
  }, IntPtr.Zero);
  return found;
 }
}
"@
$out = [MV]::Go($FindL, $FindT, $X, $Y, $W, $H, $true)
if ($out -eq '') { Write-Output "NO WINDOW at $FindL,$FindT" } else { Write-Output ("moved " + $out + " -> $X,$Y ${W}x$H") }
