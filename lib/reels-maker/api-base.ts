/** Base URL for reels API (EC2 worker). Empty = same-origin `/api/reels-maker` on Vercel/local. */
export function getReelsMakerApiBase(): string {
  const configured = (
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_REELS_API_URL
      : process.env.REELS_API_URL || process.env.NEXT_PUBLIC_REELS_API_URL
  )?.trim()

  if (!configured) return ''

  // HTTPS pages cannot call HTTP APIs (browser blocks mixed content).
  // Fall back to same-origin so Vercel proxies to EC2 via REELS_API_URL.
  if (typeof window !== 'undefined') {
    const pageIsHttps = window.location.protocol === 'https:'
    const apiIsHttp = configured.startsWith('http://')
    if (pageIsHttps && apiIsHttp) {
      return ''
    }
  }

  return configured
}

export function reelsMakerApiPath(path: string): string {
  const base = getReelsMakerApiBase().replace(/\/$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${normalized}` : normalized
}
