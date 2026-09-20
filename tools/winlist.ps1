Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class WL {
 [DllImport("user32.dll")] public static extern bool EnumWindows(E cb,IntPtr l);
 [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 public delegate bool E(IntPtr h,IntPtr l);
 public struct R { public int L,T,Rr,B; }
 public static void Go(int root){
  EnumWindows((h,l)=>{ if(!IsWindowVisible(h)) return true;
   uint pid; GetWindowThreadProcessId(h,out pid);
   if((int)pid!=root) return true;
   var sb=new StringBuilder(200); GetWindowTextW(h,sb,200);
   R r; GetWindowRect(h,out r);
   Console.WriteLine("  OURWIN ["+sb.ToString()+"] "+(r.Rr-r.L)+"x"+(r.B-r.T)+" at "+r.L+","+r.T);
   return true; }, IntPtr.Zero); }
}
"@
[WL]::Go($args[0])
