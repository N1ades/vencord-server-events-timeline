param(
    [Parameter(Mandatory = $true)]
    [string]$VencordPath,
    [switch]$Inject
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $VencordPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $repo 'src\Vencord.ts'))) {
    throw 'VencordPath must point to a Vencord source checkout.'
}
$nodeVersion = & node.exe --version
if ($LASTEXITCODE -ne 0 -or [int]$nodeVersion.TrimStart('v').Split('.')[0] -lt 22) {
    throw 'Node.js 22 or newer is required.'
}

$source = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$target = [System.IO.Path]::GetFullPath((Join-Path $repo 'src\userplugins\serverEventsTimeline'))
$files = @('index.tsx', 'Timeline.tsx', 'core.ts', 'loader.ts', 'i18n.ts', 'settings.ts', 'style.css', 'LICENSE', 'README.md')
foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $file))) {
        throw "Missing plugin file: $file. Extract the complete repository before installing."
    }
}

if ($source -ne $target) {
    if (Test-Path -LiteralPath $target) {
        $backup = Join-Path $repo ('plugin-backups\ServerEventsTimeline-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        Copy-Item -LiteralPath $target -Destination $backup -Recurse
        Write-Host "Previous plugin backed up to $backup"
    }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    foreach ($file in $files) {
        Copy-Item -LiteralPath (Join-Path $source $file) -Destination (Join-Path $target $file) -Force
    }
}

Push-Location -LiteralPath $repo
try {
    if (-not (Test-Path -LiteralPath 'node_modules\esbuild')) {
        $package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
        if ($package.packageManager -notmatch '^pnpm@[0-9]+\.[0-9]+\.[0-9]+$') {
            throw 'Unsupported package manager. Install Vencord dependencies using its official source-build guide.'
        }
        & npx.cmd --yes $package.packageManager install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    & node.exe scripts/build/build.mjs --disable-updater
    if ($LASTEXITCODE -ne 0) { throw 'Vencord build failed.' }
    if ($Inject) {
        & node.exe scripts/runInstaller.mjs -- --install
        if ($LASTEXITCODE -ne 0) { throw 'Vencord installer failed.' }
    }
    Write-Host 'Build ready. Install this custom build, fully restart Discord, then enable ServerEventsTimeline in Vencord settings.'
} finally {
    Pop-Location
}
