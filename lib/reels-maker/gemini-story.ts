import { GoogleGenAI } from '@google/genai'

import { pickCinematicMotion, normalizeMotion } from '@/lib/reels-maker/cinematic-motion'
import { polishCinematicPlan, pickLuxuryTransition } from '@/lib/reels-maker/cinematic-plan'
import { getReelTemplate } from '@/lib/reels-maker/templates'
import { downloadReelObject } from '@/lib/reels-maker/storage'
import { fitVoiceScriptToScenes } from '@/lib/reels-maker/voice-over'
import type {
  ReelScenePlan,
  ReelStoryPlan,
  ReelTemplateId,
  ReelUploadedMedia,
} from '@/lib/reels-maker/types'

function getGeminiKey() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('Missing GEMINI_API_KEY.')
  return key
}

function splitNarrationLines(script: string, count: number) {
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!sentences.length) return []
  return Array.from({ length: count }, (_, index) => sentences[index % sentences.length])
}

function enrichScenesWithCaptions(
  scenes: ReelScenePlan[],
  voiceOverScript: string,
  socialCaption: string,
): ReelScenePlan[] {
  const narrationLines = splitNarrationLines(voiceOverScript, scenes.length)
  const shortTitles = ['Just Listed', 'Open Spaces', 'City Views', 'Your Next Home', 'Private Showing']

  return scenes.map((scene, index) => {
    const fromOverlay = scene.textOverlay?.trim()
    const fromNarration = narrationLines[index]
      ? narrationLines[index]
          .replace(/[.!?]+$/g, '')
          .split(/\s+/)
          .slice(0, 4)
          .join(' ')
      : null
    const fallbackTitle =
      index === scenes.length - 1
        ? 'Homes.ph'
        : index === 0 && socialCaption
          ? socialCaption.split(/(?<=[.!?])\s+/)[0].split(/\s+/).slice(0, 4).join(' ')
          : shortTitles[index % shortTitles.length]

    return {
      ...scene,
      motion: normalizeMotion(scene.motion) || pickCinematicMotion(index),
      textOverlay: fromOverlay || fromNarration || fallbackTitle,
      captionLine: null,
    }
  })
}

function buildVoiceOverFromBrief(
  reelBrief: string,
  media: ReelUploadedMedia[],
  voiceOverEnabled: boolean,
): string {
  if (!voiceOverEnabled) return ''

  const briefLines = reelBrief
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
    if (spoken) return spoken.endsWith('.') ? spoken : `${spoken}.`
  }

  const notes = media.map((item) => item.userNote?.trim()).filter(Boolean)
  if (notes.length) {
    return `Discover ${notes.slice(0, 3).join(', ')}. A space designed for the life you have been imagining.`
  }

  return 'Every room tells a story. Step inside and see what makes this place special.'
}

function buildFallbackPlan(
  media: ReelUploadedMedia[],
  templateId: ReelTemplateId,
  voiceOverEnabled: boolean,
  socialCaption: string,
  reelBrief = '',
): ReelStoryPlan {
  const template = getReelTemplate(templateId)
  const voiceOverScript = fitVoiceScriptToScenes(
    buildVoiceOverFromBrief(reelBrief, media, voiceOverEnabled),
    media.length,
  )

  const scenes: ReelScenePlan[] = media.map((item, index) => ({
    mediaId: item.id,
    durationSeconds: 2.0,
    transition: pickLuxuryTransition(index),
    motion: pickCinematicMotion(index),
    textOverlay: null,
    captionLine: null,
  }))

  const plan: ReelStoryPlan = {
    title: 'Moments Worth Remembering',
    templateId,
    mood: template.label,
    scenes: enrichScenesWithCaptions(scenes, voiceOverScript, socialCaption),
    voiceOverScript,
    suggestedHashtags: ['#HomesPH', '#RealEstate', '#Memories', '#Reels'],
    musicMood: templateId === 'luxury' ? 'Luxury' : 'Cinematic',
    pacingNotes: 'Luxury cinematic pacing with varied camera language.',
  }

  return polishCinematicPlan(plan, media)
}

function parseStoryJson(raw: string): Partial<ReelStoryPlan> | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  try {
    return JSON.parse(candidate) as Partial<ReelStoryPlan>
  } catch {
    return null
  }
}

function normalizePlan(
  partial: Partial<ReelStoryPlan>,
  media: ReelUploadedMedia[],
  templateId: ReelTemplateId,
  voiceOverEnabled: boolean,
  socialCaption: string,
  reelBrief = '',
): ReelStoryPlan {
  const fallback = buildFallbackPlan(media, templateId, voiceOverEnabled, socialCaption, reelBrief)
  const mediaIds = new Set(media.map((item) => item.id))
  const scenes = (partial.scenes ?? [])
    .filter((scene) => mediaIds.has(scene.mediaId))
    .map((scene, index) => ({
      mediaId: scene.mediaId,
      durationSeconds: Math.max(2, Number(scene.durationSeconds) || fallback.scenes[index]?.durationSeconds || 2.5),
      transition: scene.transition ?? fallback.scenes[index]?.transition ?? pickLuxuryTransition(index),
      motion: normalizeMotion(scene.motion) || pickCinematicMotion(index),
      sceneRole: scene.sceneRole,
      textOverlay: scene.textOverlay ?? null,
      captionLine: null,
    }))

  const used = new Set(scenes.map((scene) => scene.mediaId))
  for (const item of media) {
    if (!used.has(item.id)) {
      scenes.push({
        mediaId: item.id,
        durationSeconds: 2.0,
        transition: pickLuxuryTransition(scenes.length),
        motion: pickCinematicMotion(scenes.length),
        sceneRole: undefined,
        textOverlay: null,
        captionLine: null,
      })
    }
  }

  const voiceOverScript = voiceOverEnabled
    ? fitVoiceScriptToScenes(
        partial.voiceOverScript?.trim() || buildVoiceOverFromBrief(reelBrief, media, true),
        media.length,
      )
    : ''

  const plan: ReelStoryPlan = {
    title: partial.title?.trim() || fallback.title,
    templateId,
    mood: partial.mood?.trim() || fallback.mood,
    scenes: enrichScenesWithCaptions(
      scenes.length ? scenes : fallback.scenes,
      voiceOverScript,
      socialCaption,
    ),
    voiceOverScript,
    suggestedHashtags: partial.suggestedHashtags?.length
      ? partial.suggestedHashtags.slice(0, 12)
      : fallback.suggestedHashtags,
    musicMood: partial.musicMood?.trim() || fallback.musicMood,
    pacingNotes: partial.pacingNotes?.trim() || fallback.pacingNotes,
  }

  return polishCinematicPlan(plan, media)
}

async function buildVisionParts(media: ReelUploadedMedia[]) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

  for (const item of media.slice(0, 8)) {
    if (item.kind !== 'image') continue

    try {
      const buffer = await downloadReelObject(item.bucketName, item.storagePath)
      const mimeType = item.mimeType?.startsWith('image/') ? item.mimeType : 'image/jpeg'
      parts.push({
        inlineData: {
          mimeType,
          data: buffer.toString('base64'),
        },
      })
      parts.push({
        text: [
          `Photo id: ${item.id}`,
          `fileName: ${item.fileName}`,
          item.userNote ? `user description: ${item.userNote}` : 'user description: (none)',
        ].join('\n'),
      })
    } catch (error) {
      console.warn('[reels-maker/gemini-story] vision skip', item.id, error)
    }
  }

  return parts
}

const STORY_MODELS = [
  process.env.GEMINI_REELS_MODEL,
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
].filter((model): model is string => Boolean(model))

async function generateStoryWithGemini(
  ai: GoogleGenAI,
  contents: Parameters<GoogleGenAI['models']['generateContent']>[0]['contents'],
) {
  let lastError: unknown = null

  for (const model of STORY_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
        },
      })
      return { response, model }
    } catch (error) {
      lastError = error
      console.warn(`[reels-maker/gemini-story] model ${model} failed`, error)
    }
  }

  throw lastError ?? new Error('All Gemini story models failed.')
}

export async function generateReelStoryPlan(params: {
  media: ReelUploadedMedia[]
  templateId: ReelTemplateId
  voiceOverEnabled: boolean
  reelBrief?: string
  customCaption?: string
}): Promise<{ plan: ReelStoryPlan; caption: string; hashtags: string[] }> {
  const { media, templateId, voiceOverEnabled } = params
  if (!media.length) {
    throw new Error('At least one media item is required.')
  }

  const template = getReelTemplate(templateId)
  const mediaSummary = media.map((item, index) => ({
    index,
    id: item.id,
    kind: item.kind,
    fileName: item.fileName,
    qualityScore: item.qualityScore,
    width: item.width,
    height: item.height,
    userNote: item.userNote ?? null,
  }))

  const userBrief = params.reelBrief?.trim() || ''
  const captionHint = params.customCaption?.trim() || ''

  const prompt = [
    'You are a senior luxury real estate motion editor (Sotheby\'s / Compass / Serhant caliber).',
    'Create a cinematic vertical Reel (9:16) that feels handcrafted — NEVER a PowerPoint slideshow.',
    'First 2 seconds must hook attention. Strongest / most open exterior shot first.',
    '',
    userBrief
      ? `USER BRIEF (priority — follow these details closely):\n${userBrief}`
      : 'USER BRIEF: (none provided — invent tasteful property storytelling from the photos)',
    captionHint ? `Preferred social caption tone: ${captionHint}` : '',
    '',
    `Template: ${template.label} — ${template.description}`,
    `Voice-over enabled: ${voiceOverEnabled ? 'yes' : 'no'}`,
    '',
    'Return ONLY valid JSON with this shape:',
    JSON.stringify(
      {
        title: 'string',
        mood: 'string',
        musicMood: 'Cinematic | Happy | Emotional | Luxury | Travel | Modern | Inspirational',
        pacingNotes: 'string',
        caption: 'natural social caption, warm, not robotic, max 2 emojis',
        suggestedHashtags: ['#tag1', '#tag2'],
        voiceOverScript: 'exactly one short line per photo, 4-6 words each, plain language',
        scenes: [
          {
            mediaId: 'use exact id from media list',
            durationSeconds: 2.0,
            sceneRole: 'hook | hero | detail | lifestyle | closing',
            transition:
              'cross-dissolve | radial | flash-white | smooth-left | smooth-right | diag-wipe | circle-open | zoom-cut | fade-white | squeeze-h | wind | slide-left | cut | fade',
            motion:
              'gentle-pan-left | gentle-pan-right | reveal-from-top | vertical-drift',
            textOverlay: 'short modern title 1-4 words',
            captionLine: null,
          },
        ],
      },
      null,
      2,
    ),
    '',
    'Rules:',
    '- Put the strongest open / exterior / hero facade FIRST (hook). Do not preserve weak upload order.',
    '- NEVER repeat the same motion twice in a row. Use ONLY straight pans: gentle-pan-left (R→L), gentle-pan-right (L→R), reveal-from-top (T→B), vertical-drift (B→T). No float/circular/dolly.',
    '- NEVER use static. NEVER use float or circular camera motion.',
    '- sceneRole durations: EVERY scene exactly 2.0 seconds.',
    '- Transitions must be short fades/slides (not circle-open / radial). Match pan direction when possible.',
    '- textOverlay: REQUIRED short modern title (1-4 words). captionLine: always null.',
    '- voiceOverScript: when enabled — exactly ONE sentence per photo, 4-6 words. No closing CTA (outro is separate).',
    '- Write in the same language the user used in their brief (English or Filipino/Taglish).',
    '',
    'Media list (metadata):',
    JSON.stringify(mediaSummary, null, 2),
  ]

  const promptText = prompt.join('\n')

  try {
    const ai = new GoogleGenAI({ apiKey: getGeminiKey() })
    const visionParts = await buildVisionParts(media)
    const { response } = await generateStoryWithGemini(ai, [
      { text: promptText },
      ...visionParts,
    ])

    const raw = response.text ?? ''
    const parsed = parseStoryJson(raw)
    if (!parsed) {
      const caption =
        captionHint || userBrief.slice(0, 200) || 'Every picture tells a story, and these moments are worth remembering.'
      const plan = buildFallbackPlan(media, templateId, voiceOverEnabled, caption, userBrief)
      return {
        plan,
        caption,
        hashtags: plan.suggestedHashtags,
      }
    }

    const caption =
      (parsed as { caption?: string }).caption?.trim() ||
      captionHint ||
      userBrief.slice(0, 200) ||
      'Home is more than a place—it is where memories begin.'
    const plan = normalizePlan(parsed, media, templateId, voiceOverEnabled, caption, userBrief)

    return {
      plan,
      caption,
      hashtags: plan.suggestedHashtags,
    }
  } catch (error) {
    console.error('[reels-maker/gemini-story]', error)
    const caption =
      captionHint || userBrief.slice(0, 200) || 'Every picture tells a story, and these moments are worth remembering.'
    const plan = buildFallbackPlan(media, templateId, voiceOverEnabled, caption, userBrief)
    return {
      plan,
      caption,
      hashtags: plan.suggestedHashtags,
    }
  }
}
