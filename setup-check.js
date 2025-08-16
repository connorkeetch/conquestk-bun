const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SetupChecker {
  constructor() {
    this.issues = [];
    this.fixes = [];
    this.status = {
      nodeModules: { frontend: false, backend: false },
      database: { type: null, available: false },
      envFiles: { frontend: false, backend: false },
      dependencies: { node: false, npm: false }
    };
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // cyan
      success: '\x1b[32m', // green
      warning: '\x1b[33m', // yellow
      error: '\x1b[31m',   // red
      reset: '\x1b[0m'
    };
    console.log(`${colors[type]}${message}${colors.reset}`);
  }

  async checkDependencies() {
    this.log('\n🔍 Checking system dependencies...', 'info');
    
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      this.log(`✓ Node.js: ${nodeVersion}`, 'success');
      this.status.dependencies.node = true;
    } catch (error) {
      this.log('✗ Node.js not found', 'error');
      this.issues.push('Node.js is not installed or not in PATH');
    }

    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      this.log(`✓ npm: ${npmVersion}`, 'success');
      this.status.dependencies.npm = true;
    } catch (error) {
      this.log('✗ npm not found', 'error');
      this.issues.push('npm is not installed or not in PATH');
    }
  }

  async checkNodeModules() {
    this.log('\n📦 Checking node_modules...', 'info');
    
    const frontendNodeModules = path.join(__dirname, 'frontend', 'node_modules');
    const backendNodeModules = path.join(__dirname, 'backend', 'node_modules');

    this.status.nodeModules.frontend = fs.existsSync(frontendNodeModules);
    this.status.nodeModules.backend = fs.existsSync(backendNodeModules);

    if (this.status.nodeModules.frontend) {
      this.log('✓ Frontend node_modules exists', 'success');
    } else {
      this.log('✗ Frontend node_modules missing', 'warning');
      this.fixes.push('npm install in frontend directory');
    }

    if (this.status.nodeModules.backend) {
      this.log('✓ Backend node_modules exists', 'success');
    } else {
      this.log('✗ Backend node_modules missing', 'warning');
      this.fixes.push('npm install in backend directory');
    }
  }

  async checkDatabase() {
    this.log('\n🗄️  Checking database availability...', 'info');
    
    // Check PostgreSQL
    try {
      execSync('psql --version', { encoding: 'utf8', stdio: 'pipe' });
      this.log('✓ PostgreSQL found', 'success');
      this.status.database.type = 'postgresql';
      this.status.database.available = true;
      
      // Test connection
      try {
        execSync('pg_isready', { encoding: 'utf8', stdio: 'pipe' });
        this.log('✓ PostgreSQL server is running', 'success');
      } catch (error) {
        this.log('⚠ PostgreSQL installed but server not running', 'warning');
        this.fixes.push('Start PostgreSQL service');
      }
    } catch (error) {
      this.log('✗ PostgreSQL not found, will use SQLite', 'warning');
      this.status.database.type = 'sqlite';
      this.status.database.available = true;
      this.fixes.push('Configured to use SQLite database');
    }
  }

  async checkEnvFiles() {
    this.log('\n⚙️  Checking environment files...', 'info');
    
    const frontendEnv = path.join(__dirname, 'frontend', '.env');
    const backendEnv = path.join(__dirname, 'backend', '.env');

    this.status.envFiles.frontend = fs.existsSync(frontendEnv);
    this.status.envFiles.backend = fs.existsSync(backendEnv);

    if (!this.status.envFiles.frontend) {
      this.log('✗ Frontend .env missing, creating...', 'warning');
      this.createFrontendEnv();
    } else {
      this.log('✓ Frontend .env exists', 'success');
    }

    if (!this.status.envFiles.backend) {
      this.log('✗ Backend .env missing, creating...', 'warning');
      this.createBackendEnv();
    } else {
      this.log('✓ Backend .env exists', 'success');
    }
  }

  createFrontendEnv() {
    const envContent = `# Frontend Environment Variables
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
`;
    
    fs.writeFileSync(path.join(__dirname, 'frontend', '.env'), envContent);
    this.log('✓ Created frontend .env file', 'success');
    this.fixes.push('Created frontend .env with default values');
  }

  createBackendEnv() {
    const dbConfig = this.status.database.type === 'postgresql' 
      ? `# PostgreSQL Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/risk_game
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=risk_game
DB_USER=postgres
DB_PASSWORD=password`
      : `# SQLite Configuration
DATABASE_URL=sqlite:./database.sqlite
DB_TYPE=sqlite
DB_PATH=./database.sqlite`;

    const envContent = `# Backend Environment Variables
NODE_ENV=development
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

${dbConfig}

# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379
`;
    
    fs.writeFileSync(path.join(__dirname, 'backend', '.env'), envContent);
    this.log(`✓ Created backend .env file with ${this.status.database.type.toUpperCase()} config`, 'success');
    this.fixes.push(`Created backend .env with ${this.status.database.type.toUpperCase()} configuration`);
  }

  async installDependencies() {
    if (!this.status.nodeModules.frontend || !this.status.nodeModules.backend) {
      this.log('\n📥 Installing missing dependencies...', 'info');
      
      if (!this.status.nodeModules.frontend) {
        this.log('Installing frontend dependencies...', 'info');
        try {
          execSync('npm install', { 
            cwd: path.join(__dirname, 'frontend'), 
            stdio: 'inherit' 
          });
          this.log('✓ Frontend dependencies installed', 'success');
        } catch (error) {
          this.log('✗ Failed to install frontend dependencies', 'error');
          this.issues.push('Frontend dependency installation failed');
        }
      }

      if (!this.status.nodeModules.backend) {
        this.log('Installing backend dependencies...', 'info');
        try {
          execSync('npm install', { 
            cwd: path.join(__dirname, 'backend'), 
            stdio: 'inherit' 
          });
          this.log('✓ Backend dependencies installed', 'success');
        } catch (error) {
          this.log('✗ Failed to install backend dependencies', 'error');
          this.issues.push('Backend dependency installation failed');
        }
      }
    }
  }

  async updateBackendForSQLite() {
    if (this.status.database.type === 'sqlite') {
      this.log('\n🔧 Configuring backend for SQLite...', 'info');
      
      // Add sqlite3 dependency if not present
      const backendPackageJson = path.join(__dirname, 'backend', 'package.json');
      if (fs.existsSync(backendPackageJson)) {
        const packageData = JSON.parse(fs.readFileSync(backendPackageJson, 'utf8'));
        
        if (!packageData.dependencies.sqlite3) {
          this.log('Adding sqlite3 dependency...', 'info');
          try {
            execSync('npm install sqlite3', { 
              cwd: path.join(__dirname, 'backend'), 
              stdio: 'inherit' 
            });
            this.log('✓ SQLite3 dependency added', 'success');
          } catch (error) {
            this.log('✗ Failed to add sqlite3 dependency', 'error');
            this.issues.push('Could not install sqlite3 package');
          }
        }
      }
    }
  }

  printReport() {
    this.log('\n' + '='.repeat(60), 'info');
    this.log('🎯 SETUP STATUS REPORT', 'info');
    this.log('='.repeat(60), 'info');

    // System Dependencies
    this.log('\nSystem Dependencies:', 'info');
    this.log(`  Node.js: ${this.status.dependencies.node ? '✓' : '✗'}`, 
             this.status.dependencies.node ? 'success' : 'error');
    this.log(`  npm: ${this.status.dependencies.npm ? '✓' : '✗'}`, 
             this.status.dependencies.npm ? 'success' : 'error');

    // Project Dependencies
    this.log('\nProject Dependencies:', 'info');
    this.log(`  Frontend node_modules: ${this.status.nodeModules.frontend ? '✓' : '✗'}`, 
             this.status.nodeModules.frontend ? 'success' : 'warning');
    this.log(`  Backend node_modules: ${this.status.nodeModules.backend ? '✓' : '✗'}`, 
             this.status.nodeModules.backend ? 'success' : 'warning');

    // Database
    this.log('\nDatabase:', 'info');
    this.log(`  Type: ${this.status.database.type?.toUpperCase() || 'None'}`, 'info');
    this.log(`  Available: ${this.status.database.available ? '✓' : '✗'}`, 
             this.status.database.available ? 'success' : 'error');

    // Environment Files
    this.log('\nEnvironment Files:', 'info');
    this.log(`  Frontend .env: ${this.status.envFiles.frontend ? '✓' : '✗'}`, 
             this.status.envFiles.frontend ? 'success' : 'warning');
    this.log(`  Backend .env: ${this.status.envFiles.backend ? '✓' : '✗'}`, 
             this.status.envFiles.backend ? 'success' : 'warning');

    // Issues
    if (this.issues.length > 0) {
      this.log('\n❌ Issues Found:', 'error');
      this.issues.forEach(issue => this.log(`  • ${issue}`, 'error'));
    }

    // Fixes Applied
    if (this.fixes.length > 0) {
      this.log('\n🔧 Fixes Applied:', 'success');
      this.fixes.forEach(fix => this.log(`  • ${fix}`, 'success'));
    }

    // Next Steps
    this.log('\n🚀 Next Steps:', 'info');
    if (this.issues.length === 0) {
      this.log('  • Run "npm run dev" to start development servers', 'success');
      this.log('  • Or run "powershell ./start-dev.ps1" for automated startup', 'success');
    } else {
      this.log('  • Fix the issues listed above', 'warning');
      this.log('  • Run this script again to verify fixes', 'warning');
    }

    this.log('\n📋 Available Commands:', 'info');
    this.log('  • npm run setup          - Run this setup check', 'info');
    this.log('  • npm run dev            - Start both frontend and backend', 'info');
    this.log('  • npm run dev:frontend   - Start frontend only', 'info');
    this.log('  • npm run dev:backend    - Start backend only', 'info');
    
    this.log('\n' + '='.repeat(60), 'info');
  }

  async run() {
    this.log('🎮 Risk Game Development Setup Check', 'info');
    this.log('Checking your development environment...\n', 'info');

    await this.checkDependencies();
    await this.checkNodeModules();
    await this.checkDatabase();
    await this.checkEnvFiles();
    await this.updateBackendForSQLite();
    await this.installDependencies();

    this.printReport();

    return {
      success: this.issues.length === 0,
      status: this.status,
      issues: this.issues,
      fixes: this.fixes
    };
  }
}

// Run the setup check
if (require.main === module) {
  const checker = new SetupChecker();
  checker.run().then(result => {
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Setup check failed:', error);
    process.exit(1);
  });
}

module.exports = SetupChecker;