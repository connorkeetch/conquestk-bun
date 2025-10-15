# Coding Standards & Best Practices

**Last Updated**: 2025-09-01

This document outlines the coding standards and best practices for the ConquestK project. All contributors and AI assistants (including Claude Code) should follow these principles.

## 🎯 Core Principles

### 1. Follow Code Specifications
- **TypeScript**: Follow the official TypeScript style guide
- **React**: Follow React best practices and hooks rules
- **Node.js**: Follow Node.js best practices for async operations
- **SQL**: Use PostgreSQL standards—always write native Postgres syntax with `$n` placeholders and Postgres functions (never MySQL, SQLite, or `?` parameters)
- **CSS**: Use Tailwind CSS v4 exclusively (no inline styles)

### 2. Documentation and Comments
```typescript
// ❌ BAD: Explaining WHAT
// Increment counter by 1
counter++;

// ✅ GOOD: Explaining WHY
// User requested items are counted separately for analytics tracking
counter++;
```

**Requirements:**
- Document all public APIs
- Explain complex algorithms
- Document edge cases and assumptions
- Keep comments up-to-date with code changes
- Use JSDoc for function documentation

### 3. Robustness & Error Handling
```typescript
// ✅ GOOD: Proper error handling
export async function fetchUserData(userId: string): Promise<UserData> {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (!result.rows[0]) {
      throw new NotFoundError(`User ${userId} not found`);
    }
    
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to fetch user data:', error);
    throw error;
  }
}
```

### 4. SOLID Principles

#### Single Responsibility
```typescript
// ✅ GOOD: Each service has one responsibility
class GameService {
  // Only handles game state management
}

class EloService {
  // Only handles rating calculations
}
```

#### Open/Closed
```typescript
// ✅ GOOD: Open for extension, closed for modification
interface GameMode {
  initialize(): void;
  processMove(move: Move): void;
}

class ClassicMode implements GameMode { }
class CapitalMode implements GameMode { }
```

### 5. Testing

**Test Structure:**
```typescript
describe('GameEngine', () => {
  describe('reinforcement phase', () => {
    it('should calculate correct reinforcement count', () => {
      // Arrange
      const territories = 12;
      
      // Act
      const reinforcements = calculateReinforcements(territories);
      
      // Assert
      expect(reinforcements).toBe(4);
    });
  });
});
```

**Requirements:**
- Write tests for all business logic
- Maintain >70% code coverage
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

### 6. Abstraction

```typescript
// ✅ GOOD: Appropriate abstraction
interface DatabaseConnection {
  query<T>(sql: string, params: any[]): Promise<T>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}

// ❌ BAD: Over-abstraction
interface AbstractQueryExecutorFactoryInterface { }
```

### 7. Design Patterns

**Use patterns appropriately:**
- **Singleton**: Database connection pool
- **Observer**: Socket.io event handling
- **Strategy**: Game modes (Classic, Capital, etc.)
- **Factory**: Creating game instances

**Avoid over-engineering:**
```typescript
// ❌ BAD: Unnecessary pattern
class UserFactoryBuilderManager { }

// ✅ GOOD: Simple and clear
function createUser(data: UserInput): User { }
```

### 8. Reduce Global Dependencies

```typescript
// ❌ BAD: Global state
let currentUser: User;

// ✅ GOOD: Dependency injection
class GameController {
  constructor(
    private gameService: GameService,
    private userService: UserService
  ) {}
}
```

### 9. Continuous Refactoring

**When to refactor:**
- Before adding new features
- When fixing bugs
- During code reviews
- When performance issues arise

**Refactoring checklist:**
- [ ] Remove dead code
- [ ] Eliminate duplication
- [ ] Improve naming
- [ ] Simplify complex logic
- [ ] Update documentation

### 10. Security First

**Security requirements:**
```typescript
// ✅ Input validation
const email = validator.isEmail(input.email);

// ✅ SQL injection prevention
await query('SELECT * FROM users WHERE id = $1', [userId]);

// ✅ Password hashing
const hashedPassword = await bcrypt.hash(password, 10);

// ✅ JWT verification
const token = jwt.verify(authToken, process.env.JWT_SECRET);

// ✅ CORS configuration
app.use(cors({ origin: process.env.CLIENT_URL }));
```

## 📁 Project-Specific Standards

### Database Changes
1. **NEVER** modify existing migration files
2. **ALWAYS** create new migration files
3. **TEST** migrations locally first
4. **VALIDATE** schema after migrations

### API Contracts (naming & casing)
- JSON API responses use camelCase keys exclusively (e.g., `selectedColor`, `playerId`, `turnExpiresAt`).
- Database schema may remain snake_case (`selected_color`, `preferred_color`). Normalize to camelCase at the API boundary (service/serializer), and do not leak snake_case to clients.
- WebSocket payloads follow the same rule: camelCase on the wire; normalize server-side.
- When migrating existing fields, prefer adding a camelCase alias and then removing the snake_case key in the next change window. During the development-only phase, you can remove snake_case promptly once the client is updated.
- Controllers/services should centralize the field mapping so routes stay consistent. Avoid per-route hand mapping.

### File Organization
```
src/
├── components/   # React components
├── services/     # Business logic
├── types/        # TypeScript types
├── utils/        # Utility functions
└── config/       # Configuration
```

### Naming Conventions
- **Files**: `camelCase.ts` for logic, `PascalCase.tsx` for components
- **Variables**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`
- **Database**: `snake_case` for tables and columns

### Git Commit Messages
```
feat: Add user authentication
fix: Resolve database connection timeout
docs: Update README with setup instructions
refactor: Simplify game state management
test: Add tests for ELO calculation
```

### Code Review Checklist
- [ ] Follows TypeScript best practices
- [ ] Includes appropriate error handling
- [ ] Has sufficient test coverage
- [ ] Documentation is updated
- [ ] No security vulnerabilities
- [ ] Performance considerations addressed
- [ ] Database migrations included (if needed)

## 🚀 Implementation in Claude Code

## ⚡ Performance & Lighthouse

- Avoid blocking LCP:
  - Load theme display fonts on-demand per theme; do not import decorative fonts globally.
  - Defer service worker registration until after `window.load` to keep the main thread free during first paint.
  - Do not preload audio on boot; only preload after user interaction/unlock.
  - Idle-load large optional data (e.g., precomputed odds) using `requestIdleCallback` or a short timeout.
- Resource hints:
  - Add `dns-prefetch` and `preconnect` for the CDN origin and enable DNS prefetch via Helmet.
- Caching:
  - Serve favicons/logo as `public, max-age=31536000, immutable`.

When Claude Code works on this project, it should:

1. **Validate input** before processing
2. **Handle errors** gracefully with try-catch
3. **Write tests** for new features
4. **Document complex logic** with comments
5. **Follow SOLID principles** in design

## 🔀 Routing & URL State

- Avoid placing `URLSearchParams` objects in React effect dependency arrays. They are not stable and can cause unnecessary renders or navigation loops.
- Prefer derived string values from query parameters, or use the shared hook `useQueryParam(name)`, which returns a lowercased string.
- Separate read-from-URL and write-to-URL logic. Only update the URL when a value actually changed.
- When mirroring state to the URL frequently, use `setSearchParams(next, { replace: true })` to avoid flooding browser history.
- Be cautious with timers/intervals; ensure they do not cascade into `navigate`/`setSearchParams` calls that can trigger throttling warnings.
6. **Use TypeScript types** (never `any`)
7. **Create migrations** for database changes
8. **Validate security** implications
9. **Consider performance** impacts
10. **Maintain consistency** with existing code

## 🔍 Automated Checks

### Pre-commit
```bash
npm run lint        # Check code style
npm run test        # Run tests
npm run check:schema # Validate database
```

### CI/CD Pipeline
- Linting (Biome)
- Type checking (TypeScript)
- Unit tests (Jest/Vitest)
- Integration tests (Playwright)
- Security audit (npm audit)

## 📚 References

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [OWASP Security Guidelines](https://owasp.org/www-project-top-ten/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Remember**: Good code is not just working code—it's code that can be understood, maintained, and extended by others (including your future self).
