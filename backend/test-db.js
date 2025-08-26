const sqlite3 = require('sqlite3').verbose()
const bcrypt = require('bcryptjs')

// Open database
const db = new sqlite3.Database('./risk_game.db', (err) => {
  if (err) {
    return
  }
})

// Test user registration
async function testRegistration() {
  const username = `testuser_${Date.now()}`
  const email = `test_${Date.now()}@example.com`
  const password = 'testpass123'

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Insert user
    db.run(
      `INSERT INTO users (username, email, password_hash, created_at, updated_at) 
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [username, email, hashedPassword],
      (err) => {
        if (err) {
          return
        }

        // Verify user was created
        db.get('SELECT * FROM users WHERE username = ?', [username], (err, _row) => {
          if (err) {
          } else {
          }
          db.close()
        })
      },
    )
  } catch (_error) {
    db.close()
  }
}

// Check if users table exists
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
  if (err) {
    db.close()
  } else if (!row) {
    db.close()
  } else {
    testRegistration()
  }
})
