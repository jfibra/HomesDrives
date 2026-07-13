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

function slideDown(baseYRatio: number, distance: number, delay: number, duration: number) {
  return `h*${baseYRatio}+${distance}*(1-min(1\\,max(0\\,t-${delay})/${duration}))`
}

export function slideUp(baseYRatio: number, distance: number, delay: number, duration: number) {
  return `h*${baseYRatio}+${distance}*(1-min(1\\,max(0\\,t-${delay})/${duration}))`
}

function wrapCaption(text: string, maxLength = 38) {
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

function wrapTitle(text: string, maxLength = 32) {
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

function buildTitleFilters(
  title: string,
  durationSeconds: number,
  isHero: boolean,
  entranceDelay = 0.1,
) {
  const filters: string[] = []
  const titleLines = wrapTitle(title)
  const titleFont = fontParam('title')
  const brandFont = fontParam('brand')
  const fade = fadeIn(entranceDelay, 0.55)
  const end = durationSeconds.toFixed(2)
  // Scale font size down for longer titles
  const titleSize = isHero
    ? titleLines[0].length > 30 ? 46 : titleLines[0].length > 22 ? 56 : 62
    : titleLines[0].length > 30 ? 44 : 54
  const brandDelay = Math.max(0.05, entranceDelay - 0.05)

  // Reduced opacity for cleaner cinematic look
  filters.push(`drawbox=x=0:y=ih*0.04:w=iw:h=ih*0.13:color=black@0.16:t=fill:enable='between(t\\,0\\,${end})'`)
  filters.push(
    `drawbox=x='(iw-min(240\\,240*min(1\\,max(0\\,t-${(entranceDelay + 0.1).toFixed(2)})/0.5)))/2':y=ih*0.165:w='min(240\\,240*min(1\\,max(0\\,t-${(entranceDelay + 0.1).toFixed(2)})/0.5))':h=4:color=${TITLE_ACCENT}@0.95:t=fill:enable='between(t\\,${(entranceDelay + 0.1).toFixed(2)}\\,${end})'`,
  )

  if (isHero) {
    filters.push(
      `drawtext=${brandFont}:text='Homes.ph':fontcolor=${TITLE_ACCENT}@0.95:fontsize=28:x=(w-text_w)/2:y='h*0.055+18*(1-min(1\\,max(0\\,t-${brandDelay})/0.4))':alpha='${fade}':shadowcolor=black@0.45:shadowx=1:shadowy=1`,
    )
  }

  titleLines.forEach((line, lineIndex) => {
    const yExpr = slideDown(0.085 + lineIndex * 0.045, 28, entranceDelay + lineIndex * 0.05, 0.55)
    filters.push(
      `drawtext=${titleFont}:text='${escapeDrawText(line)}':fontcolor=${TITLE_COLOR}:fontsize=${titleSize}:x=(w-text_w)/2:y='${yExpr}':alpha='${fade}':shadowcolor=black@0.75:shadowx=3:shadowy=3:borderw=2:bordercolor=${TITLE_ACCENT}@0.75:line_spacing=4`,
    )
  })

  return filters
}

function buildCaptionFilters(caption: string, isLast: boolean, durationSeconds: number) {
  const filters: string[] = []
  const bodyFont = fontParam('body')
  const lines = wrapCaption(caption)
  const captionDelay = 0.30
  const captionFade = fadeIn(captionDelay, 0.45)
  const exitFadeStart = Math.max(captionDelay, durationSeconds - 1.1)
  const end = durationSeconds.toFixed(2)
  // Adaptive font size: shorter text gets bigger type
  const captionSize = lines[0].length > 28 ? 33 : lines[0].length > 20 ? 37 : 41

  // Single unified bottom panel — more cinematic than individual per-line boxes
  filters.push(
    `drawbox=x=0:y=ih*0.68:w=iw:h=ih*0.32:color=black@0.24:t=fill:enable='between(t\\,${captionDelay.toFixed(2)}\\,${end})'`,
  )

  lines.forEach((line, lineIndex) => {
    const baseY = 0.755 + lineIndex * 0.058
    const yExpr = slideUp(baseY, 28, captionDelay + lineIndex * 0.07, 0.45)
    const alpha = isLast
      ? `if(lt(t\\,${captionDelay})\\,0\\,if(lt(t\\,${exitFadeStart})\\,if(lt(t\\,${(captionDelay + 0.45).toFixed(2)})\\,(t-${captionDelay})/0.45\\,1)\\,if(lt(t\\,${end})\\,1-(t-${exitFadeStart})/0.7\\,0)))`
      : captionFade
    // Text rendered with strong shadow only — panel provides the readability backdrop
    filters.push(
      `drawtext=${bodyFont}:text='${escapeDrawText(line)}':fontcolor=${CAPTION_COLOR}:fontsize=${captionSize}:x=(w-text_w)/2:y='${yExpr}':alpha='${alpha}':shadowcolor=black@0.80:shadowx=3:shadowy=3:borderw=1:bordercolor=black@0.60`,
    )
  })

  return filters
}

function buildGradientPanelFilters(durationSeconds: number, entranceDelay: number) {
  const end = durationSeconds.toFixed(2)
  const start = entranceDelay.toFixed(2)
  // Stacked bands of increasing opacity approximate a smooth dark-to-transparent
  // gradient rising from the bottom edge, without needing a separate image input.
  const bands = [
    { y: 0.55, alpha: 0.06 },
    { y: 0.62, alpha: 0.12 },
    { y: 0.7, alpha: 0.2 },
    { y: 0.78, alpha: 0.3 },
    { y: 0.86, alpha: 0.42 },
  ]
  return bands.map(
    (band) =>
      `drawbox=x=0:y=ih*${band.y}:w=iw:h=ih*${(1 - band.y).toFixed(2)}:color=black@${band.alpha}:t=fill:enable='between(t\\,${start}\\,${end})'`,
  )
}

/** Listing Showcase: persistent price + address/beds-baths/sqft lower-third, in place of title/caption. */
export function buildListingDetailsFilters(scene: ReelScenePlan, options: SceneTextOptions) {
  const filters: string[] = []
  const { durationSeconds, isFirst = false } = options
  const entranceDelay = isFirst ? 0.45 : 0.1
  const titleFont = fontParam('title')
  const bodyFont = fontParam('body')

  filters.push(...buildGradientPanelFilters(durationSeconds, entranceDelay))

  const price = scene.listingPriceText?.trim()
  if (price) {
    const priceDelay = entranceDelay + 0.1
    const fade = fadeIn(priceDelay, 0.5)
    const yExpr = slideUp(0.8, 26, priceDelay, 0.5)
    filters.push(
      `drawtext=${titleFont}:text='${escapeDrawText(price)}':fontcolor=${TITLE_COLOR}:fontsize=64:x=(w-text_w)/2:y='${yExpr}':alpha='${fade}':shadowcolor=black@0.80:shadowx=3:shadowy=3:borderw=2:bordercolor=${TITLE_ACCENT}@0.75`,
    )
  }

  const factsLines = (scene.listingFactsLines ?? []).filter((line): line is string => Boolean(line?.trim()))
  factsLines.forEach((line, lineIndex) => {
    const lineDelay = entranceDelay + 0.35 + lineIndex * 0.12
    const fade = fadeIn(lineDelay, 0.45)
    const baseY = 0.885 + lineIndex * 0.05
    const yExpr = slideUp(baseY, 24, lineDelay, 0.45)
    filters.push(
      `drawtext=${bodyFont}:text='${escapeDrawText(line)}':fontcolor=${CAPTION_COLOR}:fontsize=32:x=(w-text_w)/2:y='${yExpr}':alpha='${fade}':shadowcolor=black@0.75:shadowx=2:shadowy=2`,
    )
  })

  return filters.length ? `,${filters.join(',')}` : ''
}

export function buildAnimatedTextFilters(scene: ReelScenePlan, options: SceneTextOptions) {
  const filters: string[] = []
  const { sceneIndex, reelTitle, isFirst = false, isLast = false, durationSeconds } = options
  const entranceDelay = isFirst ? 0.45 : 0.1
  const overlay = scene.textOverlay?.trim()
  const title = sceneIndex === 0 && reelTitle?.trim() ? reelTitle.trim() : overlay

  if (title) {
    filters.push(...buildTitleFilters(title, durationSeconds, sceneIndex === 0, entranceDelay))
  } else if (overlay) {
    filters.push(...buildTitleFilters(overlay, durationSeconds, false, entranceDelay))
  }

  if (scene.captionLine?.trim()) {
    filters.push(...buildCaptionFilters(scene.captionLine, isLast, durationSeconds))
  }

  return filters.length ? `,${filters.join(',')}` : ''
}
