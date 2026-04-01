# start-tv.ps1 — Launch Edge in kiosk-like mode with the dashboard extension loaded.
#
# USAGE:
#   1. Copy the "extension" folder to the TV PC (e.g., C:\tv-dashboard\extension)
#   2. Copy this script next to it       (e.g., C:\tv-dashboard\start-tv.ps1)
#   3. Right-click this script -> "Run with PowerShell"
#
# Or from a PowerShell prompt:
#   powershell -ExecutionPolicy Bypass -File C:\tv-dashboard\start-tv.ps1

$extensionPath = Join-Path $PSScriptRoot "extension"

# Kill any existing Edge instances so we get a clean start
Stop-Process -Name msedge -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Launch Edge with the extension loaded
# --load-extension   : sideloads our unpacked extension
# --start-fullscreen : TV display mode
# --no-first-run     : skip welcome screens
# --disable-session-crashed-bubble : no "restore pages?" prompt
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
    --load-extension="$extensionPath" `
    --start-fullscreen `
    --no-first-run `
    --disable-session-crashed-bubble `
    --disable-infobars `
    "about:blank"
