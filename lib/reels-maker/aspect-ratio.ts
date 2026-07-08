import { REEL_PRESCALE_MULTIPLIER } from '@/lib/reels-maker/render-quality'

export type ReelAspectRatio = 'portrait' | 'landscape'

export type ReelFrameDimensions = {
  width: number
  height: number
  preScaleWidth: number
  preScaleHeight: number
}

export const REEL_ASPECT_RATIO_OPTIONS: Array<{
  id: ReelAspectRatio
  label: string
  description: string
  ratioLabel: string
}> = [
  {
    id: 'portrait',
    label: 'Portrait',
    ratioLabel: '9:16',
    description: 'Facebook Reels, Instagram Reels, TikTok',
  },
  {
    id: 'landscape',
    label: 'Landscape',
    ratioLabel: '16:9',
    description: 'Facebook feed, YouTube, widescreen',
  },
]

export function isReelAspectRatio(value: unknown): value is ReelAspectRatio {
  return value === 'portrait' || value === 'landscape'
}

export function normalizeReelAspectRatio(value: unknown): ReelAspectRatio {
  return value === 'landscape' ? 'landscape' : 'portrait'
}

export function getReelAspectRatioLabel(aspectRatio: ReelAspectRatio) {
  const option = REEL_ASPECT_RATIO_OPTIONS.find((entry) => entry.id === aspectRatio)
  return option ? `${option.label} (${option.ratioLabel})` : 'Portrait (9:16)'
}

export function getReelFrameDimensions(aspectRatio: ReelAspectRatio): ReelFrameDimensions {
  const multiplier = REEL_PRESCALE_MULTIPLIER

  if (aspectRatio === 'landscape') {
    const width = 1920
    const height = 1080
    return {
      width,
      height,
      preScaleWidth: width * multiplier,
      preScaleHeight: height * multiplier,
    }
  }

  const width = 1080
  const height = 1920
  return {
    width,
    height,
    preScaleWidth: width * multiplier,
    preScaleHeight: height * multiplier,
  }
}
