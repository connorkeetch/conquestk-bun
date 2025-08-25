const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// Open database
const db = new sqlite3.Database('./risk_game.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to SQLite database');
});

// Test user registration
async function testRegistration() {
  const username = 'testuser_' + Date.now();
  const email = `test_${Date.now()}@example.com`;
  const password = 'testpass123';
  
  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    db.run(
      `INSERT INTO users (username, email, password_hash, created_at, updated_at) 
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [username, email, hashedPassword],
      function(err) {
        if (err) {
          console.error('Error inserting user:', err);
          return;
        }
        console.log('User created successfully with ID:', this.lastID);
        
        // Verify user was created
        db.get(
          'SELECT * FROM users WHERE username = ?',
          [username],
          (err, row) => {
            if (err) {
              console.error('Error fetching user:', err);
            } else {
              console.log('User found:', row);
            }
            db.close();
          }
        );
      }
    );
  } catch (error) {
    console.error('Error:', error);
    db.close();
  }
}

// Check if users table exists
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
  if (err) {
    console.error('Error checking table:', err);
    db.close();
  } else if (!row) {
    console.error('Users table does not exist!');
    db.close();
  } else {
    console.log('Users table exists');
    testRegistration();
  }
});