# Environment Switcher Script
# Usage: .\switch-env.ps1 [development|production]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("development", "production")]
    [string]$Environment
)

$ErrorActionPreference = "Stop"

# Color functions
function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

Write-Info "Switching to $Environment environment..."

# Define source and target paths
$sourceFile = "backend\.env.$Environment"
$targetFile = "backend\.env"

# Check if source environment file exists
if (-not (Test-Path $sourceFile)) {
    Write-Error "Environment file $sourceFile not found!"
    Write-Info "Available environment files:"
    Get-ChildItem backend\.env.* | ForEach-Object { Write-Host "  $($_.Name)" }
    exit 1
}

# Backup current .env if it exists
if (Test-Path $targetFile) {
    $backupFile = "backend\.env.backup"
    Copy-Item $targetFile $backupFile -Force
    Write-Info "Backed up current .env to .env.backup"
}

# Copy environment-specific file to .env
Copy-Item $sourceFile $targetFile -Force
Write-Success "Switched to $Environment environment"

# Show current configuration
Write-Info "Current environment configuration:"
$envContent = Get-Content $targetFile | Where-Object { $_ -match "^[A-Z]" -and $_ -notmatch "^#" } | Select-Object -First 5
$envContent | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

Write-Info ""
Write-Info "Environment switch complete! Restart your services with:"
Write-Info "  npm run dev"