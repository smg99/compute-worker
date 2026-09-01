$ErrorActionPreference = 'Stop'

$Version = if ($env:COMPUTE_WORKER_RELEASE_VERSION) { $env:COMPUTE_WORKER_RELEASE_VERSION } else { 'v0.2.4' }
$Base = if ($env:COMPUTE_WORKER_RELEASE_BASE_URL) { $env:COMPUTE_WORKER_RELEASE_BASE_URL } else { "https://github.com/smg99/compute-worker/releases/download/$Version" }
$ControlPlane = $env:COMPUTE_WORKER_CONTROL_PLANE_URL
if (-not $ControlPlane) { throw 'COMPUTE_WORKER_CONTROL_PLANE_URL is required.' }

$Dir = Join-Path $HOME '.compute-worker'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$Artifact = 'compute-worker-win32-x64.exe'
$Target = Join-Path $Dir 'compute-worker.exe'
$Checksums = Join-Path $Dir 'SHA256SUMS'
Invoke-WebRequest -Uri "$Base/SHA256SUMS" -OutFile "$Checksums.tmp"
Move-Item -Force "$Checksums.tmp" $Checksums
Invoke-WebRequest -Uri "$Base/$Artifact" -OutFile "$Target.tmp"
$Expected = ((Get-Content $Checksums | Where-Object { $_ -match "^[0-9a-fA-F]{64}\s+$([regex]::Escape($Artifact))$" }) -split '\s+')[0]
if ($Expected -notmatch '^[0-9a-fA-F]{64}$') { Remove-Item -Force "$Target.tmp"; throw "No valid checksum for $Artifact" }
$Actual = (Get-FileHash -Algorithm SHA256 -Path "$Target.tmp").Hash
if ($Actual -ine $Expected) { Remove-Item -Force "$Target.tmp"; throw "Checksum verification failed for $Artifact" }
Write-Host "Checksum verified for $Artifact."
Move-Item -Force "$Target.tmp" $Target

$EnvFile = Join-Path $Dir 'worker.env'
"CONTROL_PLANE_URL=$ControlPlane`nWORKER_STATE_DIR=$Dir" | Set-Content -Path $EnvFile -Encoding UTF8

$Action = New-ScheduledTaskAction -Execute $Target
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Compute Worker' -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null
Start-ScheduledTask -TaskName 'Compute Worker'
Write-Host "Installed Compute Worker $Version to $Target."
Write-Host 'The worker daemon starts at logon; compute remains gated by local consent and an explicit product request.'
