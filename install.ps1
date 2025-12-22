Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Typora KaTeX Autocomplete Installer"

# --- Self elevation ---
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $currentPrincipal.IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
) {
    Write-Warning "Administrator privileges are required. Attempting to elevate..."
    $scriptPath = $MyInvocation.MyCommand.Definition
    Start-Process powershell `
        "-ExecutionPolicy Bypass -NoProfile -File `"$scriptPath`"" `
        -Verb RunAs
    exit
}

try {
    Write-Host "[1/6] Locating Typora root..." -ForegroundColor Yellow

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
    $rootDir = (Resolve-Path (Join-Path $scriptDir ".")).Path

    $windowHtml = Join-Path $rootDir "window.html"
    $windowHtmlBak = Join-Path $rootDir "window.html.katex.bak"

    if (!(Test-Path $windowHtml)) {
        throw "window.html not found. Please place this script in Typora root directory."
    }

    Write-Host "      -> Typora root: $rootDir"

    Write-Host "[2/6] Detecting Typora version..." -ForegroundColor Yellow

    $frameScript = ""
    if (Test-Path (Join-Path $rootDir "appsrc")) {
        $frameScript = '<script src="./appsrc/window/frame.js" defer="defer"></script>'
        Write-Host "      -> New Typora version detected."
    } elseif (Test-Path (Join-Path $rootDir "app")) {
        $frameScript = '<script src="./app/window/frame.js" defer="defer"></script>'
        Write-Host "      -> Old Typora version detected."
    } else {
        throw "Unable to determine Typora version."
    }

    Write-Host "[3/6] Preparing KaTeX Autocomplete injection..." -ForegroundColor Yellow

    $customDir = Join-Path $rootDir "Typora-KeTeX-helper"
    $pluginScript = '<script src="./Typora-KeTeX-helper/Typora-KeTeX-helper.js" defer="defer"></script>'

    if (!(Test-Path $customDir)) {
        Write-Host "      -> Creating Typora-KeTeX-helper directory."
        New-Item -ItemType Directory -Path $customDir | Out-Null
    }

    $content = Get-Content -Path $windowHtml -Raw -Encoding UTF8

    if ($content -match [Regex]::Escape($pluginScript)) {
        Write-Host "      -> KaTeX Autocomplete already installed." -ForegroundColor Green
        return
    }

    if (!($content -match [Regex]::Escape($frameScript))) {
        throw "Expected frame.js script tag not found."
    }

    Write-Host "[4/6] Backing up window.html..." -ForegroundColor Yellow
    Copy-Item $windowHtml $windowHtmlBak -Force

    Write-Host "[5/6] Injecting KaTeX Autocomplete script..." -ForegroundColor Yellow

    $replacement = $frameScript + "`n    " + $pluginScript
    $newContent = $content -replace [Regex]::Escape($frameScript), $replacement

    Set-Content -Path $windowHtml -Value $newContent -Encoding UTF8 -NoNewline

    Write-Host "[6/6] Done." -ForegroundColor Yellow

    Write-Host "`n✅ KaTeX Autocomplete injected successfully!" -ForegroundColor Green
    Write-Host "It will coexist safely with existing Typora plugins."
    Write-Host "Please restart Typora."

} catch {
    Write-Host "`n❌ Installation failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    Write-Host "`nPress any key to exit..."
    $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
}
