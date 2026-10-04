# screenshot-window.ps1 - bring a process's main window to front and capture it.
# Usage: powershell -File screenshot-window.ps1 -ProcessName chessnext -OutFile shot.png

param(
    [Parameter(Mandatory=$true)][string]$ProcessName,
    [Parameter(Mandatory=$true)][string]$OutFile,
    [int]$WaitSeconds = 3
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$deadline = (Get-Date).AddSeconds(30)
$proc = $null
while ((Get-Date) -lt $deadline -and -not $proc) {
    $proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if (-not $proc) { Start-Sleep -Milliseconds 500 }
}
if (-not $proc) { Write-Error "window for '$ProcessName' not found"; exit 1 }

Start-Sleep -Seconds $WaitSeconds

$rect = New-Object Win32+RECT
[Win32]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
# Handle 150%/125% system scaling: GetWindowRect returns logical size, but PrintWindow renders at physical.
$dpi = 96
try { $d = [Win32]::GetDpiForWindow($proc.MainWindowHandle); if ($d -gt 0) { $dpi = $d } } catch {}
if ($dpi -ne 96) {
  $scale = $dpi / 96
  $w = [int]($w * $scale)
  $h = [int]($h * $scale)
}
if ($w -le 0 -or $h -le 0) { Write-Error "bad window rect"; exit 1 }

# PrintWindow (PW_RENDERFULLCONTENT) reads the window's own surface —
# reliable even when the window is not foreground (WebView2/DirectComposition).
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[Win32]::PrintWindow($proc.MainWindowHandle, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$g.Dispose()
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "saved $OutFile (${w}x${h})"
