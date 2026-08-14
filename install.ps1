[CmdletBinding()]
param(
    [string]$DshHome = (Join-Path $env:USERPROFILE ".dsh")
)

$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$profileDir = Join-Path $DshHome "profiles\web"
$patchFile = Join-Path $profileDir "cordis.patch.yml"
$pluginDir = Join-Path $DshHome "plugins\dsh-reasoning-settings"

if (-not (Test-Path -LiteralPath (Join-Path $packageRoot "package.json") -PathType Leaf)) {
    throw "package.json is missing. Extract the complete plugin archive before installing."
}

if (-not (Test-Path -LiteralPath $profileDir -PathType Container)) {
    throw "DSH Web profile was not found at: $profileDir`nRun dsh web once, stop it, and run this installer again."
}

New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null

foreach ($fileName in @("package.json", "README.md", "README.zh-CN.md")) {
    $sourceFile = Join-Path $packageRoot $fileName
    if (Test-Path -LiteralPath $sourceFile -PathType Leaf) {
        Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $pluginDir $fileName) -Force
    }
}

$sourceLib = Join-Path $packageRoot "lib"
if (-not (Test-Path -LiteralPath $sourceLib -PathType Container)) {
    throw "The plugin lib directory is missing."
}

$targetLib = Join-Path $pluginDir "lib"
New-Item -ItemType Directory -Path $targetLib -Force | Out-Null
Copy-Item -Path (Join-Path $sourceLib "*") -Destination $targetLib -Recurse -Force

$pluginUri = "file:" + ($pluginDir -replace "\\", "/")
$pnpmCommand = Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue
if (-not $pnpmCommand) {
    $pnpmCommand = Get-Command "pnpm" -ErrorAction SilentlyContinue
}

if ($pnpmCommand) {
    & $pnpmCommand.Source --dir $profileDir add $pluginUri
} else {
    $corepackCommand = Get-Command "corepack.cmd" -ErrorAction SilentlyContinue
    if (-not $corepackCommand) {
        throw "pnpm was not found. Install pnpm, then run this installer again."
    }
    & $corepackCommand.Source pnpm --dir $profileDir add $pluginUri
}

if ($LASTEXITCODE -ne 0) {
    throw "pnpm could not add the plugin to the DSH Web profile."
}

$patchEntry = @"
- insert:
    - id: ui-settings-reasoning
      name: dsh-reasoning-settings
"@

if (Test-Path -LiteralPath $patchFile -PathType Leaf) {
    $patchContent = Get-Content -LiteralPath $patchFile -Raw -Encoding UTF8
    if ($patchContent -notmatch "(?m)^\s*name:\s*dsh-reasoning-settings\s*$") {
        Add-Content -LiteralPath $patchFile -Value $patchEntry -Encoding UTF8
    }
} else {
    Set-Content -LiteralPath $patchFile -Value $patchEntry -Encoding UTF8
}

Write-Host ""
Write-Host "DSH Reasoning Settings was installed successfully."
Write-Host "Restart dsh web, then open Settings > Reasoning Effort."
Write-Host "The default address is http://127.0.0.1:3080 unless a different port is specified."
