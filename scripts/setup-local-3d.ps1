param(
    [string]$RuntimeRoot = 'D:\HeritageFoundry3D',
    [string]$PythonVersion = '3.10'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoPath = Join-Path $RuntimeRoot 'TripoSR'
$venvPath = Join-Path $RuntimeRoot '.venv'
$pythonPath = Join-Path $venvPath 'Scripts\python.exe'
$modelPath = Join-Path $RuntimeRoot 'models\TripoSR'
$env:UV_CACHE_DIR = Join-Path $RuntimeRoot 'uv-cache'
$env:HF_HOME = Join-Path $RuntimeRoot 'huggingface'

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw 'uv is required. Install uv before setting up the local 3D runtime.'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is required to clone the official TripoSR repository.'
}
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    throw 'curl.exe is required to download the public TripoSR checkpoint.'
}

New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
$repoRevision = '107cefdc244c39106fa830359024f6a2f1c78871'
if (-not (Test-Path (Join-Path $repoPath 'tsr\system.py'))) {
    git clone --filter=blob:none --no-checkout https://github.com/VAST-AI-Research/TripoSR.git $repoPath
    if ($LASTEXITCODE -ne 0) { throw 'Failed to clone the official TripoSR repository.' }
}
$currentRevision = [string](& git -C $repoPath rev-parse HEAD 2>$null)
$currentRevision = $currentRevision.Trim()
if ($LASTEXITCODE -ne 0 -or $currentRevision -ne $repoRevision) {
    & git -C $repoPath fetch --depth 1 origin $repoRevision
    if ($LASTEXITCODE -ne 0) { throw 'Failed to fetch the pinned TripoSR revision.' }
    & git -C $repoPath checkout --detach $repoRevision
    if ($LASTEXITCODE -ne 0) { throw 'Failed to check out the pinned TripoSR revision.' }
}

if (-not (Test-Path $pythonPath)) {
    uv venv $venvPath --python $PythonVersion
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create the local 3D Python environment.' }
}

uv pip install --python $pythonPath torch==2.5.1 torchvision==0.20.1 `
    --index-url https://download.pytorch.org/whl/cu124
if ($LASTEXITCODE -ne 0) { throw 'Failed to install the CUDA PyTorch runtime.' }
uv pip install --python $pythonPath -r (Join-Path $projectRoot 'sidecar\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Failed to install local 3D sidecar dependencies.' }

$dinoConfigCode = @"
from huggingface_hub import hf_hub_download
hf_hub_download(
    repo_id='facebook/dino-vitb16',
    filename='config.json',
    revision='f205d5d8e640a89a2b8ef0369670dfc37cc07fc2',
)
"@
$dinoConfigCode | & $pythonPath -
if ($LASTEXITCODE -ne 0) { throw 'Failed to cache the pinned DINO image encoder config.' }

New-Item -ItemType Directory -Path $modelPath -Force | Out-Null
$modelRevision = '5b521936b01fbe1890f6f9baed0254ab6351c04a'

function Get-PublicModelFile {
    param(
        [string]$Name,
        [long]$ExpectedBytes,
        [string]$ExpectedSha256
    )

    $destination = Join-Path $modelPath $Name
    if (Test-Path -LiteralPath $destination) {
        $currentBytes = (Get-Item -LiteralPath $destination).Length
        if ($currentBytes -eq $ExpectedBytes) {
            $currentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
            if ($currentHash -eq $ExpectedSha256) {
                return
            }
            Remove-Item -LiteralPath $destination -Force
        }
        if ($currentBytes -gt $ExpectedBytes) {
            Remove-Item -LiteralPath $destination -Force
        }
    }

    $url = "https://huggingface.co/stabilityai/TripoSR/resolve/$modelRevision/$Name"
    & curl.exe --location --fail --retry 5 --retry-all-errors `
        --continue-at - --output $destination $url
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to download $Name from the official TripoSR model repository."
    }

    $actualBytes = (Get-Item -LiteralPath $destination).Length
    if ($actualBytes -ne $ExpectedBytes) {
        throw "Downloaded $Name has $actualBytes bytes; expected $ExpectedBytes. Re-run setup to resume."
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
    if ($actualHash -ne $ExpectedSha256) {
        Remove-Item -LiteralPath $destination -Force
        throw "Downloaded $Name failed SHA-256 verification. Re-run setup to download it again."
    }
}

Get-PublicModelFile -Name 'config.yaml' -ExpectedBytes 987 `
    -ExpectedSha256 '74ca708ce086bf68e97709ea6b3d91f14717921c04691e84043f0eb8fcc68e62'
Get-PublicModelFile -Name 'model.ckpt' -ExpectedBytes 1677246742 `
    -ExpectedSha256 '429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee'

& $pythonPath -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('Torch:', torch.__version__)"
if ($LASTEXITCODE -ne 0) { throw 'The local 3D Python runtime validation failed.' }
Write-Host "Local 3D runtime ready at $RuntimeRoot"
