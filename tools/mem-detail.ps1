$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class K {
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb,IntPtr l);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,int m,IntPtr w,IntPtr l);
 public delegate bool EnumProc(IntPtr h,IntPtr l);
 public struct RECT { public int Left,Top,Right,Bottom; }
 public static IntPtr Small=IntPtr.Zero;
 public static void Find(){ Small=IntPtr.Zero; long best=long.MaxValue;
  EnumWindows((h,l)=>{ if(!IsWindowVisible(h)) return true;
   uint pid; GetWindowThreadProcessId(h,out pid); string path="";
   try{ path=System.Diagnostics.Process.GetProcessById((int)pid).MainModule.FileName; }catch{ return true; }
   if(!path.StartsWith("D:\\work\\software\\to_do_tauri")) return true;
   RECT r; GetWindowRect(h,out r); int wd=r.Right-r.Left, ht=r.Bottom-r.Top;
   if(wd<=0||ht<=0||wd>1600) return true;
   long a=(long)wd*ht; if(a<best){best=a; Small=h;}
   return true; }, IntPtr.Zero); }
}
"@
function Table($label) {
  $procs = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.ExecutablePath -like 'D:\work\software\to_do_tauri\*' }
  $rows = @(); $wsT = 0.0; $pvT = 0.0
  foreach ($p in $procs) {
    $t = 'main'
    if ($p.CommandLine -match '--type=([a-z-]+)') { $t = $Matches[1] }
    if ($p.CommandLine -match 'utility-sub-type=([a-zA-Z.]+)') { $t = 'util:' + $Matches[1] }
    $o = Get-Process -Id $p.ProcessId
    if ($o) {
      $rows += [pscustomobject]@{ Type = $t; WS_MB = [math]::Round($o.WorkingSet64 / 1MB, 1); Priv_MB = [math]::Round($o.PrivateMemorySize64 / 1MB, 1) }
      $wsT += $o.WorkingSet64; $pvT += $o.PrivateMemorySize64
    }
  }
  Write-Output ("##### " + $label)
  $rows | Sort-Object Priv_MB -Descending | Format-Table -AutoSize | Out-String -Width 120 | Write-Output
  Write-Output (">>> {0} n={1} WS={2:N1} PRIVATE={3:N1}" -f $label, $rows.Count, ($wsT / 1MB), ($pvT / 1MB))
}
Table ($args[0] + " [both]")
[K]::Find()
if ([K]::Small -ne [IntPtr]::Zero) { [K]::PostMessage([K]::Small, 0x0010, [IntPtr]0, [IntPtr]0) | Out-Null }
Start-Sleep -Seconds 12
Table ($args[0] + " [resident]")
