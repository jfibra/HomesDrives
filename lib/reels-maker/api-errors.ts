export function formatApiError(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    return error.trim() || fallback
  }

  if (error instanceof Error) {
    return error.message || fallback
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>

    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim()
    }

    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim()
    }

    if (record.error && typeof record.error === 'object') {
      const nested = formatApiError(record.error, '')
      if (nested) return nested
    }

    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== '{}') {
        return serialized
      }
    } catch {
      // ignore
    }
  }

  return fallback
}
