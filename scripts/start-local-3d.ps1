param(
    [string]$RuntimeRoot = 'D:\HeritageFoundry3D',
    [int]$Port = 7861,
    [switch]$Background
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonPath = Join-Path $RuntimeRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $pythonPath)) {
    throw 'Local 3D runtime is missing. Run scripts/setup-local-3d.ps1 first.'
}

$env:HF_HOME = Join-Path $RuntimeRoot 'huggingface'
$env:TRIPOSR_REPO_PATH = Join-Path $RuntimeRoot 'TripoSR'
$env:TRIPOSR_MODEL_ID = Join-Path $RuntimeRoot 'models\TripoSR'
$env:TRIPOSR_ARTIFACT_DIR = Join-Path $RuntimeRoot 'artifacts'
$env:TRIPOSR_DEVICE = if ($env:TRIPOSR_DEVICE) { $env:TRIPOSR_DEVICE } else { 'cuda:0' }
$env:TRIPOSR_CHUNK_SIZE = if ($env:TRIPOSR_CHUNK_SIZE) { $env:TRIPOSR_CHUNK_SIZE } else { '4096' }
$env:TRIPOSR_MC_RESOLUTION = if ($env:TRIPOSR_MC_RESOLUTION) { $env:TRIPOSR_MC_RESOLUTION } else { '160' }
$env:TRIPOSR_TARGET_HEIGHT_M = if ($env:TRIPOSR_TARGET_HEIGHT_M) { $env:TRIPOSR_TARGET_HEIGHT_M } else { '0.18' }
$env:PYTHONPATH = "$projectRoot;$projectRoot\sidecar;$env:TRIPOSR_REPO_PATH"

if (-not $env:LOCAL_3D_API_KEY) {
    $envFile = Join-Path $projectRoot '.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^LOCAL_3D_API_KEY=' } | Select-Object -First 1
        if ($line) { $env:LOCAL_3D_API_KEY = ($line -replace '^LOCAL_3D_API_KEY=', '').Trim() }
    }
}

$arguments = @(
    '-m', 'uvicorn',
    'sidecar.triposr_sidecar.main:app',
    '--host', '127.0.0.1',
    '--port', [string]$Port
)

if ($Background) {
    $logDir = Join-Path $RuntimeRoot 'logs'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $process = Start-Process -FilePath $pythonPath -ArgumentList $arguments `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDir 'sidecar.out.log') `
        -RedirectStandardError (Join-Path $logDir 'sidecar.err.log')
    Write-Host "Local 3D sidecar started with PID $($process.Id)"
    exit 0
}

& $pythonPath @arguments
