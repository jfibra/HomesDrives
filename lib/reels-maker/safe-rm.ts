import { rm } from 'fs/promises'

const RETRYABLE_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY'])

export async function safeRemoveDir(dirPath: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await rm(dirPath, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 200,
      })
      return
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as NodeJS.ErrnoException).code)
          : ''

      if (!RETRYABLE_CODES.has(code)) {
        throw error
      }

      if (attempt === 7) {
        console.warn('[reels-maker] temp cleanup skipped after retries:', dirPath, error)
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
}
