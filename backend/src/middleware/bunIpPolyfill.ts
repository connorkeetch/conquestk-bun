import type { NextFunction, Request, Response } from 'express'

/**
 * Resolves the real client IP from proxy headers and pins it onto `req.ip`.
 *
 * Behind Cloudflare + Railway the upstream chain is multi-hop, so Express's
 * trust-proxy heuristic can record an edge/proxy IP. We prefer the explicit
 * client-IP headers (Cloudflare `cf-connecting-ip`, then `x-forwarded-for` /
 * `x-real-ip`) and fall back to the socket address. Must be applied BEFORE any
 * middleware that reads `req.ip` (rate limiting, audit logging).
 */
export function bunIpPolyfill(req: Request, _res: Response, next: NextFunction): void {
  let ip: string | undefined

  // Try x-forwarded-for first (standard for proxies/load balancers)
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    // x-forwarded-for can be comma-separated; take the first (client) IP
    ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim()
  }
  // Try x-real-ip (nginx default)
  else if (req.headers['x-real-ip']) {
    ip = req.headers['x-real-ip'] as string
  }
  // Try cf-connecting-ip (Cloudflare)
  else if (req.headers['cf-connecting-ip']) {
    ip = req.headers['cf-connecting-ip'] as string
  }
  // Fallback to socket remote address or unknown
  else {
    ip = req.socket?.remoteAddress || 'unknown'
  }

  // Override the throwing getter with our resolved value
  Object.defineProperty(req, 'ip', {
    value: ip,
    writable: true,
    configurable: true,
  })

  next()
}
