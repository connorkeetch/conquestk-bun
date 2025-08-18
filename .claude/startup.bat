@echo off
echo.
echo ===========================================
echo 🎮 Risk Game Project - Claude Code Startup
echo ===========================================
echo.

:: Check if CLAUDE.md exists
if exist "CLAUDE.md" (
    echo 📋 CLAUDE.md found
    echo.
    echo 🔍 Quick Project Summary:
    echo • Full-stack TypeScript Risk game with advanced map editor
    echo • Backend: Node.js + Express on port 5001
    echo • Frontend: React + Vite on port 5173
    echo • Database: SQLite with custom maps support
    echo • Map Editor: Interactive polygon territory drawing
) else (
    echo ⚠️ CLAUDE.md not found in current directory
)

echo.
echo 🔧 MCP Servers Available:
echo   • memory - Project context and troubleshooting
echo   • filesystem - File operations
echo   • github - Git operations
echo   • puppeteer - Browser automation
echo   • everything - Testing features
echo   • ide - VS Code integration

:: Check if we're in the right directory
if exist "package.json" (
    echo.
    echo ✅ In Risk Game project directory
    echo.
    echo 🚀 Common Commands:
    echo   npm run setup     - Check and configure environment
    echo   npm run dev       - Start both frontend and backend
    echo   npm test          - Run all tests
    echo   npm run lint      - Check code quality
    
    echo.
    echo 🔍 Checking Services:
    
    :: Check backend port
    netstat -an | findstr ":5001.*LISTENING" >nul 2>&1
    if %errorlevel% == 0 (
        echo ✅ Backend appears to be running on port 5001
    ) else (
        echo ❌ Backend not running on port 5001
    )
    
    :: Check frontend port
    netstat -an | findstr ":5173.*LISTENING" >nul 2>&1
    if %errorlevel% == 0 (
        echo ✅ Frontend appears to be running on port 5173
    ) else (
        echo ❌ Frontend not running on port 5173
    )
) else (
    echo.
    echo ⚠️ Not in a Node.js project directory (no package.json found)
)

echo.
echo 🧠 Memory Integration Available:
echo   Use memory search to find project context and troubleshooting tips
echo   Key entities: Risk Game Project, Map Editor System, Database Schema
echo.
echo 📖 For detailed info, check CLAUDE.md or use memory search
echo ===========================================
echo.