import type { Request } from 'express'
import { buildFrontendUrl, resolveAssetUrl } from './url.js'

describe('URL Utilities', () => {
  describe('buildFrontendUrl', () => {
    it('should use FRONTEND_URL env var if available', () => {
      process.env.FRONTEND_URL = 'https://example.com'
      const req = { protocol: 'http', get: () => 'localhost' } as unknown as Request
      expect(buildFrontendUrl(req, '/path')).toBe('https://example.com/path')
      delete process.env.FRONTEND_URL
    })

    it('should derive from request host and protocol', () => {
      const req = { protocol: 'https', get: () => 'game.net' } as unknown as Request
      expect(buildFrontendUrl(req, '/lobby')).toBe('https://game.net/lobby')
    })

    it('should fall back to localhost when FRONTEND_URL not set (with warning in production)', () => {
      process.env.NODE_ENV = 'production'
      const req = { protocol: '', get: () => '' } as unknown as Request
      // Now falls back to localhost with a warning instead of hardcoded domain
      expect(buildFrontendUrl(req, '/')).toBe('http://localhost:5173/')
      delete process.env.NODE_ENV
    })

    it('should fall back to localhost when FRONTEND_URL not set (with warning in staging)', () => {
      process.env.NODE_ENV = 'staging'
      const req = { protocol: '', get: () => '' } as unknown as Request
      // Now falls back to localhost with a warning instead of hardcoded domain
      expect(buildFrontendUrl(req, '/')).toBe('http://localhost:5173/')
      delete process.env.NODE_ENV
    })

    it('should fall back to development default', () => {
      const req = { protocol: '', get: () => '' } as unknown as Request
      expect(buildFrontendUrl(req, 'game/123')).toBe('http://localhost:5173/game/123')
    })
  })

  describe('resolveAssetUrl', () => {
    const req = { protocol: 'https', get: () => 'my-server.com' } as unknown as Request

    it('should return null for null or empty input', () => {
      expect(resolveAssetUrl(req, null)).toBeNull()
      expect(resolveAssetUrl(req, '')).toBeNull()
      expect(resolveAssetUrl(req, '  ')).toBeNull()
    })

    it('should return absolute URLs as-is', () => {
      expect(resolveAssetUrl(req, 'http://example.com/asset.png')).toBe(
        'http://example.com/asset.png',
      )
      expect(resolveAssetUrl(req, 'https://cdn.conquestk.com/maps/europe.svg')).toBe(
        'https://cdn.conquestk.com/maps/europe.svg',
      )
    })

    it('should prefix local /uploads paths with the request host', () => {
      expect(resolveAssetUrl(req, '/uploads/maps/custom.png')).toBe(
        'https://my-server.com/uploads/maps/custom.png',
      )
    })

    it('should treat other values as storage keys and resolve them', () => {
      // This will use the default public asset URL builder
      expect(resolveAssetUrl(req, 'maps/official/classic.svg')).toContain(
        'maps/official/classic.svg',
      )
    })
  })
})
