export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}

export function containsUrl(value: string): boolean {
  // Basic URL detection: protocol, www., or obvious TLDs
  const urlLike =
    /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|gg|app|dev|site|co|me|xyz|link|to)\b)/i
  return urlLike.test(value)
}

// Lightweight profanity screen; extend as needed
const PROFANITY_LIST = ['fuck', 'shit', 'bitch', 'asshole', 'dick', 'piss', 'bastard']

export function containsProfanity(value: string): boolean {
  const lower = value.toLowerCase()
  return PROFANITY_LIST.some((w) => lower.includes(w))
}

export function validateBio(raw: string): { ok: boolean; sanitized: string; error?: string } {
  const stripped = stripHtml(raw ?? '').trim()
  if (!stripped) {
    return { ok: true, sanitized: '' }
  }
  if (containsUrl(stripped)) {
    return { ok: false, sanitized: '', error: 'Bio may not contain links' }
  }
  if (containsProfanity(stripped)) {
    return { ok: false, sanitized: '', error: 'Bio contains disallowed language' }
  }
  return { ok: true, sanitized: stripped }
}
