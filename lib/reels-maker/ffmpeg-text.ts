import { existsSync } from 'fs'
import { join } from 'path'

import type { ReelScenePlan } from '@/lib/reels-maker/types'

const FONTS_DIR = join(process.cwd(), 'lib', 'reels-maker', 'fonts')

/** Title text on blue panels — crisp white */
export const TITLE_COLOR = '0xFFFFFF'
/** Yellow-gold accent (ribbons, edges, chips) */
export const TITLE_ACCENT = '0xE8C34A'
export const CAPTION_COLOR = 'white'
/** Deep blue for abstract panels (replaces soft black bands) */
export const BLUE_PRIMARY = '0x0B3D6E'
export const BLUE_DEEP = '0x062848'
export const GOLD = '0xE8C34A'

/** Prefer static TTFs — variable fonts can hang/stall FFmpeg drawtext on some EC2 builds. */
const FONT_CANDIDATES = {
  title: [
    join(FONTS_DIR, 'PlayfairDisplay-Bold.ttf'),
    join(FONTS_DIR, 'Montserrat-SemiBold.ttf'),
    join(FONTS_DIR, 'PlusJakartaSans-VF.ttf'),
    'C:/Windows/Fonts/georgiab.ttf',
    '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
  ],
  body: [
    join(FONTS_DIR, 'Montserrat-SemiBold.ttf'),
    join(FONTS_DIR, 'Manrope-VF.ttf'),
    'C:/Windows/Fonts/segoeuib.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ],
  brand: [
    join(FONTS_DIR, 'Montserrat-SemiBold.ttf'),
    join(FONTS_DIR, 'PlayfairDisplay-Bold.ttf'),
    join(FONTS_DIR, 'Manrope-VF.ttf'),
    join(FONTS_DIR, 'PlusJakartaSans-VF.ttf'),
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
  sceneRole?: string
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

function wrapTitle(text: string, maxLength = 26) {
  const words = text.trim().toUpperCase().split(/\s+/)
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

function enableBetween(start: number, end: number) {
  return `enable='between(t\\,${start.toFixed(2)}\\,${end.toFixed(2)})'`
}

/**
 * Refined lower-third titles — blue + yellow-gold accents.
 * Deliberately light: soft veil + thin gold line + clean type.
 * Avoids solid slabs, top ribbons under the logo, and full-frame borders.
 */
function buildAbstractTitleFilters(
  title: string,
  durationSeconds: number,
  layoutIndex: number,
  entranceDelay: number,
  subtitle?: string | null,
) {
  const filters: string[] = []
  const titleLines = wrapTitle(title, 24)
  const titleFont = fontParam('body') // modern sans reads cleaner for uppercase scene titles
  const bodyFont = fontParam('body')
  const end = durationSeconds
  const start = entranceDelay
  const en = enableBetween(start, end)
  const sub = subtitle?.trim() ? subtitle.trim().slice(0, 42).toUpperCase() : null

  const titleSize =
    titleLines[0].length > 20 ? 36 : titleLines[0].length > 14 ? 42 : 48

  const variant = layoutIndex % 3

  // Soft bottom veil shared by all variants (never a solid opaque wall)
  filters.push(
    `drawbox=x=0:y='ih*0.78':w=iw:h='ih*0.22':color=${BLUE_DEEP}@0.42:t=fill:${en}`,
    `drawbox=x=0:y='ih*0.86':w=iw:h='ih*0.14':color=${BLUE_PRIMARY}@0.38:t=fill:${en}`,
  )

  if (variant === 0) {
    // Centered editorial — gold hairline + small gold ticks
    filters.push(
      `drawbox=x='(iw-220)/2':y='ih*0.84':w=220:h=3:color=${GOLD}@0.95:t=fill:${en}`,
      `drawbox=x='iw*0.08':y='ih*0.92':w=14:h=14:color=${GOLD}@0.9:t=fill:${en}`,
      `drawbox=x='iw*0.92-14':y='ih*0.92':w=14:h=14:color=${GOLD}@0.9:t=fill:${en}`,
    )
    titleLines.forEach((line, lineIndex) => {
      const lineDelay = entranceDelay + 0.08 + lineIndex * 0.06
      const y = `h*${0.795 + lineIndex * 0.035}`
      filters.push(
        `drawtext=${titleFont}:text='${escapeDrawText(line)}':fontcolor=${TITLE_COLOR}:fontsize=${titleSize}:x=(w-text_w)/2:y='${y}':alpha='${fadeIn(lineDelay, 0.35)}':shadowcolor=black@0.55:shadowx=2:shadowy=2`,
      )
    })
    if (sub) {
      filters.push(
        `drawtext=${bodyFont}:text='${escapeDrawText(sub)}':fontcolor=${GOLD}:fontsize=20:x=(w-text_w)/2:y='h*0.895':alpha='${fadeIn(entranceDelay + 0.22, 0.35)}':shadowcolor=black@0.45:shadowx=1:shadowy=1`,
      )
    }
  } else if (variant === 1) {
    // Left accent bar — thin blue rail + gold L-bracket
    filters.push(
      `drawbox=x='iw*0.06':y='ih*0.80':w=5:h='ih*0.12':color=${BLUE_PRIMARY}@0.95:t=fill:${en}`,
      `drawbox=x='iw*0.06':y='ih*0.80':w=28:h=4:color=${GOLD}@0.95:t=fill:${en}`,
      `drawbox=x='iw*0.06':y='ih*0.92':w=28:h=4:color=${GOLD}@0.95:t=fill:${en}`,
      `drawbox=x='iw*0.06':y='ih*0.80':w=4:h=28:color=${GOLD}@0.95:t=fill:${en}`,
    )
    titleLines.forEach((line, lineIndex) => {
      const lineDelay = entranceDelay + 0.1 + lineIndex * 0.06
      filters.push(
        `drawtext=${titleFont}:text='${escapeDrawText(line)}':fontcolor=${TITLE_COLOR}:fontsize=${titleSize}:x='w*0.10':y='h*${0.81 + lineIndex * 0.038}':alpha='${fadeIn(lineDelay, 0.35)}':shadowcolor=black@0.5:shadowx=2:shadowy=2`,
      )
    })
    if (sub) {
      filters.push(
        `drawtext=${bodyFont}:text='${escapeDrawText(sub)}':fontcolor=${GOLD}:fontsize=20:x='w*0.10':y='h*0.905':alpha='${fadeIn(entranceDelay + 0.24, 0.35)}':shadowcolor=black@0.4:shadowx=1:shadowy=1`,
      )
    }
  } else {
    // Floating gold pill under title — no top ribbon, no blue frame
    const pillY = titleLines.length > 1 ? 0.875 : 0.86
    filters.push(
      `drawbox=x='iw*0.18':y='ih*${pillY}':w='iw*0.64':h=3:color=${GOLD}@0.92:t=fill:${en}`,
      `drawbox=x='iw*0.18':y='ih*${pillY}':w=18:h=18:color=${GOLD}@0.95:t=fill:${en}`,
      `drawbox=x='iw*0.82-18':y='ih*${pillY}':w=18:h=18:color=${BLUE_PRIMARY}@0.9:t=fill:${en}`,
    )
    titleLines.forEach((line, lineIndex) => {
      const lineDelay = entranceDelay + 0.1 + lineIndex * 0.06
      filters.push(
        `drawtext=${titleFont}:text='${escapeDrawText(line)}':fontcolor=${TITLE_COLOR}:fontsize=${titleSize}:x=(w-text_w)/2:y='h*${0.80 + lineIndex * 0.035}':alpha='${fadeIn(lineDelay, 0.35)}':shadowcolor=black@0.55:shadowx=2:shadowy=2`,
      )
    })
    if (sub) {
      filters.push(
        `drawtext=${bodyFont}:text='${escapeDrawText(sub)}':fontcolor=0xF5F7FA:fontsize=20:x=(w-text_w)/2:y='h*0.91':alpha='${fadeIn(entranceDelay + 0.24, 0.35)}':shadowcolor=black@0.5:shadowx=1:shadowy=1`,
      )
    }
  }

  return filters
}

/** Soft blue wash behind listing price (not solid slabs). */
function buildListingVeilFilters(durationSeconds: number, entranceDelay: number) {
  const end = durationSeconds.toFixed(2)
  const start = entranceDelay.toFixed(2)
  return [
    `drawbox=x=0:y=ih*0.72:w=iw:h=ih*0.28:color=${BLUE_DEEP}@0.4:t=fill:enable='between(t\\,${start}\\,${end})'`,
    `drawbox=x=0:y=ih*0.72:w=iw:h=4:color=${GOLD}@0.9:t=fill:enable='between(t\\,${start}\\,${end})'`,
  ]
}

/** Expanding gold accent line. */
function buildAccentReveal(durationSeconds: number, delay: number, yRatio: number) {
  const end = durationSeconds.toFixed(2)
  const start = delay.toFixed(2)
  const grow = `min(320\\,320*min(1\\,max(0\\,t-${delay})/0.45))`
  return `drawbox=x='(iw-${grow})/2':y=ih*${yRatio}:w='${grow}':h=5:color=${GOLD}@0.95:t=fill:enable='between(t\\,${start}\\,${end})'`
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
 * Abstract blue + yellow-gold title graphics — light lower-thirds only.
 * Replaces heavy solid panels / top gold ribbons / full-frame borders.
 */
function buildBottomTitleFilters(
  title: string,
  durationSeconds: number,
  isHero: boolean,
  entranceDelay = 0.1,
  subtitle?: string | null,
  layoutIndex = 0,
) {
  void isHero
  return buildAbstractTitleFilters(title, durationSeconds, layoutIndex, entranceDelay, subtitle)
}

/** Listing Showcase: animated count-up price + address + feature chips. */
export function buildListingDetailsFilters(scene: ReelScenePlan, options: SceneTextOptions) {
  const filters: string[] = []
  const { durationSeconds, isFirst = false } = options
  const entranceDelay = isFirst ? 0.35 : 0.08
  const bodyFont = fontParam('body')
  const brandFont = fontParam('brand')
  const end = durationSeconds.toFixed(2)

  filters.push(...buildListingVeilFilters(durationSeconds, entranceDelay))

  const price = scene.listingPriceText?.trim()
  if (price) {
    filters.push(
      ...buildPriceCountUpFilters({
        priceText: price,
        durationSeconds,
        entranceDelay,
        yRatio: 0.72,
        fontSize: 64,
      }),
    )
  }

  const factsLines = (scene.listingFactsLines ?? []).filter((line): line is string => Boolean(line?.trim()))
  const address = factsLines[0]
  const factsRaw = factsLines[1] ?? ''

  if (address) {
    const lineDelay = entranceDelay + 1.35
    const fade = fadeIn(lineDelay, 0.4)
    const yExpr = slideUp(0.84, 18, lineDelay, 0.4)
    filters.push(
      `drawtext=${bodyFont}:text='${escapeDrawText(address)}':fontcolor=${CAPTION_COLOR}@0.95:fontsize=28:x=(w-text_w)/2:y='${yExpr}':alpha='${fade}':shadowcolor=black@0.75:shadowx=2:shadowy=2`,
    )
  }

  const chips = factsRaw
    .split(/\s*[·|]\s*/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3)

  if (chips.length) {
    const chipDelay = entranceDelay + 1.55
    const chipW = 200
    const gap = 16
    const totalW = chips.length * chipW + (chips.length - 1) * gap
    chips.forEach((chip, chipIndex) => {
      const delay = chipDelay + chipIndex * 0.08
      const startX = `(iw-${totalW})/2+${chipIndex * (chipW + gap)}`
      filters.push(
        `drawbox=x='${startX}':y=ih*0.9:w=${chipW}:h=48:color=${BLUE_PRIMARY}@0.92:t=fill:enable='between(t\\,${delay.toFixed(2)}\\,${end})'`,
        `drawbox=x='${startX}':y=ih*0.9:w=${chipW}:h=48:color=${GOLD}@0.9:t=3:enable='between(t\\,${delay.toFixed(2)}\\,${end})'`,
        `drawtext=${brandFont}:text='${escapeDrawText(chip)}':fontcolor=${TITLE_COLOR}:fontsize=24:x='${startX}+(${chipW}-text_w)/2':y=ih*0.9+12:alpha='${fadeIn(delay, 0.35)}':shadowcolor=black@0.5:shadowx=1:shadowy=1`,
      )
    })
  }

  return filters.length ? `,${filters.join(',')}` : ''
}

/**
 * Scene titles — light blue + gold lower-thirds (photo stays visible).
 * Karaoke captions are never burned in. Price-like titles get count-up treatment.
 */
export function buildAnimatedTextFilters(scene: ReelScenePlan, options: SceneTextOptions) {
  const filters: string[] = []
  const { sceneIndex, reelTitle, isFirst = false, durationSeconds } = options
  const entranceDelay = isFirst ? 0.35 : 0.1
  const overlay = scene.textOverlay?.trim()
  const title = sceneIndex === 0 && reelTitle?.trim() ? reelTitle.trim() : overlay
  const resolved = title || overlay

  if (!resolved) {
    return ''
  }

  const isHero = sceneIndex === 0 || options.sceneRole === 'hook' || options.sceneRole === 'hero'
  // Only show property name under the title on hook / closing — not every scene
  const showSubtitle =
    options.sceneRole === 'hook' ||
    options.sceneRole === 'closing' ||
    sceneIndex === 0 ||
    options.sceneRole === 'hero'
  const subtitle =
    showSubtitle &&
    reelTitle &&
    reelTitle.trim().toLowerCase() !== resolved.toLowerCase()
      ? reelTitle
      : null

  if (parseListingPrice(resolved)) {
    filters.push(...buildListingVeilFilters(durationSeconds, entranceDelay))
    filters.push(
      ...buildPriceCountUpFilters({
        priceText: resolved,
        durationSeconds,
        entranceDelay,
        yRatio: 0.75,
        fontSize: isHero ? 64 : 56,
      }),
    )
  } else {
    filters.push(
      ...buildBottomTitleFilters(
        resolved,
        durationSeconds,
        isHero,
        entranceDelay,
        subtitle,
        sceneIndex,
      ),
    )
  }

  return filters.length ? `,${filters.join(',')}` : ''
}
