<#
  切换默认麦克风
  ------------------------------------------------------------------
  1) 列出这台电脑所有能用的「录音设备」，并逐个实测音量
  2) 告诉你哪一个能收到声音
  3) 你选一个，就把它设成 Windows 的默认麦克风（控制台 / 多媒体 / 通信 三个角色）

  不带参数运行 = 只看不改（安全）。
  带 -Pick 序号 = 切换。
  带 -Interactive = 看完问你序号（双击 .bat 就是这个模式）。

  只改「默认设备」这一个设置，不动别的东西；不需要管理员。
#>
param(
  [int]$Pick = 0,
  [switch]$Interactive,
  [int]$MeasureMs = 2000
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$code = @'
using System;
using System.Runtime.InteropServices;

namespace HanLinMic {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMEnum { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr p);
    int UnregisterEndpointNotificationCallback(IntPtr p);
  }
  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceCollection {
    int GetCount(out int count);
    int Item(int index, out IMMDevice device);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr ap, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    int OpenPropertyStore(int stgm, out IPropertyStore props);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out int state);
  }
  [StructLayout(LayoutKind.Sequential)] public struct PROPERTYKEY { public Guid fmtid; public int pid; }
  [StructLayout(LayoutKind.Explicit)] public struct PROPVARIANT { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; }
  [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    int GetCount(out int c);
    int GetAt(int i, out PROPERTYKEY k);
    int GetValue(ref PROPERTYKEY k, out PROPVARIANT v);
  }
  [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioMeterInformation {
    int GetPeakValue(out float v);
    int GetMeteringChannelCount(out int c);
    int GetChannelsPeakValues(int n, [Out] float[] v);
    int QueryHardwareSupport(out int s);
  }
  [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class CPolicyConfigClient { }
  [ComImport, Guid("294935CE-F637-4E7C-A41B-AB255460B862")] class CPolicyConfigVistaClient { }
  [Guid("F8679F50-9E73-4B0B-8EFF-2F5A3D4A0E3C"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfig {
    int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string id, out IntPtr f);
    int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, int b, out IntPtr f);
    int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id);
    int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr a, IntPtr b);
    int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, int a, out long b, out long c);
    int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, ref long p);
    int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, out IntPtr m);
    int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr m);
    int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, ref PROPERTYKEY k, out PROPVARIANT v);
    int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, ref PROPERTYKEY k, ref PROPVARIANT v);
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
    int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string id, int v);
  }
  [Guid("568B9108-44BF-40B4-9006-86AFE5B5A620"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfigVista {
    int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string id, out IntPtr f);
    int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, int b, out IntPtr f);
    int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr a, IntPtr b);
    int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, int a, out long b, out long c);
    int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, ref long p);
    int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, out IntPtr m);
    int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr m);
    int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, ref PROPERTYKEY k, out PROPVARIANT v);
    int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, ref PROPERTYKEY k, ref PROPVARIANT v);
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
    int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string id, int v);
  }

  public class Cap {
    public string Id;
    public string Name;
    public int State;
    public float Peak;
  }

  public static class Api {
    static IMMDeviceEnumerator En() { return (IMMDeviceEnumerator)(new MMEnum()); }

    static string NameOf(IMMDevice dev) {
      var k = new PROPERTYKEY();
      k.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0");
      k.pid = 14;
      IPropertyStore ps; dev.OpenPropertyStore(0, out ps);
      PROPVARIANT pv; ps.GetValue(ref k, out pv);
      if (pv.vt == 31 && pv.p != IntPtr.Zero) return Marshal.PtrToStringUni(pv.p);
      return "(无名设备)";
    }

    public static Cap[] List() {
      IMMDeviceCollection col;
      En().EnumAudioEndpoints(1, 1, out col);
      int n; col.GetCount(out n);
      var list = new Cap[n];
      for (int i = 0; i < n; i++) {
        IMMDevice d; col.Item(i, out d);
        var c = new Cap();
        d.GetId(out c.Id);
        c.Name = NameOf(d);
        d.GetState(out c.State);
        c.Peak = -1f;
        list[i] = c;
      }
      return list;
    }

    public static float Measure(string id, int ms) {
      try {
        IMMDevice d; En().GetDevice(id, out d);
        var iid = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064");
        object o; d.Activate(ref iid, 0x17, IntPtr.Zero, out o);
        var m = (IAudioMeterInformation)o;
        float mx = 0;
        int n = Math.Max(1, ms / 100);
        for (int i = 0; i < n; i++) {
          float v; m.GetPeakValue(out v);
          if (v > mx) mx = v;
          System.Threading.Thread.Sleep(100);
        }
        return mx;
      } catch { return -1f; }
    }

    public static string DefaultName(int role) {
      try {
        IMMDevice d; En().GetDefaultAudioEndpoint(1, role, out d);
        return NameOf(d);
      } catch { return "(读不到)"; }
    }

    /* 不同 Windows 版本能用的接口不一样，逐个试，返回用上的那个的名字 */
    public static string SetDefault(string id, int role) {
      object o1 = null, o2 = null;
      try { o1 = new CPolicyConfigClient(); } catch { }
      if (o1 != null) {
        var a = o1 as IPolicyConfig;
        if (a != null) { try { if (a.SetDefaultEndpoint(id, role) == 0) return "IPolicyConfig"; } catch { } }
        var b = o1 as IPolicyConfigVista;
        if (b != null) { try { if (b.SetDefaultEndpoint(id, role) == 0) return "IPolicyConfigVista"; } catch { } }
      }
      try { o2 = new CPolicyConfigVistaClient(); } catch { }
      if (o2 != null) {
        var c = o2 as IPolicyConfigVista;
        if (c != null) { try { if (c.SetDefaultEndpoint(id, role) == 0) return "IPolicyConfigVista(client)"; } catch { } }
      }
      return "";
    }
  }
}
'@

Add-Type -TypeDefinition $code -Language CSharp | Out-Null

function Show-Header($t) {
  Write-Host ""
  Write-Host ("=" * 60) -ForegroundColor DarkGray
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host ("=" * 60) -ForegroundColor DarkGray
}

function Get-Kind($name) {
  $n = "$name".ToLower()
  if ($n -match 'bluetooth|hands-free|hands free|蓝牙|misiom|linkbuds|soundcore|airpods|buds|qcy|edifier|漫步者') { return "蓝牙设备" }
  if ($n -match 'steam|virtual|虚拟|cable|vb-audio|voicemeeter|nvidia|obs') { return "虚拟设备" }
  if ($n -match 'array|阵列|internal|内置|realtek|intel|digital mic|conexant|synaptics') { return "内置麦克风" }
  return "其他"
}

function Pad2($s, $n) {
  $w = 0
  foreach ($ch in "$s".ToCharArray()) { if ([int]$ch -gt 255) { $w += 2 } else { $w += 1 } }
  $out = "$s"
  while ($w -lt $n) { $out += " "; $w++ }
  return $out
}

Show-Header "正在检测这台电脑的录音设备（每个实测 $([math]::Round($MeasureMs/1000,1)) 秒）"
Write-Host "  检测期间可以对着麦克风说话，结果更准。" -ForegroundColor Yellow

$devs = [HanLinMic.Api]::List()
if (-not $devs -or $devs.Count -eq 0) {
  Write-Host "  没有检测到任何录音设备。请检查麦克风是否插好。" -ForegroundColor Red
  exit 1
}

$rows = @()
$i = 0
foreach ($d in $devs) {
  $i++
  $peak = [HanLinMic.Api]::Measure($d.Id, $MeasureMs)
  $verdict = "几乎收不到"
  if ($peak -lt 0) { $verdict = "打不开" } elseif ($peak -ge 0.015) { $verdict = "能收到声音 ✔" }
  $rows += [pscustomobject]@{
    序号 = $i
    名称 = $d.Name
    类型 = (Get-Kind $d.Name)
    音量 = $peak
    结论 = $verdict
    Id = $d.Id
  }
}

foreach ($r in $rows) {
  $vol = "—"
  if ($r.音量 -ge 0) { $vol = "{0,5:N1}" -f ($r.音量 * 100) }
  $color = "Gray"
  if ($r.音量 -ge 0.015) { $color = "Green" } elseif ($r.音量 -ge 0) { $color = "Yellow" }
  Write-Host ("  [" + $r.序号 + "] " + (Pad2 $r.名称 34) + (Pad2 $r.类型 12) + "音量 " + $vol + "   " + $r.结论) -ForegroundColor $color
}

$best = $rows | Where-Object { $_.音量 -ge 0.015 } | Sort-Object -Property 音量 -Descending | Select-Object -First 1
if (-not $best) {
  $best = $rows | Where-Object { $_.类型 -eq "内置麦克风" } | Select-Object -First 1
}
if (-not $best) {
  $best = $rows | Where-Object { $_.类型 -ne "虚拟设备" } | Sort-Object -Property 音量 -Descending | Select-Object -First 1
}

Show-Header "现在 Windows 默认用的麦克风"
Write-Host ("  " + [HanLinMic.Api]::DefaultName(0))

$privacyOk = $true
foreach ($k in @("HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone",
                 "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone")) {
  if (Test-Path $k) {
    $v = (Get-ItemProperty $k -ErrorAction SilentlyContinue).Value
    if ($v -and $v -ne "Allow") { $privacyOk = $false }
    $nk = Join-Path $k "NonPackaged"
    if (Test-Path $nk) {
      $v2 = (Get-ItemProperty $nk -ErrorAction SilentlyContinue).Value
      if ($v2 -and $v2 -ne "Allow") { $privacyOk = $false }
    }
  }
}
Write-Host ""
if ($privacyOk) {
  Write-Host "  系统麦克风权限：已允许 ✓" -ForegroundColor Green
} else {
  Write-Host "  系统麦克风权限：被关掉了 ✗" -ForegroundColor Red
  Write-Host "    请打开：设置 → 隐私和安全性 → 麦克风 → 把「麦克风访问」和「让桌面应用访问你的麦克风」都打开。" -ForegroundColor Yellow
}

if ($best) {
  Write-Host ""
  if ($best.音量 -ge 0.015) {
    Write-Host ("  推荐用：[" + $best.序号 + "] " + $best.名称 + "（实测能收到声音）") -ForegroundColor Green
  } else {
    Write-Host "  注意：这次没有一个麦克风测到声音。可能是刚才没人说话，也可能是设备不对。" -ForegroundColor Yellow
    Write-Host ("  建议先切到：[" + $best.序号 + "] " + $best.名称 + "（内置麦克风最稳），对着它说话再跑一次。") -ForegroundColor Yellow
  }
}

if ($Interactive -and $Pick -le 0) {
  Write-Host ""
  $ans = Read-Host "输入要设为默认的序号（直接回车 = 不改，退出）"
  if ($ans -match '^\d+$') { $Pick = [int]$ans }
}

if ($Pick -le 0) {
  Write-Host ""
  Write-Host "（本次只看不改。要切换就双击「切换默认麦克风.bat」，或加 -Pick 序号 再运行。）" -ForegroundColor DarkGray
  exit 0
}

$target = $rows | Where-Object { $_.序号 -eq $Pick } | Select-Object -First 1
if (-not $target) { Write-Host "  序号 $Pick 不存在。" -ForegroundColor Red; exit 1 }

Show-Header "把默认麦克风切换成：[$($target.序号)] $($target.名称)"
$before = [HanLinMic.Api]::DefaultName(0)
$ok = $true
$usedApi = ""
foreach ($role in 0, 1, 2) {
  $used = [HanLinMic.Api]::SetDefault($target.Id, $role)
  if ($used) { $usedApi = $used } else { $ok = $false; Write-Host ("  角色 $role 切换失败") -ForegroundColor Red }
}
if (-not $ok) {
  Write-Host "  切换失败。可以先用 Windows 设置里的「声音 → 输入」手动改。" -ForegroundColor Red
  exit 1
}
Start-Sleep -Milliseconds 400
Write-Host ("  切换前：" + $before) -ForegroundColor DarkGray
Write-Host ("  切换后：" + [HanLinMic.Api]::DefaultName(0)) -ForegroundColor Green
if ($usedApi) { Write-Host ("  （使用的接口：" + $usedApi + "）") -ForegroundColor DarkGray }

Write-Host ""
Write-Host "  再用新默认设备测 3 秒，请对着麦克风说一句话……" -ForegroundColor Yellow
$peak2 = [HanLinMic.Api]::Measure($target.Id, 3000)
if ($peak2 -ge 0.015) {
  Write-Host ("  实测音量 " + ("{0:N1}" -f ($peak2 * 100)) + "  →  现在能收到声音 ✓") -ForegroundColor Green
  Write-Host "  可以打开采访页面了：双击「启动采访-不询问麦克风.bat」。" -ForegroundColor Green
} elseif ($peak2 -lt 0) {
  Write-Host "  这个设备打不开（可能被别的程序独占）。换一个再试。" -ForegroundColor Red
} else {
  Write-Host ("  实测音量 " + ("{0:N1}" -f ($peak2 * 100)) + "  →  还是几乎收不到 ✗") -ForegroundColor Red
  Write-Host "  请检查：麦克风有没有被静音、离得是不是太远（15~20 厘米最合适），或换一个设备再跑一次。" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  想还原：再跑一次选回原来的设备（上面「切换前」那个名字）。" -ForegroundColor DarkGray
