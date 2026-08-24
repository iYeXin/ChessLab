param(
  [Parameter(Mandatory=$true)][string]$ProcessName,
  [int]$ClientX = 0,
  [int]$ClientY = 0
)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WClick {
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public struct POINT { public int X, Y; }
}
"@
$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
if (-not $proc) { Write-Error "window $ProcessName not found"; exit 1 }
$rect = New-Object WClick+RECT
[WClick]::GetClientRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
$dpi = 96; try { $d=[WClick]::GetDpiForWindow($proc.MainWindowHandle); if($d -gt 0){$dpi=$d} } catch {}
$scale = $dpi / 96
$pt = New-Object WClick+POINT
$pt.X = $ClientX; $pt.Y = $ClientY
[WClick]::ClientToScreen($proc.MainWindowHandle, [ref]$pt) | Out-Null
# ClientToScreen returns logical, scale to physical for SetCursorPos
$pt.X = [int]($pt.X * $scale)
$pt.Y = [int]($pt.Y * $scale)
Write-Host "client $ClientX,$ClientY -> screen $($pt.X),$($pt.Y)  clientRect $($rect.Right)x$($rect.Bottom) dpi $dpi scale $scale"
[WClick]::SetCursorPos($pt.X, $pt.Y) | Out-Null
Start-Sleep -Milliseconds 80
[WClick]::mouse_event(0x02,0,0,0,[UIntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 60
[WClick]::mouse_event(0x04,0,0,0,[UIntPtr]::Zero) | Out-Null
Write-Host "clicked"
