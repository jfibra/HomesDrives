import { execFile } from 'child_process'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

import { GoogleGenAI } from '@google/genai'

import { probeWavDurationFromBuffer } from '@/lib/reels-maker/audio-utils'
import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'

const execFileAsync = promisify(execFile)

const WORDS_PER_SECOND = 2.6
const VOICE_BOOKEND_SEC = 1.2
const OUTRO_SEC_BUDGET = 2.2
/** Spoken words for main narration per photo (outro is reserved separately). */
const MAIN_WORDS_PER_SCENE = 4
const MAX_WORDS_PER_LINE = 5
const TTS_RETRY_ATTEMPTS = 3
const TTS_RETRY_DELAY_MS = 1500

const TTS_MODELS = [
  process.env.GEMINI_TTS_MODEL,
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index)

/** Gemini prebuilt voices — firm female / informative male (good for listing narration). */
const VOICE_BY_GENDER = {
  woman: 'Kore',
  man: 'Charon',
} as const

export type VoiceGender = 'man' | 'woman'

export function normalizeVoiceGender(value: unknown): VoiceGender {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (raw === 'man' || raw === 'male' || raw === 'm') return 'man'
  return 'woman'
}

export function resolveTtsVoiceName(gender: VoiceGender = 'woman') {
  return VOICE_BY_GENDER[gender] ?? VOICE_BY_GENDER.woman
}

const OUTRO_CTA_PATTERN =
  /\b(availabl\w*|visit\s+us|inquire|schedule\s+(?:a\s+)?viewing|contact\s+us|homes\.ph|message\s+us)\b/i

export const DEFAULT_OUTRO_LINES = [
  'Available now. Visit us today.',
  'Inquire today on Homes.ph.',
  'Schedule your viewing now.',
] as const

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function targetVoiceDurationSeconds(sceneCount: number, withOutro = true) {
  const count = Math.max(1, sceneCount)
  return count * 3.1 + VOICE_BOOKEND_SEC + (withOutro ? OUTRO_SEC_BUDGET : 0)
}

export function maxMainWordsForScenes(sceneCount: number) {
  return Math.max(6, sceneCount * MAIN_WORDS_PER_SCENE)
}

export function maxVoiceWordsForScenes(sceneCount: number) {
  return maxMainWordsForScenes(sceneCount)
}

function trimSentenceToWordLimit(sentence: string, maxWords: number) {
  const words = sentence.replace(/[.!?]+$/g, '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const trimmed = words.slice(0, maxWords).join(' ').replace(/[,;:]+$/, '')
  return `${trimmed}.`
}

/** One short beat per photo — keeps narration inside the slideshow length. */
export function fitVoiceScriptToScenes(script: string, sceneCount: number): string {
  const count = Math.max(1, sceneCount)
  const cleaned = stripOutroSentencesFromScript(script.trim().replace(/\s+/g, ' '))
  if (!cleaned) return cleaned

  const maxMainWords = maxMainWordsForScenes(count)
  const wordsPerLine = Math.min(
    MAX_WORDS_PER_LINE,
    Math.max(4, Math.floor(maxMainWords / count)),
  )

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!sentences.length) return cleaned

  if (sentences.length >= count) {
    return sentences
      .slice(0, count)
      .map((line) => trimSentenceToWordLimit(line, wordsPerLine))
      .join(' ')
  }

  const allWords = cleaned
    .replace(/[.!?]+/g, '')
    .split(/\s+/)
    .filter(Boolean)
  const lines: string[] = []
  for (let index = 0; index < count; index += 1) {
    const chunk = allWords.slice(index * wordsPerLine, (index + 1) * wordsPerLine)
    if (!chunk.length) break
    lines.push(`${chunk.join(' ')}.`)
  }

  return lines.length ? lines.join(' ') : trimSentenceToWordLimit(sentences[0], wordsPerLine)
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function isValidVoiceBuffer(buffer: Buffer | null | undefined) {
  if (!buffer?.length || buffer.length < 800) return false
  const duration = probeWavDurationFromBuffer(buffer)
  if (duration >= 0.2) return true
  return buffer.length > 4000
}

export function trimVoiceScriptForScenes(script: string, sceneCount: number): string {
  return fitVoiceScriptToScenes(script, sceneCount)
}

export function stripOutroSentencesFromScript(script: string): string {
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (sentences.length <= 1) return script.trim()

  const main = sentences.filter((sentence) => !OUTRO_CTA_PATTERN.test(sentence))
  if (main.length) return main.join(' ')

  return sentences.slice(0, -1).join(' ').trim() || script.trim()
}

export function resolveVoiceOutroLine(options?: {
  customOutro?: string
  reelBrief?: string
}): string {
  const custom = options?.customOutro?.trim()
  if (custom) {
    const normalized = custom.replace(/\s+/g, ' ')
    return /[.!?]"?$/.test(normalized) ? normalized : `${normalized}.`
  }

  const brief = options?.reelBrief?.trim() ?? ''
  if (brief) {
    const lines = brief
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of [...lines].reverse()) {
      if (OUTRO_CTA_PATTERN.test(line) && line.length <= 90) {
        return /[.!?]"?$/.test(line) ? line : `${line}.`
      }
    }
  }

  return DEFAULT_OUTRO_LINES[0]
}

export function buildVoiceOverDisplayScript(mainScript: string, outroLine: string) {
  const main = mainScript.trim()
  if (!main) return `Outro: ${outroLine}`
  return `${main}\n\nOutro: ${outroLine}`
}

function buildSingleShotVoiceText(mainScript: string, outroLine: string) {
  const main = mainScript.trim()
  const outro = outroLine.trim()
  if (!main) return outro
  if (!outro) return main
  return `${main} ${outro}`
}

/** @deprecated */
export function polishVoiceOverScript(script: string, sceneCount = 5): string {
  const main = stripOutroSentencesFromScript(
    trimVoiceScriptForScenes(script.trim().replace(/\s+/g, ' '), sceneCount),
  )
  const outro = resolveVoiceOutroLine()
  return buildVoiceOverDisplayScript(main, outro)
}

async function resolveFfmpegBinary() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  try {
    const ffmpegStatic = await import('ffmpeg-static')
    if (ffmpegStatic.default) return ffmpegStatic.default
  } catch {
    // optional
  }
  return 'ffmpeg'
}

function parsePcmSampleRate(mimeType: string) {
  const rateMatch = mimeType.match(/rate=(\d+)/i)
  if (rateMatch) return Number(rateMatch[1])
  if (/24000/.test(mimeType)) return 24000
  if (/16000/.test(mimeType)) return 16000
  return 24000
}

async function convertToWav(inputBuffer: Buffer, mimeType: string) {
  if (inputBuffer.length >= 4 && inputBuffer.toString('ascii', 0, 4) === 'RIFF') {
    return inputBuffer
  }
  if (mimeType.includes('wav')) return inputBuffer

  const sampleRate = parsePcmSampleRate(mimeType)
  const workDir = await mkdtemp(join(tmpdir(), 'reels-voice-'))
  const inputPath = join(workDir, 'voice.raw')
  const outputPath = join(workDir, 'voice.wav')
  const ffmpeg = await resolveFfmpegBinary()

  try {
    await writeFile(inputPath, inputBuffer)
    await execFileAsync(
      ffmpeg,
      [
        '-y',
        '-f',
        's16le',
        '-ar',
        String(sampleRate),
        '-ac',
        '1',
        '-i',
        inputPath,
        outputPath,
      ],
      { maxBuffer: 1024 * 1024 * 32 },
    )
    return readFile(outputPath)
  } finally {
    await safeRemoveDir(workDir)
  }
}

function buildTtsPrompt(spokenText: string, sceneCount: number) {
  const targetSeconds = targetVoiceDurationSeconds(sceneCount, true)
  const maxWords = countWords(spokenText)
  return [
    'Read this real estate reel script aloud.',
    `HARD LIMIT: ${Math.round(targetSeconds)} seconds total, about ${maxWords} words — do not run long.`,
    'Steady pace, one quick beat per idea. Slow down only on the very last sentence (the outro).',
    '',
    spokenText.trim(),
  ].join('\n')
}

type GeminiPart = {
  inlineData?: { data?: string; mimeType?: string }
  text?: string
}

function extractAudioPart(response: {
  candidates?: Array<{
    finishReason?: string
    content?: { parts?: GeminiPart[] }
  }>
}) {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return { inlineData: part.inlineData, finishReason: candidate.finishReason }
      }
    }
  }
  return null
}

async function synthesizeVoiceLineOnce(
  spokenText: string,
  sceneCount: number,
  model: string,
  voiceName: string,
): Promise<Buffer | null> {
  const trimmed = spokenText.trim()
  if (!trimmed) return null

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const ai = new GoogleGenAI({ apiKey })
  const prompt = buildTtsPrompt(trimmed, sceneCount)

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  })

  const extracted = extractAudioPart(response)
  if (!extracted?.inlineData?.data) {
    const finishReason = response.candidates?.[0]?.finishReason ?? 'unknown'
    const textPart = response.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text
    console.warn(`[reels-maker/voice-over] ${model} no audio (finish=${finishReason})`, textPart?.slice(0, 120))
    return null
  }

  const raw = Buffer.from(extracted.inlineData.data, 'base64')
  const mimeType = extracted.inlineData.mimeType || 'audio/L16;rate=24000'
  const wav = await convertToWav(raw, mimeType)

  if (!isValidVoiceBuffer(wav)) {
    console.warn(
      `[reels-maker/voice-over] ${model} produced invalid wav (${wav.length} bytes, ${probeWavDurationFromBuffer(wav).toFixed(2)}s)`,
    )
    return null
  }

  return wav
}

async function synthesizeVoiceLine(
  spokenText: string,
  sceneCount: number,
  voiceName: string,
): Promise<Buffer | null> {
  let lastError: unknown = null

  for (const model of TTS_MODELS) {
    for (let attempt = 0; attempt < TTS_RETRY_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await sleep(TTS_RETRY_DELAY_MS * attempt)
      }

      try {
        const wav = await synthesizeVoiceLineOnce(spokenText, sceneCount, model, voiceName)
        if (wav) {
          console.info(`[reels-maker/voice-over] synthesized with ${model} voice=${voiceName}`)
          return wav
        }
        lastError = new Error(`${model} returned no usable audio.`)
      } catch (error) {
        lastError = error
        console.warn(`[reels-maker/voice-over] ${model} attempt ${attempt + 1} failed`, error)
      }
    }
  }

  console.error('[reels-maker/voice-over]', lastError)
  return null
}

export async function generateVoiceOverAudio(
  script: string,
  sceneCount = 5,
  options?: {
    outroLine?: string
    reelBrief?: string
    includeOutro?: boolean
    voiceGender?: VoiceGender | 'male' | 'female' | string
  },
): Promise<Buffer | null> {
  const includeOutro = options?.includeOutro !== false
  const voiceName = resolveTtsVoiceName(normalizeVoiceGender(options?.voiceGender))
  const mainScript = fitVoiceScriptToScenes(
    stripOutroSentencesFromScript(script.trim().replace(/\s+/g, ' ')),
    sceneCount,
  )

  const outroLine = resolveVoiceOutroLine({
    customOutro: options?.outroLine,
    reelBrief: options?.reelBrief,
  })

  const spokenText = includeOutro
    ? buildSingleShotVoiceText(mainScript, outroLine)
    : mainScript.trim()

  if (!spokenText) return null

  const withOutro = await synthesizeVoiceLine(spokenText, sceneCount, voiceName)
  if (withOutro) return withOutro

  if (includeOutro && mainScript.trim()) {
    console.warn('[reels-maker/voice-over] Single-take with outro failed — retrying narration only.')
    return synthesizeVoiceLine(mainScript, sceneCount, voiceName)
  }

  return null
}
