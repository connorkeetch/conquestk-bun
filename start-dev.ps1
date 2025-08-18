# Risk Game Development Startup Script
# This script sets up and starts the development environment

param(
    [switch]$SkipSetup,
    [switch]$Frontend,
    [switch]$Backend,
    [switch]$Verbose
)

# Set error action preference
$ErrorActionPreference = "Continue"

# Color functions
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Success { param([string]$Message) Write-ColorOutput "[SUCCESS] $Message" "Green" }
function Write-Warning { param([string]$Message) Write-ColorOutput "[WARNING] $Message" "Yellow" }
function Write-Error { param([string]$Message) Write-ColorOutput "[ERROR] $Message" "Red" }
function Write-Info { param([string]$Message) Write-ColorOutput "[INFO] $Message" "Cyan" }

# Header
Write-ColorOutput "`nRisk Game Development Environment" "Magenta"
Write-ColorOutput "====================================" "Magenta"

# Check PowerShell version
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Error "PowerShell 5.0 or higher is required"
    exit 1
}

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Error "Not in the Risk game root directory. Please run from the project root."
    exit 1
}

# Run setup check unless skipped
if (-not $SkipSetup) {
    Write-Info "Running setup check..."
    
    try {
        $setupResult = & node setup-check.js
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Setup check found issues. Continuing anyway..."
            if ($Verbose) {
                Write-Host $setupResult
            }
        } else {
            Write-Success "Setup check passed"
        }
    } catch {
        Write-Warning "Could not run setup check: $_"
        Write-Info "Continuing with startup..."
    }
} else {
    Write-Info "Skipping setup check..."
}

# Function to check if a port is in use
function Test-Port {
    param([int]$Port)
    
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        $listener.Stop()
        return $false  # Port is available
    } catch {
        return $true   # Port is in use
    }
}

# Check if required ports are available
$backendPort = 5000
$frontendPort = 5173  # Vite default

if (Test-Port $backendPort) {
    Write-Warning "Port $backendPort is already in use (backend)"
    Write-Info "The backend might already be running, or another service is using this port"
}

if (Test-Port $frontendPort) {
    Write-Warning "Port $frontendPort is already in use (frontend)"
    Write-Info "The frontend might already be running, or another service is using this port"
}

# Function to start a service in a new window
function Start-Service {
    param(
        [string]$Name,
        [string]$Command,
        [string]$WorkingDirectory,
        [string]$WindowTitle
    )
    
    Write-Info "Starting $Name..."
    
    try {
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = "powershell.exe"
        $startInfo.Arguments = '-NoExit -Command "cd ' + "'$WorkingDirectory'; $Command" + '"'
        $startInfo.WorkingDirectory = $WorkingDirectory
        $startInfo.UseShellExecute = $true
        $startInfo.WindowStyle = "Normal"
        
        $process = [System.Diagnostics.Process]::Start($startInfo)
        
        if ($process) {
            Write-Success "$Name started (PID: $($process.Id))"
            return $process
        } else {
            Write-Error "Failed to start $Name"
            return $null
        }
    } catch {
        Write-Error "Error starting $Name`: $_"
        return $null
    }
}

# Determine what to start
$startFrontend = $true
$startBackend = $true

if ($Frontend -and -not $Backend) {
    $startBackend = $false
    Write-Info "Starting frontend only"
} elseif ($Backend -and -not $Frontend) {
    $startFrontend = $false
    Write-Info "Starting backend only"
} else {
    Write-Info "Starting both frontend and backend"
}

# Store process references
$processes = @()

# Start backend
if ($startBackend) {
    Write-Info "Preparing backend..."
    
    # Check if backend dependencies are installed
    if (-not (Test-Path "backend\node_modules")) {
        Write-Warning "Backend dependencies not found. Installing..."
        try {
            Set-Location "backend"
            & npm install
            Set-Location ".."
            Write-Success "Backend dependencies installed"
        } catch {
            Write-Error "Failed to install backend dependencies: $_"
            Set-Location ".."
        }
    }
    
    $backendProcess = Start-Service -Name "Backend Server" -Command "npm run dev" -WorkingDirectory "$PWD\backend" -WindowTitle "Risk Game - Backend"
    if ($backendProcess) {
        $processes += $backendProcess
        Write-Info "Backend will be available at: http://localhost:$backendPort"
        
        # Give backend time to start
        Write-Info "Waiting for backend to initialize..."
        Start-Sleep -Seconds 3
    }
}

# Start frontend
if ($startFrontend) {
    Write-Info "Preparing frontend..."
    
    # Check if frontend dependencies are installed
    if (-not (Test-Path "frontend\node_modules")) {
        Write-Warning "Frontend dependencies not found. Installing..."
        try {
            Set-Location "frontend"
            & npm install
            Set-Location ".."
            Write-Success "Frontend dependencies installed"
        } catch {
            Write-Error "Failed to install frontend dependencies: $_"
            Set-Location ".."
        }
    }
    
    $frontendProcess = Start-Service -Name "Frontend Server" -Command "npm run dev" -WorkingDirectory "$PWD\frontend" -WindowTitle "Risk Game - Frontend"
    if ($frontendProcess) {
        $processes += $frontendProcess
        Write-Info "Frontend will be available at: http://localhost:$frontendPort"
    }
}

# Summary
Write-ColorOutput "`nDevelopment Environment Started!" "Green"
Write-ColorOutput "=================================" "Green"

if ($startBackend) {
    Write-Info "Backend API: http://localhost:$backendPort"
    Write-Info "Backend Logs: Check backend console window"
}

if ($startFrontend) {
    Write-Info "Frontend App: http://localhost:$frontendPort"
    Write-Info "Frontend Logs: Check frontend console window"
}

Write-ColorOutput "`nUseful Commands:" "Yellow"
Write-Info "• To stop services: Close the console windows or press Ctrl+C in them"
Write-Info "• To restart: Run this script again"
Write-Info "• To check setup: npm run setup"
Write-Info "• To start only frontend: .\start-dev.ps1 -Frontend"
Write-Info "• To start only backend: .\start-dev.ps1 -Backend"

Write-ColorOutput "`nHappy Coding!" "Magenta"

# Keep script running to monitor processes
if ($processes.Count -gt 0) {
    Write-Info "`nMonitoring services... Press Ctrl+C to exit this monitor (services will keep running)"
    
    try {
        while ($true) {
            Start-Sleep -Seconds 30
            
            # Check if processes are still running
            $runningCount = 0
            foreach ($process in $processes) {
                if (-not $process.HasExited) {
                    $runningCount++
                }
            }
            
            if ($runningCount -eq 0) {
                Write-Warning "All services have stopped"
                break
            }
        }
    } catch {
        Write-Info "Monitor stopped"
    }
} else {
    Write-Warning "No services were started successfully"
    exit 1
}