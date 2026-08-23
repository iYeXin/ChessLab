# screenshot-window.ps1 - bring a process's main window to front and capture it.
# Usage: powershell -File screenshot-window.ps1 -ProcessName chessapp -OutFile shot.png

param(
    [Parameter(Mandatory=$true)][string]$ProcessName,
    [Parameter(Mandatory=$true)][string]$OutFile,
    [int]$WaitSeconds = 3
)

Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
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
[Win32]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null   # SW_RESTORE
[Win32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 600

$rect = New-Object Win32+RECT
[Win32]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) { Write-Error "bad window rect"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$g.Dispose()
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "saved $OutFile (${w}x${h})"
