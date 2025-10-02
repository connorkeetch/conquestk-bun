# PowerShell Rollback Script for Emergency Situations
param(
    [Parameter(Mandatory=$false)]
    [string]$CommitHash,
    
    [Parameter(Mandatory=$false)]
    [switch]$LastKnownGood
)

$ErrorActionPreference = "Stop"

# Color functions
function Write-Emergency { param([string]$Message) Write-Host "[EMERGENCY] $Message" -ForegroundColor Red -BackgroundColor Yellow }
function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }

Write-Emergency "EMERGENCY ROLLBACK PROCEDURE INITIATED"
Write-Warning "This will rollback production to a previous state"

# Get current branch
$currentBranch = git branch --show-current
if ($currentBranch -ne "main") {
    Write-Warning "Not on main branch. Switching..."
    git checkout main
}

# Pull latest to ensure we have all commits
git pull origin main

if ($LastKnownGood) {
    Write-Info "Finding last known good deployment..."
    
    # Find last successful deployment tag
    $lastGoodTag = git tag -l "deploy-*" | Sort-Object -Descending | Select-Object -First 1
    
    if ($lastGoodTag) {
        $CommitHash = git rev-list -n 1 $lastGoodTag
        Write-Info "Last known good deployment: $lastGoodTag ($CommitHash)"
    }
    else {
        Write-Emergency "No deployment tags found! Specify a commit hash manually."
        exit 1
    }
}

if (-not $CommitHash) {
    Write-Info "Recent commits:"
    git log --oneline -10
    
    $CommitHash = Read-Host "Enter the commit hash to rollback to"
}

# Verify commit exists
$commitExists = git cat-file -e $CommitHash 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Emergency "Commit $CommitHash not found!"
    exit 1
}

# Show what will be rolled back
Write-Warning "Rolling back to commit:"
git show --oneline -s $CommitHash

Write-Info "Changes that will be reverted:"
git log --oneline $CommitHash..HEAD

$confirm = Read-Host "Are you SURE you want to rollback production? (type 'ROLLBACK' to confirm)"
if ($confirm -ne "ROLLBACK") {
    Write-Info "Rollback cancelled"
    exit 0
}

# Create backup branch
$backupBranch = "backup/rollback-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Info "Creating backup branch: $backupBranch"
git branch $backupBranch

# Perform the rollback
Write-Emergency "Performing rollback..."

try {
    # Option 1: Reset (destructive but clean)
    git reset --hard $CommitHash
    
    # Force push to production
    Write-Emergency "Force pushing to production..."
    git push --force origin main
    
    Write-Success "Rollback completed successfully!"
    Write-Info "Production has been rolled back to commit: $CommitHash"
    Write-Info "Backup of previous state saved in branch: $backupBranch"
    
    # Tag the rollback
    $rollbackTag = "rollback-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    git tag -a $rollbackTag -m "Emergency rollback to $CommitHash"
    git push origin $rollbackTag
    
    Write-Info ""
    Write-Info "Post-rollback checklist:"
    Write-Info "[ ] Check https://conquestk.com is accessible"
    Write-Info "[ ] Verify core functionality works"
    Write-Info "[ ] Monitor error logs for 10 minutes"
    Write-Info "[ ] Notify team of rollback"
    Write-Info "[ ] Create incident report"
}
catch {
    Write-Emergency "Rollback failed!"
    Write-Emergency $_.Exception.Message
    Write-Info "Attempting to restore from backup branch..."
    git checkout $backupBranch
    git branch -D main
    git checkout -b main
    git push --force origin main
    exit 1
}