const YOUTUBE_HOST_PATTERN = /(^|\.)youtube\.com$|^youtu\.be$/i

export function parseYouTubeVideoId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = new URL(withProtocol)

    if (!YOUTUBE_HOST_PATTERN.test(parsed.hostname)) {
      return null
    }

    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0]
      return id && id.length >= 6 ? id : null
    }

    if (parsed.pathname.startsWith('/shorts/')) {
      const id = parsed.pathname.split('/')[2]
      return id && id.length >= 6 ? id : null
    }

    const watchId = parsed.searchParams.get('v')
    if (watchId && watchId.length >= 6) return watchId

    return null
  } catch {
    return null
  }
}

export function isValidYouTubeMusicUrl(rawUrl: string) {
  return Boolean(parseYouTubeVideoId(rawUrl))
}

export function normalizeYouTubeUrl(rawUrl: string) {
  const videoId = parseYouTubeVideoId(rawUrl)
  if (!videoId) return null
  return `https://www.youtube.com/watch?v=${videoId}`
}
