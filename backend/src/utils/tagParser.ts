/**
 * Robust tag parser that handles multiple input formats
 * This handles the edge cases where FormData/multer corrupts JSON arrays
 */
export function parseTags(tags: any): string[] {
  // If already an array, return it
  if (Array.isArray(tags)) {
    return tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim())
  }

  // If it's a string, try multiple parsing strategies
  if (typeof tags === 'string') {
    // First, try parsing as JSON
    try {
      const parsed = JSON.parse(tags)
      if (Array.isArray(parsed)) {
        return parsed.filter((tag) => typeof tag === 'string').map((tag) => tag.trim())
      }
    } catch (error) {
      // Not valid JSON, continue to other strategies
    }

    // Check if it looks like a comma-separated list
    if (tags.includes(',')) {
      return tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    }

    // Single tag case
    const trimmed = tags.trim()
    return trimmed.length > 0 ? [trimmed] : []
  }

  // Default to empty array
  return []
}

/**
 * Parse any field that might be JSON or a string
 */
export function parseJsonField<T>(field: any, defaultValue: T): T {
  if (!field) return defaultValue

  // If it's already an object/array, return it
  if (typeof field === 'object') {
    return field as T
  }

  // If it's a string, try to parse it
  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T
    } catch (error) {
      // If parsing fails, return the default
      return defaultValue
    }
  }

  return defaultValue
}
