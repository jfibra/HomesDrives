import { existsSync } from 'fs'
import { join } from 'path'

import type { ReelScenePlan } from '@/lib/reels-maker/types'

const FONTS_DIR = join(process.cwd(), 'lib', 'reels-maker', 'fonts')

export const TITLE_COLOR = '0xFFF8E7'
export const TITLE_ACCENT = '0xD4AF37'
export const CAPTION_COLOR = 'white'

const FONT_CANDIDATES = {
  title: [
    join(FONTS_DIR, 'PlayfairDisplay-Bold.ttf'),
    'C:/Windows/Fonts/georgiab.ttf',
    'C:/Windows/Fonts/timesbd.ttf',
    '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
  ],
  body: [
    join(FONTS_DIR, 'Montserrat-SemiBold.ttf'),
    'C:/Windows/Fonts/segoeuib.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ],
  brand: [
    join(FONTS_DIR, 'Montserrat-Bold.ttf'),
    'C:/Windows/Fonts/segoeuisb.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ],
}

export type SceneTextOptions = {
  durationSeconds: number
  sceneIndex: number
  reelTitle?: string
  isFirst?: boolean
  isLast?: boolean
}

export function escapeDrawText(value: string) {
  return value
    // Replace peso sign with plain P — drawtext fonts lack this Unicode glyph
    .replace(/₱/g, 'P')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    // Inside FFmpeg single-quoted strings, ' closes the quote — \' does NOT escape it.
    // Use close-quote + level-1 escaped quote + open-quote: Alabang'\''s
    .replace(/'/g, "'\\''")
    .replace(/%/g, '\\%')
}

function escapeFontPath(filePath: string) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/ /g, '\\ ')
}

function resolveFontPath(candidates: string[]) {
  for (const fullPath of candidates) {
    if (existsSync(fullPath)) return escapeFontPath(fullPath)
  }
  return null
}

export function fontParam(kind: keyof typeof FONT_CANDIDATES) {
  const path = resolveFontPath(FONT_CANDIDATES[kind])
  return path ? `fontfile='${path}'` : "font='Arial'"
}

export function fadeIn(delay: number, duration: number) {
  return `if(lt(t\\,${delay})\\,0\\,if(lt(t\\,${delay + duration})\\,(t-${delay})/${duration}\\,1))`
}

export function slideUp(baseYRatio: number, distance: number, delay: number, duration: number) {
  return `h*${baseYRatio}+${distance}*(1-min(1\\,max(0\\,t-${delay})/${duration}))`
}

function wrapTitle(text: string, maxLength = 28) {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxLength && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 2)
}

function buildGradientPanelFilters(durationSeconds: number, entranceDelay: number) {
  const end = durationSeconds.toFixed(2)
  const start = entranceDelay.toFixed(2)
  // Soft bottom veil — modern lower-third without a heavy bar
  const bands = [
    { y: 0.58, alpha: 0.04 },
    { y: 0.66, alpha: 0.1 },
    { y: 0.74, alpha: 0.2 },
    { y: 0.82, alpha: 0.34 },
    { y: 0.9, alpha: 0.48 },
  ]
  return bands.map(
    (band) =>
      `drawbox=x=0:y=ih*${band.y}:w=iw:h=ih*${(1 - band.y).toFixed(2)}:color=black@${band.alpha}:t=fill:enable='between(t\\,${start}\\,${end})'`,
  )
}

/** Expanding gold accent line under the title block. */
function buildAccentReveal(durationSeconds: number, delay: number, yRatio: number) {
  const end = durationSeconds.toFixed(2)
  const start = delay.toFixed(2)
  const grow = `min(280\\,280*min(1\\,max(0\\,t-${delay})/0.55))`
  return `drawbox=x='(iw-${grow})/2':y=ih*${yRatio}:w='${grow}':h=3:color=${TITLE_ACCENT}@0.95:t=fill:enable='between(t\\,${start}\\,${end})'`
}

type ParsedPrice = {
  prefix: string
  value: number
  suffix: string
  original: string
}

/**
 * Parse common listing price forms: "P18,000,000", "₱12.5M", "PHP 8.2M", "18000000".
 * Returns null when no usable number is found (static text fallback).
 * Strict enough to ignore addresses / bed counts (e.g. "12 Mabini", "3 Beds").
 */
export function parseListingPrice(raw: string): ParsedPrice | null {
  const original = raw.trim()
  if (!original) return null

  const compact = original.replace(/\s+/g, ' ')
  const hasCurrency = /(?:^|\b)(P|₱|PHP|USD|\$)/i.test(compact)
  const hasCompactSuffix = /\d(?:\.\d+)?\s*[MKB]\b/i.test(compact)
  const hasGroupedCommas = /\d{1,3}(,\d{3})+/.test(compact)
  const plainDigits = compact.match(/^\D*(\d+)\D*$/)
  const plainLarge = plainDigits ? Number(plainDigits[1]) >= 10_000 : false

  if (!hasCurrency && !hasCompactSuffix && !hasGroupedCommas && !plainLarge) {
    return null
  }

  const suffixMatch = compact.match(/(\d[\d,]*(?:\.\d+)?)\s*([MKB])\b/i)
  const suffix = suffixMatch?.[2]?.toUpperCase() ?? ''

  let multiplier = 1
  if (suffix === 'K') multiplier = 1_000
  if (suffix === 'M') multiplier = 1_000_000
  if (suffix === 'B') multiplier = 1_000_000_000

  const numericToken = (suffixMatch?.[1] ?? compact.match(/(\d[\d,]*(?:\.\d+)?)/)?.[1]) ?? null
  if (!numericToken) return null

  const base = Number(numericToken.replace(/,/g, ''))
  if (!Number.isFinite(base) || base <= 0) return null

  const value = Math.round(base * multiplier)
  if (value < 1_000 && !hasCurrency) return null

  const prefixMatch = compact.match(/^([^\d]*)/)
  let prefix = (prefixMatch?.[1] ?? '').trim()
  if (!prefix || /php/i.test(prefix) || prefix === '₱' || prefix === '$') prefix = 'P'
  if (prefix && !/[P₱]$/i.test(prefix) && !prefix.endsWith(' ')) prefix = `${prefix} `

  return { prefix, value, suffix: '', original }
}

function formatPriceAmount(value: number) {
  return Math.round(value).toLocaleString('en-US')
}

function formatPriceLabel(parsed: ParsedPrice, value: number) {
  return `${parsed.prefix}${formatPriceAmount(value)}`.replace(/\s+/g, ' ').trim()
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Count-up price: stepped drawtext frames with ease-out, then hold the final amount.
 * Falls back to a static fade/slide when the string is not a parseable price.
 */
function buildPriceCountUpFilters(params: {
  priceText: string
  durationSeconds: number
  entranceDelay: number
  yRatio?: number
  fontSize?: number
}) {
  const {
    priceText,
    durationSeconds,
    entranceDelay,
    yRatio = 0.78,
    fontSize = 68,
  } = params
  const filters: string[] = []
  const titleFont = fontParam('title')
  const end = durationSeconds.toFixed(2)
  const parsed = parseListingPrice(priceText)
  const countStart = entranceDelay + 0.08
  const countDuration = Math.min(1.35, Math.max(0.9, durationSeconds * 0.35))
  const holdFrom = countStart + countDuration

  if (!parsed) {
    const fade = fadeIn(countStart, 0.5)
    const yExpr = slideUp(yRatio, 30, countStart, 0.55)
    filters.push(
      `drawtext=${titleFont}:text='${escapeDrawText(priceText)}':fontcolor=${TITLE_COLOR}:fontsize=${fontSize}:x=(w-text_w)/2:y='${yExpr}':alpha='${fade}':shadowcolor=black@0.85:shadowx=3:shadowy=3:borderw=2:bordercolor=${TITLE_ACCENT}@0.8`,
    )
    return filters
  }

  const steps = 14
  const startValue = Math.max(0, Math.round(parsed.value * 0.42))

  for (let i = 0; i < steps; i++) {
    const progress = easeOutCubic((i + 1) / steps)
    const value = Math.round(startValue + (parsed.value - startValue) * progress)
    const t0 = countStart + (i / steps) * countDuration
    const t1 = countStart + ((i + 1) / steps) * countDuration
    const label = formatPriceLabel(parsed, value)
    // Slight upward settle while counting
    const lift = (1 - progress) * 18
    filters.push(
      `drawtext=${titleFont}:text='${escapeDrawText(label)}':fontcolor=${TITLE_COLOR}:fontsize=${fontSize}:x=(w-text_w)/2:y=h*${yRatio}+${lift.toFixed(1)}:alpha=1:shadowcolor=black@0.85:shadowx=3:shadowy=3:borderw=2:bordercolor=${TITLE_ACCENT}@0.8:enable='between(t\\,${t0.toFixed(3)}\\,${t1.toFixed(3)})'`,
    )
  }

  const finalLabel = formatPriceLabel(parsed, parsed.value)
  const holdFade = fadeIn(holdFrom, 0.01)
  filters.push(
    `drawtext=${titleFont}:text='${escapeDrawText(finalLabel)}':fontcolor=${TITLE_COLOR}:fontsize=${fontSize}:x=(w-text_w)/2:y=h*${yRatio}:alpha='${holdFade}':shadowcolor=black@0.85:shadowx=3:shadowy=3:borderw=2:bordercolor=${TITLE_ACCENT}@0.85:enable='between(t\\,${holdFrom.toFixed(3)}\\,${end})'`,
  )

  // Soft pulse underline after count settles
  filters.push(buildAccentReveal(durationSeconds, holdFrom + 0.05, yRatio + 0.07))

  return filters
}

/**
 * Modern lower-third title — slide-up + fade, soft veil, gold accent reveal.
 * Replaces the old top-of-frame title treatment. Karaoke captions are not burned in.
 */
function buildBottomTitleFilters(
  title: string,
  durationSeconds: number,
  isHero: boolean,
  entranceDelay = 0.1,
) {
  const filters: string[] = []
  const titleLines = wrapTitle(title)
  const titleFont = fontParam('title')
  const brandFont = fontParam('brand')
  const fade = fadeIn(entranceDelay, 0.5)
  const end = durationSeconds.toFixed(2)

  const titleSize = isHero
    ? titleLines[0].length > 28
      ? 44
      : titleLines[0].length > 18
        ? 52
        : 58
    : titleLines[0].length > 28
      ? 40
      : 48

  filters.push(...buildGradientPanelFilters(durationSeconds, entranceDelay))

  if (isHero) {
    const brandDelay = Math.max(0.05, entranceDelay)
    const brandFade = fadeIn(brandDelay, 0.4)
    const brandY = slideUp(0.7, 22, brandDelay, 0.45)
    filters.push(
      `drawtext=${brandFont}:text='Homes.ph':fontcolor=${TITLE_ACCENT}@0.98:fontsize=24:x=(w-text_w)/2:y='${brandY}':alpha='${brandFade}':shadowcolor=black@0.5:shadowx=1:shadowy=1`,
    )
  }

  const titleBaseY = isHero ? 0.78 : 0.8
  titleLines.forEach((line, lineIndex) => {
    const lineDelay = entranceDelay + (isHero ? 0.12 : 0.05) + lineIndex * 0.08
    const yExpr = slideUp(titleBaseY + lineIndex * 0.05, 34, lineDelay, 0.55)
    const lineFade = fadeIn(lineDelay, 0.5)
    filters.push(
      `drawtext=${titleFont}:text='${escapeDrawText(line)}':fontcolor=${TITLE_COLOR}:fontsize=${titleSize}:x=(w-text_w)/2:y='${yExpr}':alpha='${lineFade}':shadowcolor=black@0.82:shadowx=3:shadowy=3:borderw=2:bordercolor=${TITLE_ACCENT}@0.7:line_spacing=6`,
    )
  })

  const accentDelay = entranceDelay + (isHero ? 0.35 : 0.25)
  const accentY = titleBaseY + titleLines.length * 0.05 + 0.015
  filters.push(buildAccentReveal(durationSeconds, accentDelay, accentY))

  // Tiny hold mark so the lower-third feels finished
  filters.push(
    `drawbox=x=(iw-6)/2:y=ih*${(accentY + 0.025).toFixed(3)}:w=6:h=6:color=${TITLE_ACCENT}@0.9:t=fill:enable='between(t\\,${(accentDelay + 0.45).toFixed(2)}\\,${end})'`,
  )

  return filters
}

/** Listing Showcase: animated count-up price + address/facts lower-third. */
export function buildListingDetailsFilters(scene: ReelScenePlan, options: SceneTextOptions) {
  const filters: string[] = []
  const { durationSeconds, isFirst = false } = options
  const entranceDelay = isFirst ? 0.45 : 0.1
  const bodyFont = fontParam('body')

  filters.push(...buildGradientPanelFilters(durationSeconds, entranceDelay))

  const price = scene.listingPriceText?.trim()
  if (price) {
    filters.push(
      ...buildPriceCountUpFilters({
        priceText: price,
        durationSeconds,
        entranceDelay,
        yRatio: 0.76,
        fontSize: 68,
      }),
    )
  }

  const factsLines = (scene.listingFactsLines ?? []).filter((line): line is string => Boolean(line?.trim()))
  factsLines.forEach((line, lineIndex) => {
    const lineDelay = entranceDelay + 1.45 + lineIndex * 0.12
    const fade = fadeIn(lineDelay, 0.4)
    const baseY = 0.88 + lineIndex * 0.045
    const yExpr = slideUp(baseY, 20, lineDelay, 0.4)
    filters.push(
      `drawtext=${bodyFont}:text='${escapeDrawText(line)}':fontcolor=${CAPTION_COLOR}@0.95:fontsize=30:x=(w-text_w)/2:y='${yExpr}':alpha='${fade}':shadowcolor=black@0.75:shadowx=2:shadowy=2`,
    )
  })

  return filters.length ? `,${filters.join(',')}` : ''
}

/**
 * Scene titles as a modern bottom lower-third.
 * Bottom karaoke / narration subtitles (`captionLine`) are intentionally not burned in —
 * voiceover stays audio-only. Price-like titles get a count-up treatment.
 */
export function buildAnimatedTextFilters(scene: ReelScenePlan, options: SceneTextOptions) {
  const filters: string[] = []
  const { sceneIndex, reelTitle, isFirst = false, durationSeconds } = options
  const entranceDelay = isFirst ? 0.45 : 0.12
  const overlay = scene.textOverlay?.trim()
  const title = sceneIndex === 0 && reelTitle?.trim() ? reelTitle.trim() : overlay
  const resolved = title || overlay

  if (!resolved) {
    return ''
  }

  // If the lower-third is a price string, use the counting animation instead of plain title type.
  if (parseListingPrice(resolved)) {
    filters.push(...buildGradientPanelFilters(durationSeconds, entranceDelay))
    filters.push(
      ...buildPriceCountUpFilters({
        priceText: resolved,
        durationSeconds,
        entranceDelay,
        yRatio: 0.8,
        fontSize: sceneIndex === 0 ? 64 : 56,
      }),
    )
  } else {
    filters.push(...buildBottomTitleFilters(resolved, durationSeconds, sceneIndex === 0, entranceDelay))
  }

  return filters.length ? `,${filters.join(',')}` : ''
}
