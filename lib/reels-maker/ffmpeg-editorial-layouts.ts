import {
  BLUE_DEEP,
  BLUE_PRIMARY,
  escapeDrawText,
  fadeIn,
  fontParam,
  GOLD,
  TITLE_COLOR,
} from '@/lib/reels-maker/ffmpeg-text'
import { buildColorGradeFilter } from '@/lib/reels-maker/ffmpeg-color-grade'
import { buildMotionFilter } from '@/lib/reels-maker/cinematic-motion'
import type { ReelFrameDimensions } from '@/lib/reels-maker/aspect-ratio'
import type { ReelSceneMotion, ReelScenePlan, ReelTemplateId } from '@/lib/reels-maker/types'

const FPS = 30

/** Editorial Instagram-story style layouts — photo framed inside a branded canvas. */
export type EditorialLayoutId =
  | 'top-hero'
  | 'split-panel'
  | 'floating-card'
  | 'centered-frame'
  | 'diagonal-stack'
  | 'magazine-cover'

/** Sequence guarantees no consecutive repeat of the same layout. */
const LAYOUT_SEQUENCE: EditorialLayoutId[] = [
  'top-hero',
  'floating-card',
  'split-panel',
  'magazine-cover',
  'centered-frame',
  'diagonal-stack',
  'floating-card',
  'top-hero',
  'split-panel',
  'centered-frame',
  'magazine-cover',
  'diagonal-stack',
]

export function pickEditorialLayout(sceneIndex: number): EditorialLayoutId {
  return LAYOUT_SEQUENCE[sceneIndex % LAYOUT_SEQUENCE.length]
}

function even(n: number) {
  const rounded = Math.max(2, Math.round(n))
  return rounded % 2 === 0 ? rounded : rounded + 1
}

type CardRect = { x: number; y: number; w: number; h: number }

function cardRectForLayout(layout: EditorialLayoutId, frame: ReelFrameDimensions): CardRect {
  const W = frame.width
  const H = frame.height
  switch (layout) {
    case 'top-hero':
      return { x: 48, y: 110, w: even(W - 96), h: even(H * 0.58) }
    case 'split-panel':
      return { x: 40, y: 220, w: even(W * 0.52), h: even(H * 0.68) }
    case 'floating-card':
      return { x: 72, y: 210, w: even(W - 144), h: even(H * 0.55) }
    case 'centered-frame':
      return { x: 64, y: 180, w: even(W - 128), h: even(H * 0.62) }
    case 'diagonal-stack':
      return { x: 36, y: 160, w: even(W * 0.78), h: even(H * 0.56) }
    case 'magazine-cover':
      return { x: 80, y: 340, w: even(W - 160), h: even(H * 0.48) }
  }
}

function buildPhotoBranch(
  card: CardRect,
  durationSeconds: number,
  motion: ReelSceneMotion,
  templateId: ReelTemplateId,
) {
  const preW = even(card.w * 1.22)
  const preH = even(card.h * 1.22)
  const motionFilter = buildMotionFilter(motion, durationSeconds, {
    width: card.w,
    height: card.h,
    preScaleWidth: preW,
    preScaleHeight: preH,
  })
  const grade = buildColorGradeFilter(templateId)
  return `[0:v]${motionFilter},${grade},fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[photo]`
}

function shadowBox(card: CardRect, en: string) {
  return [
    `drawbox=x=${card.x + 10}:y=${card.y + 14}:w=${card.w}:h=${card.h}:color=black@0.28:t=fill:${en}`,
    `drawbox=x=${card.x + 4}:y=${card.y + 6}:w=${card.w}:h=${card.h}:color=black@0.18:t=fill:${en}`,
  ]
}

function goldFrame(card: CardRect, en: string, thickness = 3) {
  return [
    `drawbox=x=${card.x - thickness}:y=${card.y - thickness}:w=${card.w + thickness * 2}:h=${card.h + thickness * 2}:color=${GOLD}@0.92:t=${thickness}:${en}`,
  ]
}

function blueFrame(card: CardRect, en: string, thickness = 4) {
  return [
    `drawbox=x=${card.x - thickness - 4}:y=${card.y - thickness - 4}:w=${card.w + (thickness + 4) * 2}:h=${card.h + (thickness + 4) * 2}:color=${BLUE_PRIMARY}@0.85:t=${thickness}:${en}`,
  ]
}

function enableBetween(start: number, end: number) {
  return `enable='between(t\\,${start.toFixed(2)}\\,${end.toFixed(2)})'`
}

function wrapWords(text: string, maxLen: number) {
  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxLen && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 2)
}

type TextContent = {
  title: string
  subtitle: string | null
  price: string | null
  delay: number
  duration: number
}

function glassCard(
  x: number,
  y: number,
  w: number,
  h: number,
  en: string,
  opts?: { border?: 'gold' | 'blue' | 'none' },
) {
  const border = opts?.border ?? 'gold'
  const filters = [
    `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white@0.14:t=fill:${en}`,
    `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${BLUE_DEEP}@0.35:t=fill:${en}`,
  ]
  if (border === 'gold') {
    filters.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${GOLD}@0.9:t=2:${en}`)
  } else if (border === 'blue') {
    filters.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${BLUE_PRIMARY}@0.95:t=2:${en}`)
  }
  return filters
}

function titleTexts(
  x: number,
  y: number,
  maxWidthHint: number,
  content: TextContent,
  align: 'left' | 'center',
  frameWidth: number,
) {
  const titleFont = fontParam('body')
  const bodyFont = fontParam('body')
  const lines = wrapWords(content.title, Math.max(12, Math.floor(maxWidthHint / 28)))
  const titleSize = lines[0].length > 18 ? 34 : lines[0].length > 12 ? 40 : 46
  const filters: string[] = []
  lines.forEach((line, i) => {
    const delay = content.delay + 0.12 + i * 0.06
    const yy = y + i * Math.round(titleSize * 1.15)
    const xExpr = align === 'center' ? `(w-text_w)/2` : String(x)
    filters.push(
      `drawtext=${titleFont}:text='${escapeDrawText(line)}':fontcolor=${TITLE_COLOR}:fontsize=${titleSize}:x=${xExpr}:y=${yy}:alpha='${fadeIn(delay, 0.35)}':shadowcolor=black@0.45:shadowx=2:shadowy=2`,
    )
  })
  if (content.subtitle) {
    const subY = y + lines.length * Math.round(titleSize * 1.15) + 12
    const xExpr = align === 'center' ? `(w-text_w)/2` : String(x)
    filters.push(
      `drawtext=${bodyFont}:text='${escapeDrawText(content.subtitle.slice(0, 40).toUpperCase())}':fontcolor=${GOLD}:fontsize=20:x=${xExpr}:y=${subY}:alpha='${fadeIn(content.delay + 0.28, 0.35)}':shadowcolor=black@0.4:shadowx=1:shadowy=1`,
    )
  }
  if (content.price) {
    const priceY = y + lines.length * Math.round(titleSize * 1.15) + (content.subtitle ? 44 : 18)
    const badgeW = Math.min(320, Math.max(160, content.price.length * 18))
    const badgeX = align === 'center' ? Math.round((frameWidth - badgeW) / 2) : x
    const en = enableBetween(content.delay + 0.3, content.duration)
    filters.push(
      `drawbox=x=${badgeX}:y=${priceY}:w=${badgeW}:h=44:color=${GOLD}@0.95:t=fill:${en}`,
      `drawtext=${bodyFont}:text='${escapeDrawText(content.price.slice(0, 22).toUpperCase())}':fontcolor=${BLUE_DEEP}:fontsize=24:x=${badgeX}+(${badgeW}-text_w)/2:y=${priceY + 10}:alpha='${fadeIn(content.delay + 0.32, 0.3)}'`,
    )
  }
  return filters
}

function abstractDecor(layout: EditorialLayoutId, frame: ReelFrameDimensions, en: string) {
  const W = frame.width
  const H = frame.height
  const filters: string[] = [
    `drawbox=x=${even(W * 0.72)}:y=${even(H * 0.04)}:w=${even(W * 0.35)}:h=${even(H * 0.18)}:color=${GOLD}@0.12:t=fill:${en}`,
    `drawbox=x=0:y=${even(H * 0.78)}:w=${even(W * 0.4)}:h=${even(H * 0.28)}:color=${BLUE_PRIMARY}@0.28:t=fill:${en}`,
    `drawbox=x=${even(W * 0.08)}:y=${even(H * 0.06)}:w=${even(W * 0.22)}:h=2:color=${GOLD}@0.75:t=fill:${en}`,
    `drawbox=x=${even(W * 0.78)}:y=${even(H * 0.94)}:w=${even(W * 0.14)}:h=2:color=${GOLD}@0.7:t=fill:${en}`,
  ]

  if (layout === 'floating-card' || layout === 'diagonal-stack') {
    filters.push(
      `drawbox=x=${even(W * 0.82)}:y=${even(H * 0.22)}:w=28:h=28:color=${GOLD}@0.85:t=fill:${en}`,
      `drawbox=x=${even(W * 0.08)}:y=${even(H * 0.7)}:w=18:h=18:color=${BLUE_PRIMARY}@0.9:t=fill:${en}`,
    )
  }
  if (layout === 'magazine-cover' || layout === 'top-hero') {
    filters.push(
      `drawbox=x=${even(W * 0.88)}:y=${even(H * 0.12)}:w=40:h=40:color=${GOLD}@0.2:t=fill:${en}`,
      `drawbox=x=${even(W * 0.9)}:y=${even(H * 0.14)}:w=20:h=20:color=${GOLD}@0.9:t=fill:${en}`,
    )
  }
  if (layout === 'split-panel') {
    filters.push(
      `drawbox=x=${even(W * 0.56)}:y=${even(H * 0.18)}:w=3:h=${even(H * 0.2)}:color=${GOLD}@0.85:t=fill:${en}`,
    )
  }
  return filters
}

function chromeOverPhoto(
  layout: EditorialLayoutId,
  card: CardRect,
  frame: ReelFrameDimensions,
  content: TextContent,
  en: string,
) {
  const filters: string[] = []
  const W = frame.width

  switch (layout) {
    case 'top-hero': {
      filters.push(...goldFrame(card, en, 3))
      const gx = 48
      const gy = card.y + card.h + 36
      const gw = even(W - 96)
      const gh = 200
      filters.push(...glassCard(gx, gy, gw, gh, en))
      filters.push(...titleTexts(gx + 28, gy + 36, gw - 56, content, 'left', W))
      break
    }
    case 'split-panel': {
      filters.push(...blueFrame(card, en, 3), ...goldFrame(card, en, 2))
      const gx = card.x + card.w + 28
      const gy = even(frame.height * 0.32)
      const gw = even(W - gx - 40)
      const gh = 420
      filters.push(...glassCard(gx, gy, gw, gh, en))
      filters.push(`drawbox=x=${gx + 24}:y=${gy + 36}:w=48:h=4:color=${GOLD}@0.95:t=fill:${en}`)
      filters.push(...titleTexts(gx + 24, gy + 60, gw - 48, content, 'left', W))
      break
    }
    case 'floating-card': {
      filters.push(...goldFrame(card, en, 2))
      const gx = card.x + 24
      const gy = card.y + card.h - 110
      const gw = even(card.w - 48)
      const gh = 150
      filters.push(...glassCard(gx, gy, gw, gh, en, { border: 'gold' }))
      filters.push(...titleTexts(gx + 24, gy + 28, gw - 48, content, 'left', W))
      break
    }
    case 'centered-frame': {
      filters.push(...blueFrame(card, en, 5), ...goldFrame(card, en, 2))
      const gx = 56
      const gy = even(frame.height * 0.86)
      const gw = even(W - 112)
      const gh = 160
      filters.push(...glassCard(gx, gy, gw, gh, en))
      filters.push(`drawbox=x=${gx + 28}:y=${gy + 22}:w=64:h=3:color=${GOLD}@0.95:t=fill:${en}`)
      filters.push(...titleTexts(gx + 28, gy + 40, gw - 56, content, 'left', W))
      filters.push(
        `drawbox=x=${card.x - 16}:y=${card.y - 16}:w=36:h=4:color=${GOLD}@0.9:t=fill:${en}`,
        `drawbox=x=${card.x - 16}:y=${card.y - 16}:w=4:h=36:color=${GOLD}@0.9:t=fill:${en}`,
        `drawbox=x=${card.x + card.w - 20}:y=${card.y + card.h + 12}:w=36:h=4:color=${GOLD}@0.9:t=fill:${en}`,
        `drawbox=x=${card.x + card.w + 12}:y=${card.y + card.h - 20}:w=4:h=36:color=${GOLD}@0.9:t=fill:${en}`,
      )
      break
    }
    case 'diagonal-stack': {
      filters.push(...goldFrame(card, en, 2))
      const gx = 48
      const gy = card.y + card.h + 48
      const gw = even(W - 96)
      const gh = 180
      filters.push(...glassCard(gx, gy, gw, gh, en))
      filters.push(...titleTexts(gx + 28, gy + 32, gw - 56, content, 'left', W))
      break
    }
    case 'magazine-cover': {
      const hx = 64
      const hy = 96
      const hw = even(W - 128)
      const hh = 200
      filters.push(...glassCard(hx, hy, hw, hh, en, { border: 'none' }))
      filters.push(`drawbox=x=${hx}:y=${hy + hh - 4}:w=${hw}:h=4:color=${GOLD}@0.95:t=fill:${en}`)
      filters.push(
        ...titleTexts(
          hx + 20,
          hy + 36,
          hw - 40,
          { ...content, subtitle: null, price: null },
          'left',
          W,
        ),
      )
      filters.push(...goldFrame(card, en, 2))
      const gx = 80
      const gy = card.y + card.h + 28
      const gw = even(W - 160)
      const gh = 140
      filters.push(...glassCard(gx, gy, gw, gh, en))
      if (content.subtitle || content.price) {
        filters.push(
          ...titleTexts(
            gx + 24,
            gy + 28,
            gw - 48,
            {
              title: content.subtitle || content.price || content.title,
              subtitle: content.price && content.subtitle ? content.price : null,
              price: null,
              delay: content.delay,
              duration: content.duration,
            },
            'left',
            W,
          ),
        )
      } else {
        filters.push(...titleTexts(gx + 24, gy + 36, gw - 48, content, 'left', W))
      }
      break
    }
  }

  return filters
}

export type BuildEditorialSceneParams = {
  frame: ReelFrameDimensions
  scene: ReelScenePlan
  sceneIndex: number
  durationSeconds: number
  motion: ReelSceneMotion
  templateId: ReelTemplateId
  reelTitle?: string
  isFirst: boolean
  isLast: boolean
}

/**
 * filter_complex for framed editorial scenes.
 * [0:v] = still image, [1:v] = solid branded canvas. Output: [vout]
 */
export function buildEditorialSceneFilterComplex(params: BuildEditorialSceneParams): {
  layout: EditorialLayoutId
  filterComplex: string
} {
  const layout = pickEditorialLayout(params.sceneIndex)
  const card = cardRectForLayout(layout, params.frame)
  const delay = params.isFirst ? 0.2 : 0.08
  const en = enableBetween(0, params.durationSeconds)

  const overlay = params.scene.textOverlay?.trim()
  const title =
    (params.sceneIndex === 0 && params.reelTitle?.trim()
      ? params.reelTitle.trim()
      : overlay) ||
    params.reelTitle?.trim() ||
    'Homes.ph'
  const subtitle =
    params.reelTitle &&
    params.reelTitle.trim().toLowerCase() !== title.toLowerCase() &&
    (layout === 'top-hero' ||
      layout === 'magazine-cover' ||
      layout === 'split-panel' ||
      params.sceneIndex === 0)
      ? params.reelTitle.trim()
      : null

  const content: TextContent = {
    title,
    subtitle,
    price: params.scene.listingPriceText?.trim() || null,
    delay,
    duration: params.durationSeconds,
  }

  const photo = buildPhotoBranch(card, params.durationSeconds, params.motion, params.templateId)
  const underLayers = [
    ...abstractDecor(layout, params.frame, en),
    ...shadowBox(card, en),
  ]
  if (layout === 'diagonal-stack') {
    underLayers.push(
      `drawbox=x=${card.x + 28}:y=${card.y + 28}:w=${card.w}:h=${card.h}:color=${BLUE_PRIMARY}@0.45:t=fill:${en}`,
      `drawbox=x=${card.x + 14}:y=${card.y + 14}:w=${card.w}:h=${card.h}:color=${GOLD}@0.25:t=fill:${en}`,
    )
  }
  const underPhoto = underLayers.join(',')
  const overPhoto = chromeOverPhoto(layout, card, params.frame, content, en).join(',')

  let fadeTail = ''
  if (!params.isFirst && !params.isLast) {
    fadeTail = `,fade=t=in:st=0:d=0.18`
  }

  // Stack: canvas → abstract + shadow → photo card → frame / glass / type
  const filterComplex = [
    photo,
    `[1:v]format=yuv420p,${underPhoto}[bgready]`,
    `[bgready][photo]overlay=x=${card.x}:y=${card.y}:shortest=1[comp]`,
    `[comp]${overPhoto}${fadeTail},format=yuv420p[vout]`,
  ].join(';')

  return { layout, filterComplex }
}

/** Solid canvas hex for lavfi color= (without 0x). */
export function editorialCanvasColor() {
  return BLUE_DEEP.replace(/^0x/i, '')
}
