param([int]$Root = 0, [int]$Times = 1, [int]$DelayMs = 400)
# Dumps the real Win32 style bits of every top-level window of a process, so a caption
# that only exists for a moment can be caught in the act.
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class ST {
 [DllImport("user32.dll")] public static extern bool EnumWindows(E cb,IntPtr l);
 [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out R r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref P p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetWindowLongW(IntPtr h,int i);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint f);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int a,out int v,int s);
 public delegate bool E(IntPtr h,IntPtr l);
 public struct R { public int L,T,Rr,B; }
 public struct P { public int X,Y; }
 const int GWL_STYLE=-16, GWL_EXSTYLE=-20;
 public static string Bits(int v){
   string[] n={"WS_POPUP","WS_CHILD","WS_MINIMIZE","WS_VISIBLE","WS_DISABLED","WS_CAPTION","WS_BORDER","WS_DLGFRAME","WS_SYSMENU","WS_THICKFRAME","WS_GROUP","WS_TABSTOP","WS_MAXIMIZE","WS_CLIPCHILDREN","WS_EXSTYLE?","WS_MINIMIZEBOX","WS_MAXIMIZEBOX"};
   int[] m={unchecked((int)0x80000000),0x40000000,0x20000000,0x10000000,0x08000000,0x00C00000,0x00800000,0x00400000,0x00080000,0x00040000,0x00020000,0x00010000,0x00008000,0x00004000,0x00002000,0x00001000};
   var sb=new StringBuilder();
   for(int i=0;i<m.Length;i++) if((v & m[i])==m[i] && m[i]!=0) sb.Append(n[i]+" ");
   return sb.ToString();
 }
 public static string Ex(int v){
   var sb=new StringBuilder();
   if((v&0x00000080)!=0) sb.Append("TOOLWINDOW ");
   if((v&0x00000010)!=0) sb.Append("TOPMOST ");
   if((v&0x00080000)!=0) sb.Append("LAYERED ");
   if((v&0x00000020)!=0) sb.Append("TRANSPARENT ");
   if((v&0x00040000)!=0) sb.Append("WS_EX_APPWINDOW ");
   if((v&0x00000100)!=0) sb.Append("WINDOWEDGE ");
   if((v&0x00200000)!=0) sb.Append("COMPOSITED ");
   if((v&0x00020000)!=0) sb.Append("PALETTEWINDOW ");
   return sb.ToString();
 }
 public static void Go(int pid){
  EnumWindows((h,l)=>{
   uint p; GetWindowThreadProcessId(h,out p);
   if(pid!=0 && (int)p!=pid) return true;
   var sb=new StringBuilder(300); GetWindowTextW(h,sb,300);
   R r; GetWindowRect(h,out r);
   R cr; GetClientRect(h,out cr);
   P origin = new P(); origin.X=0; origin.Y=0; ClientToScreen(h,ref origin);
   int cloak=0; try { DwmGetWindowAttribute(h,14,out cloak,4); } catch {}
   int st=GetWindowLongW(h,GWL_STYLE), ex=GetWindowLongW(h,GWL_EXSTYLE);
   bool vis=IsWindowVisible(h);
   string owner = GetAncestor(h,3).ToString();
   Console.WriteLine("hwnd="+h+" vis="+vis+" cloak="+cloak+" win="+(r.Rr-r.L)+"x"+(r.B-r.T)+"@"+r.L+","+r.T+
     " client="+(cr.Rr-cr.L)+"x"+(cr.B-cr.T)+" ncOrigin="+origin.X+","+origin.Y+
     " owner="+owner+" title=["+sb.ToString()+"] style=0x"+st.ToString("X8")+" ["+Bits(st)+"] ex=0x"+ex.ToString("X8")+" ["+Ex(ex)+"]");
   return true; }, IntPtr.Zero);
 }
}
"@
for ($i = 0; $i -lt $Times; $i++) {
  Write-Output "--- probe $i $(Get-Date -Format 'HH:mm:ss.fff') ---"
  [ST]::Go($Root)
  if ($i -lt ($Times - 1)) { Start-Sleep -Milliseconds $DelayMs }
}
