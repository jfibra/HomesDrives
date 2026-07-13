import type { ReelTemplateId } from '@/lib/reels-maker/types'

export type ReelTemplate = {
  id: ReelTemplateId
  label: string
  description: string
  defaultSceneDuration: number
  transitionStyle: 'fade' | 'cross-dissolve'
  motionIntensity: 'subtle' | 'moderate'
}

export const REEL_TEMPLATES: ReelTemplate[] = [
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Slow zooms, soft fades, emotional pacing.',
    defaultSceneDuration: 3.2,
    transitionStyle: 'cross-dissolve',
    motionIntensity: 'subtle',
  },
  {
    id: 'luxury',
    label: 'Luxury',
    description: 'Elegant pans and longer holds for premium listings.',
    defaultSceneDuration: 3.8,
    transitionStyle: 'fade',
    motionIntensity: 'subtle',
  },
  {
    id: 'modern',
    label: 'Modern',
    description: 'Clean cuts with confident rhythm.',
    defaultSceneDuration: 2.6,
    transitionStyle: 'fade',
    motionIntensity: 'moderate',
  },
  {
    id: 'real-estate',
    label: 'Real Estate',
    description: 'Property highlights with welcoming overlays.',
    defaultSceneDuration: 3,
    transitionStyle: 'cross-dissolve',
    motionIntensity: 'subtle',
  },
  {
    id: 'travel',
    label: 'Travel',
    description: 'Movement-forward energy with scenic pacing.',
    defaultSceneDuration: 2.8,
    transitionStyle: 'cross-dissolve',
    motionIntensity: 'moderate',
  },
  {
    id: 'family',
    label: 'Family',
    description: 'Warm, heartfelt moments with gentle motion.',
    defaultSceneDuration: 3.4,
    transitionStyle: 'fade',
    motionIntensity: 'subtle',
  },
  {
    id: 'event',
    label: 'Event',
    description: 'Highlights reel for gatherings and launches.',
    defaultSceneDuration: 2.5,
    transitionStyle: 'fade',
    motionIntensity: 'moderate',
  },
  {
    id: 'birthday',
    label: 'Birthday',
    description: 'Celebratory pacing with joyful overlays.',
    defaultSceneDuration: 2.7,
    transitionStyle: 'fade',
    motionIntensity: 'moderate',
  },
  {
    id: 'wedding',
    label: 'Wedding',
    description: 'Romantic dissolves and soft cinematic motion.',
    defaultSceneDuration: 3.6,
    transitionStyle: 'cross-dissolve',
    motionIntensity: 'subtle',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Quiet, editorial pacing with restrained text.',
    defaultSceneDuration: 3,
    transitionStyle: 'fade',
    motionIntensity: 'subtle',
  },
  {
    id: 'social-trend',
    label: 'Social Media Trend',
    description: 'Snappier timing tuned for Reels and Shorts.',
    defaultSceneDuration: 2.2,
    transitionStyle: 'fade',
    motionIntensity: 'moderate',
  },
  {
    id: 'listing-showcase',
    label: 'Listing Showcase',
    description: 'Price/address overlay with agent contact card — structured partner listing reels.',
    defaultSceneDuration: 2.5,
    transitionStyle: 'cross-dissolve',
    motionIntensity: 'subtle',
  },
]

export function getReelTemplate(id: ReelTemplateId) {
  return REEL_TEMPLATES.find((template) => template.id === id) ?? REEL_TEMPLATES[0]
}
