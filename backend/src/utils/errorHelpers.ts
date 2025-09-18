export type KnownError = Error & {
  code?: string | number
  errno?: number
  syscall?: string
  hostname?: string
  status?: number
  statusCode?: number
  [key: string]: any
}

const isErrorObject = (value: any): value is Record<string, any> => {
  return typeof value === 'object' && value !== null
}

/**
 * Normalize an any error into an Error instance while preserving useful metadata.
 */
export const toKnownError = (value: any): KnownError => {
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

export const getErrorMessage = (value: any): string => {
  return toKnownError(value).message
}

export const getErrorStack = (value: any): string | undefined => {
  return toKnownError(value).stack
}

export const getErrorCode = (value: any): string | number | undefined => {
  return toKnownError(value).code
}
