const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'backend', 'risk_game.db');

console.log('🔍 Checking database at:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.log('❌ Database file does not exist!');
  process.exit(1);
}

const db = new sqlite3.Database(dbPath);

// Check users and admin status
db.all('SELECT u.id, u.username, u.email, ur.role_id FROM users u LEFT JOIN user_admin_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE', 
  (err, users) => {
    if (err) {
      console.log('❌ Error fetching users:', err);
      return;
    }
    
    console.log('\n👥 Users in database:');
    users.forEach(user => {
      console.log(`  - ${user.username} (${user.email}) - Admin: ${user.role_id ? 'YES' : 'NO'}`);
    });
    
    if (users.length === 0) {
      console.log('❌ No users found! Please register a user first.');
      db.close();
      return;
    }
    
    const latestUser = users[users.length - 1];
    
    if (!latestUser.role_id) {
      console.log(`\n🔧 Making ${latestUser.username} an admin...`);
      
      db.run('INSERT OR IGNORE INTO user_admin_roles (user_id, role_id, assigned_by, is_active) VALUES (?, 1, ?, TRUE)', 
        [latestUser.id, latestUser.id], 
        function(err) {
          if (err) {
            console.log('❌ Error making admin:', err);
          } else {
            console.log('✅ User is now admin!');
          }
          
          // Check uploads directory
          checkUploadsDirectory();
        }
      );
    } else {
      console.log(`✅ ${latestUser.username} is already an admin`);
      checkUploadsDirectory();
    }
  }
);

function checkUploadsDirectory() {
  const uploadsDir = path.join(__dirname, 'backend', 'uploads', 'maps');
  
  console.log('\n📁 Checking uploads directory:', uploadsDir);
  
  try {
    if (!fs.existsSync(uploadsDir)) {
      console.log('🔧 Creating uploads directory...');
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('✅ Uploads directory created');
    } else {
      console.log('✅ Uploads directory exists');
    }
    
    // Test write permissions
    const testFile = path.join(uploadsDir, 'test-write.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('✅ Directory is writable');
    
  } catch (error) {
    console.log('❌ Directory issue:', error.message);
  }
  
  db.close();
  
  console.log('\n🎯 Next steps:');
  console.log('1. Start the backend: npm run dev');
  console.log('2. Try uploading a different JPG file');
  console.log('3. Check browser console for specific errors');
  console.log('4. If still failing, try PNG format instead');
}