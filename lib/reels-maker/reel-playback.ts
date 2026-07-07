export function parseReelResultStorage(resultUrl: string) {
  try {
    const parsed = new URL(resultUrl)
    if (!parsed.hostname.includes('amazonaws.com')) return null

    const bucketName = parsed.hostname.split('.')[0]
    const storagePath = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    if (!bucketName || !storagePath) return null

    return { bucketName, storagePath }
  } catch {
    return null
  }
}

/** Same-origin stream URL so drafts play reliably in the browser (range requests + no S3 CORS issues). */
export function getReelVideoPlaybackUrl(jobId: string, resultUrl?: string | null) {
  if (!jobId || !resultUrl) return null
  return `/api/reels-maker/jobs/${jobId}/video`
}
