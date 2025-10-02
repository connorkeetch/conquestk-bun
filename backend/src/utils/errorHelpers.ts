export type KnownError = Error & {
  code?: string | number
  errno?: number
  syscall?: string
  hostname?: string
  status?: number
  statusCode?: number
  [key: string]: unknown
}

const isErrorObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

/**
 * Normalize an any error into an Error instance while preserving useful metadata.
 */
export const toKnownError = (value: unknown): KnownError => {
  if (value instanceof Error) {
    return value as KnownError
  }

  if (isErrorObject(value)) {
    const tentativeMessage = value.message
    const normalized = new Error(
      typeof tentativeMessage === 'string' ? tentativeMessage : String(value),
    ) as KnownError
    Object.assign(normalized, value)
    return normalized
  }

  return new Error(String(value)) as KnownError
}

export const getErrorMessage = (value: unknown): string => {
  return toKnownError(value).message
}

export const getErrorStack = (value: unknown): string | undefined => {
  return toKnownError(value).stack
}

export const getErrorCode = (value: unknown): string | number | undefined => {
  return toKnownError(value).code
}
