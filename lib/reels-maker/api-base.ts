/** Base URL for reels API (EC2 worker). Empty = same-origin `/api/reels-maker` on Vercel/local. */
export function getReelsMakerApiBase(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_REELS_API_URL?.trim() || ''
  }
  return (
    process.env.REELS_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_REELS_API_URL?.trim() ||
    ''
  )
}

export function reelsMakerApiPath(path: string): string {
  const base = getReelsMakerApiBase().replace(/\/$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${normalized}` : normalized
}
