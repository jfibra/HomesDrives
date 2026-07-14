import { GoogleGenAI } from '@google/genai'

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

function pickMotion(index: number): ReelScenePlan['motion'] {
  if (index % 5 === 2) return 'slow-zoom-in'
  return 'static'
}

function enrichScenesWithCaptions(
  scenes: ReelScenePlan[],
  voiceOverScript: string,
  socialCaption: string,
): ReelScenePlan[] {
  // Voiceover script may inform scene titles; bottom karaoke captions are not burned in.
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
      motion:
        scene.motion === 'gentle-pan-left' || scene.motion === 'gentle-pan-right'
          ? pickMotion(index)
          : scene.motion || pickMotion(index),
      // Modern bottom title only — no burned-in subtitle/karaoke line
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
    durationSeconds: Number(
      (template.defaultSceneDuration + (index % 3 === 0 ? 0.4 : index % 2 === 0 ? -0.3 : 0)).toFixed(2),
    ),
    transition: pickTransition(index),
    motion: pickMotion(index),
    textOverlay: index === media.length - 1 ? 'Your Story' : null,
    captionLine: null,
  }))

  return {
    title: 'Moments Worth Remembering',
    templateId,
    mood: template.label,
    scenes: enrichScenesWithCaptions(scenes, voiceOverScript, socialCaption),
    voiceOverScript,
    suggestedHashtags: ['#HomesPH', '#RealEstate', '#Memories', '#Reels'],
    musicMood: templateId === 'luxury' ? 'Luxury' : 'Cinematic',
    pacingNotes: 'Balanced cinematic pacing with gentle motion.',
  }
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
      durationSeconds: Math.min(
        5.5,
        Math.max(3.2, Number(scene.durationSeconds) || fallback.scenes[index]?.durationSeconds || 3.8),
      ),
      transition: scene.transition ?? fallback.scenes[index]?.transition ?? pickTransition(index),
      motion: scene.motion ?? fallback.scenes[index]?.motion ?? pickMotion(index),
      textOverlay: scene.textOverlay ?? null,
      // Karaoke bottom captions are never burned in; keep null even if the model returns one.
      captionLine: null,
    }))

  const used = new Set(scenes.map((scene) => scene.mediaId))
  for (const item of media) {
    if (!used.has(item.id)) {
      scenes.push({
        mediaId: item.id,
        durationSeconds: getReelTemplate(templateId).defaultSceneDuration,
        transition: pickTransition(scenes.length),
        motion: pickMotion(scenes.length),
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

  return {
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
    'You are a senior social media video editor for Homes.ph real estate and lifestyle content.',
    'Create a cinematic vertical Reel story plan (9:16) from the uploaded photos/videos.',
    'Do NOT create a robotic slideshow. Build emotional flow: opening → highlights → emotional beats → closing.',
    '',
    '=== USER BRIEF (highest priority) ===',
    userBrief ||
      'No detailed brief provided. Infer a warm, professional story from the photos and template.',
  ]

  if (captionHint) {
    prompt.push('', '=== USER CAPTION HINT ===', captionHint)
  }

  prompt.push(
    '',
    'Your job:',
    '- Look at each photo and understand what is shown (room, exterior, people, amenities, location, etc.).',
    '- Combine the user brief with what you see in the images.',
    '- Enhance rough user notes into polished, natural copy (fix grammar, add emotional warmth).',
    '- Match each scene caption to the actual photo content — never generic filler.',
    '- If the user mentions property details (bedrooms, price, location), weave them in naturally.',
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
            durationSeconds: 2.5,
            transition:
              'fade | cross-dissolve | cut | zoom-cut | slide-left | slide-right | wipe-up | smooth-zoom',
            motion: 'slow-zoom-in | slow-zoom-out | gentle-pan-left | gentle-pan-right | static',
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
    '- Use each media id at most once unless fewer than 4 assets (then you may repeat best shots).',
    '- Vary durations between 3.2 and 5.5 seconds — slow, cinematic holds (not a fast slideshow).',
    '- Avoid repeating the same transition more than twice in a row.',
    '- Mix transitions like zoom-cut, slide-left, cross-dissolve, and wipe-up for a pro reel feel.',
    '- textOverlay: REQUIRED short modern title (1-4 words) burned at the BOTTOM of each scene — elegant, property-focused (e.g. "Just Listed", "Pool Deck", "City Views"). Do NOT write full sentences.',
    '- captionLine: always null. Do not write bottom karaoke/subtitle lines — voiceover is audio-only.',
    '- Prefer motion "static" or "slow-zoom-in" — avoid pans unless necessary.',
    '- Prioritize higher qualityScore items earlier.',
    '- voiceOverScript: REQUIRED when voice-over is enabled — exactly ONE sentence per photo, 4-6 words each (plain, specific, no filler adjectives). Use exactly as many sentences as photos. Do NOT include a closing call-to-action; outro is added automatically.',
    '- Write in the same language the user used in their brief (English or Filipino/Taglish).',
    '',
    'Media list (metadata):',
    JSON.stringify(mediaSummary, null, 2),
  )

  const promptText = prompt.join('\n')

  try {
    const ai = new GoogleGenAI({ apiKey: getGeminiKey() })
    const visionParts = await buildVisionParts(media)
    const contents =
      visionParts.length > 0
        ? [
            {
              role: 'user' as const,
              parts: [{ text: promptText }, ...visionParts],
            },
          ]
        : promptText

    const { response, model } = await generateStoryWithGemini(ai, contents)
    console.info(`[reels-maker/gemini-story] using model ${model}`)

    const text = response.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text ?? ''
    const parsed = parseStoryJson(text)
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
