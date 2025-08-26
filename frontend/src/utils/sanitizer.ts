import DOMPurify from 'dompurify';

/**
 * Sanitize user-generated HTML content to prevent XSS attacks
 * @param dirty - Potentially unsafe HTML string
 * @returns Sanitized HTML string safe for display
 */
export function sanitizeHTML(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'span'],
    ALLOWED_ATTR: []
  });
}

/**
 * Sanitize plain text input (usernames, game names, etc.)
 * Removes all HTML tags and dangerous characters
 * @param text - User input text
 * @returns Sanitized plain text
 */
export function sanitizeText(text: string): string {
  if (!text) return '';
  
  // Remove all HTML tags
  const cleaned = DOMPurify.sanitize(text, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true 
  });
  
  // Additional sanitization for special characters that could be used in attacks
  return cleaned
    .replace(/[<>]/g, '') // Remove any remaining angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

/**
 * Sanitize chat messages - allows basic formatting
 * @param message - Chat message from user
 * @returns Sanitized message with limited formatting
 */
export function sanitizeChatMessage(message: string): string {
  if (!message) return '';
  
  return DOMPurify.sanitize(message, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br'],
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick']
  });
}

/**
 * Sanitize user profile data
 * @param data - User profile object
 * @returns Sanitized profile data
 */
export function sanitizeProfileData(data: any): any {
  if (!data) return data;
  
  const sanitized = { ...data };
  
  // Sanitize text fields
  if (sanitized.username) sanitized.username = sanitizeText(sanitized.username);
  if (sanitized.bio) sanitized.bio = sanitizeText(sanitized.bio);
  if (sanitized.location) sanitized.location = sanitizeText(sanitized.location);
  if (sanitized.website) {
    // Validate and sanitize URL
    try {
      const url = new URL(sanitized.website);
      if (!['http:', 'https:'].includes(url.protocol)) {
        sanitized.website = '';
      }
    } catch {
      sanitized.website = '';
    }
  }
  
  return sanitized;
}

/**
 * Escape HTML entities for safe display in templates
 * @param text - Text to escape
 * @returns Escaped text
 */
export function escapeHTML(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Validate and sanitize game/room names
 * @param name - Game or room name
 * @returns Sanitized name
 */
export function sanitizeGameName(name: string): string {
  if (!name) return '';
  
  // Remove any HTML and limit to alphanumeric, spaces, and basic punctuation
  const sanitized = sanitizeText(name);
  
  // Further restrict to safe characters for game names
  return sanitized
    .replace(/[^a-zA-Z0-9\s\-_'.!]/g, '')
    .slice(0, 50) // Limit length
    .trim();
}

/**
 * Sanitize map data to prevent injection attacks
 * @param mapData - Map configuration object
 * @returns Sanitized map data
 */
export function sanitizeMapData(mapData: any): any {
  if (!mapData) return mapData;
  
  const sanitized = { ...mapData };
  
  // Sanitize string fields
  if (sanitized.name) sanitized.name = sanitizeText(sanitized.name);
  if (sanitized.description) sanitized.description = sanitizeText(sanitized.description);
  if (sanitized.creator) sanitized.creator = sanitizeText(sanitized.creator);
  
  // Sanitize territory names
  if (sanitized.territories && Array.isArray(sanitized.territories)) {
    sanitized.territories = sanitized.territories.map((territory: any) => ({
      ...territory,
      name: territory.name ? sanitizeText(territory.name) : '',
      continent: territory.continent ? sanitizeText(territory.continent) : ''
    }));
  }
  
  // Sanitize tags
  if (sanitized.tags && Array.isArray(sanitized.tags)) {
    sanitized.tags = sanitized.tags.map((tag: string) => sanitizeText(tag));
  }
  
  return sanitized;
}