import { reelsMakerApiPath } from '@/lib/reels-maker/api-base'

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

/** Same-origin or EC2 stream URL for draft playback (range requests + no S3 CORS issues). */
export function getReelVideoPlaybackUrl(jobId: string, resultUrl?: string | null) {
  if (!jobId || !resultUrl) return null
  return reelsMakerApiPath(`/api/reels-maker/jobs/${jobId}/video`)
}
