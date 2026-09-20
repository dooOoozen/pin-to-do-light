$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
using System.Collections.Generic;
public class H {
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb,IntPtr l);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,int m,IntPtr w,IntPtr l);
 public delegate bool EnumProc(IntPtr h,IntPtr l);
 public struct RECT { public int Left,Top,Right,Bottom; }
 public static IntPtr Small=IntPtr.Zero;
 public static void Find(){ Small=IntPtr.Zero; long best=long.MaxValue;
  var ours=new HashSet<int>();
  foreach(var p in System.Diagnostics.Process.GetProcessesByName("electron")){
    var cmd=""; try{ cmd=new System.Diagnostics.Process[]{}[0].ProcessName; }catch{}
    ours.Add(p.Id); }
  EnumWindows((h,l)=>{ if(!IsWindowVisible(h)) return true;
   uint pid; GetWindowThreadProcessId(h,out pid);
   string path=""; try{ path=System.Diagnostics.Process.GetProcessById((int)pid).MainModule.FileName; }catch{ return true; }
   if(!path.StartsWith("D:\\work\\software\\to_do_tauri")) return true;
   RECT r; GetWindowRect(h,out r); int wd=r.Right-r.Left, ht=r.Bottom-r.Top;
   if(wd<=0||ht<=0||wd>1600) return true;      /* skip the full-workarea layer */
   long a=(long)wd*ht; if(a<best){best=a; Small=h;}
   return true; }, IntPtr.Zero); }
}
"@
function Snap($label) {
  $procs = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.ExecutablePath -like 'D:\work\software\to_do_tauri\*' }
  $ws = 0.0; $priv = 0.0; $n = 0
  foreach ($p in $procs) {
    $o = Get-Process -Id $p.ProcessId
    if ($o) { $ws += $o.WorkingSet64; $priv += $o.PrivateMemorySize64; $n++ }
  }
  Write-Output ("{0,-26} procs={1}  WS={2,7:N1} MB  PRIVATE={3,7:N1} MB" -f $label, $n, ($ws / 1MB), ($priv / 1MB))
}
Snap $args[0]
[H]::Find()
if ([H]::Small -ne [IntPtr]::Zero) {
  [H]::PostMessage([H]::Small, 0x0010, [IntPtr]0, [IntPtr]0) | Out-Null
  Write-Output ("  (closed dashboard hwnd " + [H]::Small + ")")
} else { Write-Output "  (no dashboard window found)" }
Start-Sleep -Seconds 12
Snap ($args[0] + " [card layer only]")
