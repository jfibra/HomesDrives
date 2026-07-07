import sharp from 'sharp'

import type { ReelMediaKind } from '@/lib/reels-maker/types'

export type MediaQualityResult = {
  width: number | null
  height: number | null
  qualityScore: number
  rejected: boolean
  rejectReason?: string
}

function scoreFromStats(mean: number, sharpness: number, width: number, height: number) {
  const pixels = width * height
  const resolutionScore = Math.min(1, pixels / (1280 * 720))
  const brightnessScore = mean > 25 && mean < 235 ? 1 : 0.55
  const sharpnessScore = Math.min(1, sharpness / 80)
  return Number((resolutionScore * 0.4 + brightnessScore * 0.25 + sharpnessScore * 0.35).toFixed(3))
}

export async function analyzeMediaQuality(buffer: Buffer, kind: ReelMediaKind): Promise<MediaQualityResult> {
  if (kind === 'video') {
    return {
      width: null,
      height: null,
      qualityScore: 0.75,
      rejected: false,
    }
  }

  try {
    const image = sharp(buffer, { failOn: 'none' })
    const meta = await image.metadata()
    const width = meta.width ?? 0
    const height = meta.height ?? 0

    if (width < 320 || height < 320) {
      return {
        width: width || null,
        height: height || null,
        qualityScore: 0.15,
        rejected: true,
        rejectReason: 'Resolution is too low.',
      }
    }

    const stats = await image.stats()
    const mean = stats.channels.reduce((sum, channel) => sum + channel.mean, 0) / stats.channels.length
    const gray = await image
      .resize({ width: 640, withoutEnlargement: true })
      .grayscale()
      .raw()
      .toBuffer()
    let variance = 0
    const sampleStep = Math.max(1, Math.floor(gray.length / 40000))
    let sum = 0
    let sumSq = 0
    let count = 0
    for (let index = 0; index < gray.length; index += sampleStep) {
      const value = gray[index]
      sum += value
      sumSq += value * value
      count += 1
    }
    if (count > 0) {
      const avg = sum / count
      variance = sumSq / count - avg * avg
    }

    const sharpness = Math.sqrt(Math.max(variance, 0))
    const qualityScore = scoreFromStats(mean, sharpness, width, height)

    if (mean < 8) {
      return {
        width,
        height,
        qualityScore,
        rejected: true,
        rejectReason: 'Image is too dark.',
      }
    }

    if (sharpness < 6 && Math.max(width, height) < 900) {
      return {
        width,
        height,
        qualityScore,
        rejected: true,
        rejectReason: 'Image appears blurry.',
      }
    }

    return {
      width,
      height,
      qualityScore: Math.max(qualityScore, 0.25),
      rejected: false,
    }
  } catch {
    return {
      width: null,
      height: null,
      qualityScore: 0.4,
      rejected: false,
    }
  }
}

export function dedupeMediaByFileName<T extends { fileName: string; qualityScore: number }>(items: T[]) {
  const byKey = new Map<string, T>()
  for (const item of items) {
    const key = item.fileName.trim().toLowerCase()
    const existing = byKey.get(key)
    if (!existing || item.qualityScore > existing.qualityScore) {
      byKey.set(key, item)
    }
  }
  return [...byKey.values()]
}
