# PowerShell Deployment Script for Windows
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("staging", "production")]
    [string]$Environment
)

$ErrorActionPreference = "Stop"

function Deploy-Staging {
    Write-Host "🚀 Deploying to STAGING..." -ForegroundColor Cyan
    
    # Ensure we're on dev branch
    $currentBranch = git branch --show-current
    if ($currentBranch -ne "dev") {
        Write-Host "⚠️  Switching to dev branch..." -ForegroundColor Yellow
        git checkout dev
    }
    
    # Pull latest changes
    Write-Host "📥 Pulling latest changes..." -ForegroundColor Gray
    git pull origin dev
    
    # Run tests
    Write-Host "🧪 Running tests..." -ForegroundColor Gray
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Tests failed! Aborting deployment." -ForegroundColor Red
        exit 1
    }
    
    # Check database schema
    Write-Host "🔍 Checking database schema..." -ForegroundColor Gray
    Push-Location backend
    npm run check:schema
    Pop-Location
    
    # Push to staging
    Write-Host "📤 Pushing to staging..." -ForegroundColor Gray
    git push origin dev
    
    Write-Host "✅ Staging deployment triggered!" -ForegroundColor Green
    Write-Host "🔗 Check: https://dev.conquestk.com" -ForegroundColor Cyan
    Write-Host "📊 Monitor: https://railway.app/dashboard" -ForegroundColor Gray
}

function Deploy-Production {
    Write-Host "🚀 Deploying to PRODUCTION..." -ForegroundColor Cyan
    Write-Host "⚠️  This will deploy to conquestk.com" -ForegroundColor Yellow
    
    $confirm = Read-Host "Are you sure? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "❌ Deployment cancelled" -ForegroundColor Red
        exit 0
    }
    
    # Ensure we're on main branch
    git checkout main
    git pull origin main
    
    # Check what's new
    Write-Host "📋 Changes to be deployed:" -ForegroundColor Gray
    git log main..dev --oneline
    
    $confirm2 = Read-Host "Proceed with these changes? (yes/no)"
    if ($confirm2 -ne "yes") {
        Write-Host "❌ Deployment cancelled" -ForegroundColor Red
        exit 0
    }
    
    # Merge from dev
    Write-Host "🔀 Merging from dev..." -ForegroundColor Gray
    git merge dev
    
    # Run production checks
    Write-Host "🧪 Running production checks..." -ForegroundColor Gray
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Tests failed! Aborting deployment." -ForegroundColor Red
        git reset --hard origin/main
        exit 1
    }
    
    # Build check
    Write-Host "🔨 Testing build..." -ForegroundColor Gray
    Push-Location backend
    npm run build
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed! Aborting deployment." -ForegroundColor Red
        git reset --hard origin/main
        exit 1
    }
    
    # Push to production
    Write-Host "📤 Pushing to production..." -ForegroundColor Gray
    git push origin main
    
    Write-Host "✅ Production deployment triggered!" -ForegroundColor Green
    Write-Host "🔗 Check: https://conquestk.com" -ForegroundColor Cyan
    Write-Host "📊 Monitor: https://railway.app/dashboard" -ForegroundColor Gray
    
    # Return to dev branch
    git checkout dev
}

# Main execution
switch ($Environment) {
    "staging" { Deploy-Staging }
    "production" { Deploy-Production }
}

Write-Host "
📝 Post-deployment checklist:
[ ] Check that the site loads
[ ] Test login functionality
[ ] Create/join a game room
[ ] Monitor logs for errors (5-10 minutes)
" -ForegroundColor DarkGray
