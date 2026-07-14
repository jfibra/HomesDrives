import { pickCinematicMotion } from '@/lib/reels-maker/cinematic-motion'
import { polishCinematicPlan, pickLuxuryTransition } from '@/lib/reels-maker/cinematic-plan'
import { getReelTemplate } from '@/lib/reels-maker/templates'
import { fitVoiceScriptToScenes } from '@/lib/reels-maker/voice-over'
import type { ReelJob, ReelScenePlan, ReelStoryPlan, ReelUploadedMedia } from '@/lib/reels-maker/types'

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
 * Deterministic scene plan for the Listing Showcase template — price/address must be exact.
 * Uses luxury cinematic motion/timing polish (no Gemini guessing of listing details).
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
    durationSeconds: 2.5,
    transition: pickLuxuryTransition(index),
    motion: pickCinematicMotion(index),
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

  const plan = polishCinematicPlan(
    {
      title: job.listingAddress || 'Featured Listing',
      templateId: 'listing-showcase',
      mood: template.label,
      scenes,
      voiceOverScript,
      suggestedHashtags: hashtags,
      musicMood: 'Modern',
      pacingNotes: 'Luxury listing tour with cinematic camera language and count-up price.',
    },
    media,
  )

  // Re-attach listing overlays after polish (polish only copies core fields via spread)
  plan.scenes = plan.scenes.map((scene) => ({
    ...scene,
    listingPriceText: job.listingPrice || null,
    listingFactsLines: factsLines.length ? factsLines : null,
    textOverlay: null,
    captionLine: null,
  }))

  return { plan, caption, hashtags }
}
