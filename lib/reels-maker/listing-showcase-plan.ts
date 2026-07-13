import { getReelTemplate } from '@/lib/reels-maker/templates'
import { fitVoiceScriptToScenes } from '@/lib/reels-maker/voice-over'
import type { ReelJob, ReelScenePlan, ReelStoryPlan, ReelUploadedMedia } from '@/lib/reels-maker/types'

function pickTransition(index: number): ReelScenePlan['transition'] {
  const options: ReelScenePlan['transition'][] = [
    'cross-dissolve',
    'zoom-cut',
    'slide-left',
    'fade',
    'smooth-zoom',
    'slide-right',
    'wipe-up',
    'cross-dissolve',
  ]
  return options[index % options.length]
}

function pickMotion(index: number): ReelScenePlan['motion'] {
  if (index % 5 === 2) return 'slow-zoom-in'
  return 'static'
}

function formatFactsLine(beds: string, baths: string, sqft: string): string {
  const parts: string[] = []
  if (beds) parts.push(`${beds} Bed${beds === '1' ? '' : 's'}`)
  if (baths) parts.push(`${baths} Bath${baths === '1' ? '' : 's'}`)
  if (sqft) parts.push(`${sqft} sqft`)
  return parts.join('  ·  ')
}

function buildVoiceOverScript(job: ReelJob, mediaCount: number): string {
  if (!job.voiceOverEnabled) return ''

  const briefLines = job.reelBrief
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (briefLines.length) {
    const spoken = briefLines
      .slice(0, 4)
      .map((line) => line.replace(/^[-*•]\s*/, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (spoken) {
      return fitVoiceScriptToScenes(spoken.endsWith('.') ? spoken : `${spoken}.`, mediaCount)
    }
  }

  const address = job.listingAddress ? ` at ${job.listingAddress}` : ''
  return fitVoiceScriptToScenes(
    `Welcome to this stunning property${address}. Take a closer look inside.`,
    mediaCount,
  )
}

/**
 * Deterministic scene plan for the Listing Showcase template — price/address must be exact,
 * so this skips Gemini entirely rather than risk it guessing listing details from photos.
 */
export function buildListingShowcasePlan(params: {
  media: ReelUploadedMedia[]
  job: ReelJob
}): { plan: ReelStoryPlan; caption: string; hashtags: string[] } {
  const { media, job } = params
  const template = getReelTemplate('listing-showcase')

  const factsLine = formatFactsLine(job.listingBeds, job.listingBaths, job.listingSqft)
  const factsLines = [job.listingAddress, factsLine].filter((line): line is string => Boolean(line))

  const scenes: ReelScenePlan[] = media.map((item, index) => ({
    mediaId: item.id,
    durationSeconds: Number(
      (template.defaultSceneDuration + (index % 3 === 0 ? 0.4 : index % 2 === 0 ? -0.3 : 0)).toFixed(2),
    ),
    transition: pickTransition(index),
    motion: pickMotion(index),
    textOverlay: null,
    captionLine: null,
    listingPriceText: job.listingPrice || null,
    listingFactsLines: factsLines.length ? factsLines : null,
  }))

  const voiceOverScript = buildVoiceOverScript(job, media.length)

  const caption =
    job.caption ||
    [job.listingAddress, job.listingPrice].filter(Boolean).join(' — ') ||
    'Just listed — schedule your private showing today.'

  const hashtags = ['#HomesPH', '#JustListed', '#RealEstate', '#PropertyTour']

  const plan: ReelStoryPlan = {
    title: job.listingAddress || 'Featured Listing',
    templateId: 'listing-showcase',
    mood: template.label,
    scenes,
    voiceOverScript,
    suggestedHashtags: hashtags,
    musicMood: 'Modern',
    pacingNotes: 'Steady, confident pacing with a persistent price/address lower-third.',
  }

  return { plan, caption, hashtags }
}
