# Report the extended styles of every top-level window owned by a process, so that
# "the deck stopped floating above other apps" can be answered by the window manager
# rather than by reading the renderer: WS_EX_TOPMOST 0x8, WS_EX_LAYERED 0x80000.
param([int]$Want = 0)
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class TP {
 [DllImport("user32.dll")] public static extern bool EnumWindows(E cb,IntPtr l);
 [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int i);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out R r);
 public delegate bool E(IntPtr h,IntPtr l);
 public struct R { public int L,T,Rr,B; }
 public static void Go(int want){
  EnumWindows((h,l)=>{
   uint pid; GetWindowThreadProcessId(h,out pid);
   if(want!=0 && (int)pid!=want) return true;
   int ex=GetWindowLong(h,-20);
   R r; GetWindowRect(h,out r);
   var sb=new StringBuilder(120); GetWindowTextW(h,sb,120);
   Console.WriteLine((IsWindowVisible(h)?"shown":"hid ")+" hwnd=0x"+((long)h).ToString("X")+
     " ex=0x"+(ex & 0xFFFFFFFF).ToString("X8")+
     " top="+(((ex & 0x8)!=0)?"Y":"n")+
     " lay="+(((ex & 0x80000)!=0)?"Y":"n")+
     " xparent="+(((ex & 0x20)!=0)?"Y":"n")+
     " ["+sb.ToString()+"] "+(r.Rr-r.L)+"x"+(r.B-r.T)+"@"+r.L+","+r.T);
   return true; }, IntPtr.Zero);
 }
}
"@
[TP]::Go($Want)
