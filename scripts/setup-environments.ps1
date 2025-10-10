# Railway Environment Setup Script
# This script helps set up branch-based deployments on Railway

Write-Host "Railway Environment Setup" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan

# Function to create and switch branches
function Setup-GitBranches {
    Write-Host "`n📌 Setting up Git branches..." -ForegroundColor Yellow
    
    # Check if dev branch exists
    $devBranchExists = git branch -r | Select-String "origin/dev"
    
    if (-not $devBranchExists) {
        Write-Host "Creating 'dev' branch..." -ForegroundColor Green
        git checkout -b dev
        git push -u origin dev
        Write-Host "✅ Dev branch created and pushed" -ForegroundColor Green
    } else {
        Write-Host "✅ Dev branch already exists" -ForegroundColor Green
    }
    
    # Switch back to main
    git checkout main
}

# Function to set up environment files
function Setup-EnvironmentFiles {
    Write-Host "`n📁 Setting up environment files..." -ForegroundColor Yellow
    
    # Create .env.local for local development (Postgres + Redis on localhost)
    $localEnvPath = "backend\.env.local"
    if (-not (Test-Path $localEnvPath)) {
        @"
# Local Development Environment
# This file is for local development only - not committed to git
NODE_ENV=development
PORT=5001

# Frontend URLs
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

# Local PostgreSQL
DATABASE_URL=postgresql://postgres:localpassword123@127.0.0.1:5432/conquestk_local

# Development Secrets (use strong values locally)
JWT_SECRET=local-dev-jwt-secret-change-in-production
SESSION_SECRET=local-dev-session-secret-change-in-production
JWT_EXPIRES_IN=7d

# Local Redis
REDIS_URL=redis://127.0.0.1:6379

# Optional Services (disabled for local dev)
EMAIL_ENABLED=false
REQUIRE_EMAIL_VERIFICATION=false

# Logging
LOG_LEVEL=debug
"@ | Out-File -FilePath $localEnvPath -Encoding UTF8
        Write-Host "✅ Created backend\.env.local" -ForegroundColor Green
    }
    
    # Update .gitignore
    $gitignorePath = ".gitignore"
    $gitignoreContent = Get-Content $gitignorePath -Raw
    if ($gitignoreContent -notmatch "\.env\.local") {
        Add-Content $gitignorePath "`n# Local environment files`n.env.local`n*.env.local"
        Write-Host "✅ Updated .gitignore" -ForegroundColor Green
    }
}

# Function to create Railway setup instructions
function Show-RailwayInstructions {
    Write-Host "`n🚂 Railway Setup Instructions" -ForegroundColor Cyan
    Write-Host "=============================" -ForegroundColor Cyan
    
    Write-Host "`n1️⃣ In Railway Dashboard:" -ForegroundColor Yellow
    Write-Host "   a) Go to your project settings"
    Write-Host "   b) Under 'Deployments', enable 'Branch Deployments'"
    Write-Host "   c) Add 'dev' branch to auto-deploy list"
    
    Write-Host "`n2️⃣ Create separate services:" -ForegroundColor Yellow
    Write-Host "   Production Service:"
    Write-Host "   - Name: conquestk-prod"
    Write-Host "   - Branch: main"
    Write-Host "   - Domain: conquestk.com"
    
    Write-Host "`n   Development Service:"
    Write-Host "   - Name: conquestk-dev"
    Write-Host "   - Branch: dev"
    Write-Host "   - Domain: dev.conquestk.com (or use Railway's generated domain)"
    
    Write-Host "`n3️⃣ Environment Variables in Railway:" -ForegroundColor Yellow
    Write-Host "   For PRODUCTION service, set:"
    Write-Host "   - DATABASE_URL (production database)"
    Write-Host "   - REDIS_URL (if using Redis)"
    Write-Host "   - RESEND_API_KEY"
    Write-Host "   - JWT_SECRET (strong, unique)"
    Write-Host "   - SESSION_SECRET (strong, unique)"
    
    Write-Host "`n   For DEVELOPMENT service, set:"
    Write-Host "   - DATABASE_URL (your dev database, or use local/WSL)"
    Write-Host "   - JWT_SECRET (different from prod)"
    Write-Host "   - SESSION_SECRET (different from prod)"
    
    Write-Host "`n4️⃣ Local Development:" -ForegroundColor Yellow
    Write-Host "   Use: npm run dev:local"
    Write-Host "   This will use backend\.env.local with the dev database"
}

# Function to create npm scripts
function Setup-NpmScripts {
    Write-Host "`n📦 Updating npm scripts..." -ForegroundColor Yellow
    
    $packageJsonPath = "package.json"
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    
    # Add new scripts
    $packageJson.scripts | Add-Member -MemberType NoteProperty -Name "dev:local" -Value "cross-env ENV_FILE=.env.local npm run dev" -Force
    $packageJson.scripts | Add-Member -MemberType NoteProperty -Name "dev:branch" -Value "git checkout dev && git pull && npm run dev" -Force
    $packageJson.scripts | Add-Member -MemberType NoteProperty -Name "deploy:dev" -Value "git checkout dev && git merge main && git push && git checkout main" -Force
    $packageJson.scripts | Add-Member -MemberType NoteProperty -Name "deploy:prod" -Value "git checkout main && git push" -Force
    
    $packageJson | ConvertTo-Json -Depth 10 | Out-File $packageJsonPath -Encoding UTF8
    Write-Host "✅ Updated package.json scripts" -ForegroundColor Green
}

# Main execution
Write-Host "`n🚀 Starting setup..." -ForegroundColor Green

Setup-GitBranches
Setup-EnvironmentFiles
Setup-NpmScripts
Show-RailwayInstructions

Write-Host "`n✅ Setup complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Copy backend\.env.local to backend\.env for local development"
Write-Host "2. Run 'npm run dev:local' to start with local env"
Write-Host "3. Configure Railway as shown above"
Write-Host "4. Use 'npm run deploy:dev' to deploy to dev environment"
Write-Host "5. Use 'npm run deploy:prod' to deploy to production"
