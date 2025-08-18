# Claude Code Startup Script for Risk Game Project
# This script runs when Claude Code starts to provide helpful context

Write-Host "🎮 Risk Game Project - Claude Code Startup" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Check if CLAUDE.md exists and is recent
if (Test-Path "CLAUDE.md") {
    $lastModified = (Get-Item "CLAUDE.md").LastWriteTime
    $daysSince = (Get-Date) - $lastModified
    Write-Host "📋 CLAUDE.md found (last updated $($daysSince.Days) days ago)" -ForegroundColor Cyan
    
    # Show key project info from CLAUDE.md
    Write-Host "`n🔍 Quick Project Summary:" -ForegroundColor Yellow
    Write-Host "• Full-stack TypeScript Risk game with advanced map editor" -ForegroundColor White
    Write-Host "• Backend: Node.js + Express on port 5001" -ForegroundColor White
    Write-Host "• Frontend: React + Vite on port 5173" -ForegroundColor White
    Write-Host "• Database: SQLite with custom maps support" -ForegroundColor White
    Write-Host "• Map Editor: Interactive polygon territory drawing" -ForegroundColor White
} else {
    Write-Host "⚠️ CLAUDE.md not found in current directory" -ForegroundColor Red
}

# Check MCP servers status
Write-Host "`n🔧 MCP Servers Available:" -ForegroundColor Yellow
Write-Host "  • memory - Project context and troubleshooting" -ForegroundColor White
Write-Host "  • filesystem - File operations" -ForegroundColor White  
Write-Host "  • github - Git operations" -ForegroundColor White
Write-Host "  • puppeteer - Browser automation" -ForegroundColor White
Write-Host "  • everything - Testing features" -ForegroundColor White
Write-Host "  • ide - VS Code integration" -ForegroundColor White

# Check if we're in the right directory
if (Test-Path "package.json") {
    try {
        $packageJson = Get-Content "package.json" | ConvertFrom-Json
        $isRiskProject = $false
        
        if ($packageJson.name) {
            if ($packageJson.name -like "*risk*") {
                $isRiskProject = $true
            }
        }
        
        if ($packageJson.scripts -and $packageJson.scripts.dev) {
            $isRiskProject = $true
        }
        
        if ($isRiskProject) {
            Write-Host "`n✅ In Risk Game project directory" -ForegroundColor Green
            
            # Show common commands
            Write-Host "`n🚀 Common Commands:" -ForegroundColor Yellow
            Write-Host "  npm run setup     - Check and configure environment" -ForegroundColor White
            Write-Host "  npm run dev       - Start both frontend and backend" -ForegroundColor White
            Write-Host "  npm test          - Run all tests" -ForegroundColor White
            Write-Host "  npm run lint      - Check code quality" -ForegroundColor White
            
            # Check if services are running
            Write-Host "`n🔍 Checking Services:" -ForegroundColor Yellow
            
            # Check backend port
            $backendCheck = netstat -an 2>$null | Select-String ":5001.*LISTENING"
            if ($backendCheck) {
                Write-Host "✅ Backend appears to be running on port 5001" -ForegroundColor Green
            } else {
                Write-Host "❌ Backend not running on port 5001" -ForegroundColor Red
            }
            
            # Check frontend port  
            $frontendCheck = netstat -an 2>$null | Select-String ":5173.*LISTENING"
            if ($frontendCheck) {
                Write-Host "✅ Frontend appears to be running on port 5173" -ForegroundColor Green
            } else {
                Write-Host "❌ Frontend not running on port 5173" -ForegroundColor Red
            }
        } else {
            Write-Host "`n⚠️ Not in Risk Game project directory" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "`n⚠️ Could not parse package.json" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n⚠️ Not in a Node.js project directory (no package.json found)" -ForegroundColor Yellow
}

# Memory integration suggestion
Write-Host "`n🧠 Memory Integration Available:" -ForegroundColor Yellow
Write-Host "  Use memory search to find project context and troubleshooting tips" -ForegroundColor White
Write-Host "  Key entities: Risk Game Project, Map Editor System, Database Schema" -ForegroundColor White

Write-Host "`n📖 For detailed info, check CLAUDE.md or use memory search" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Green