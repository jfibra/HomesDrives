import { writeFile } from 'fs/promises'
import { join } from 'path'

import { BLUE_DEEP, BLUE_PRIMARY, GOLD } from '@/lib/reels-maker/ffmpeg-text'

/** Escape text for SVG text nodes. */
function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapTitle(text: string, maxLen = 28) {
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

export type LowerThirdContent = {
  title: string
  subtitle?: string | null
  /** PNG/JPEG/WebP — rendered in the left blue logo tab (beside the white title holder). */
  logoBuffer?: Buffer | null
  /**
   * Optional partner mark for the left blue logo tab.
   * When set, takes priority over `logoBuffer` in the tab only
   * (so watermark/outro can stay on the main `logo`).
   */
  accentLogoBuffer?: Buffer | null
}

/**
 * Broadcast-style slanted lower third:
 * - Light-blue accent bars on the far left
 * - Navy logo tab on the left of the white title holder
 * - White title ribbon (title + optional subtitle as a second line — no overlapping blue sub-bar)
 * - Thin decorative accent on the right
 *
 * Scales from the *short* edge so landscape 16:9 stays compact (not oversized from width/1080).
 */
export async function renderLowerThirdPng(
  frameWidth: number,
  frameHeight: number,
  content: LowerThirdContent,
): Promise<Buffer> {
  const { default: sharp } = await import('sharp')

  const isLandscape = frameWidth > frameHeight
  // Portrait: width/1080 ≈ 1. Landscape: height/1080 ≈ 1 — keeps bars slim on YouTube.
  const s = (isLandscape ? frameHeight : frameWidth) / 1080

  const rawTitle = (content.title || 'Homes.ph').trim()
  const rawSubtitle = content.subtitle?.trim() || null

  // Keep subtitle inside the white holder as line 2 (matches partner sample) — avoids overlap.
  const titleLines = wrapTitle(rawTitle, isLandscape ? 34 : 26)
  const subtitle =
    rawSubtitle && rawSubtitle.toUpperCase() !== titleLines.join(' ').toUpperCase()
      ? rawSubtitle.slice(0, isLandscape ? 42 : 42).toUpperCase()
      : null

  const barY = Math.round(frameHeight * (isLandscape ? 0.82 : 0.78))
  const mainH = Math.round((subtitle ? 88 : 72) * s)
  const skew = Math.round(36 * s)
  const logoW = Math.round((isLandscape ? 120 : 168) * s)
  // Landscape: wider ribbon, centered like portrait reels. Portrait: left-anchored (fills most of 9:16).
  const mainW = Math.round((isLandscape ? 1180 : 780) * s)
  const left = isLandscape
    ? Math.round((frameWidth - mainW - skew) / 2)
    : Math.round(48 * s)

  const blue = `#${BLUE_PRIMARY.replace(/^0x/i, '')}`
  const blueDeep = `#${BLUE_DEEP.replace(/^0x/i, '')}`
  const gold = `#${GOLD.replace(/^0x/i, '')}`
  const lightBlue = '#6BA6D4'
  const softGrey = '#E8EEF5'

  const para = (x: number, y: number, w: number, h: number, sk: number) =>
    `${x + sk},${y} ${x + w + sk},${y} ${x + w},${y + h} ${x},${y + h}`

  const longestTitle = titleLines.reduce((a, b) => (a.length >= b.length ? a : b), '')
  const titleFontSize =
    longestTitle.length > 28
      ? Math.round(22 * s)
      : longestTitle.length > 18
        ? Math.round(26 * s)
        : Math.round(30 * s)
  const subFontSize = Math.round(16 * s)

  // Center title block in the white title holder
  const whiteStart = left + Math.round(logoW * 0.55)
  const whiteW = mainW - Math.round(logoW * 0.25)
  const textAreaLeft = left + logoW
  const textAreaRight = whiteStart + whiteW - Math.round(skew * 0.35)
  const titleX = Math.round((textAreaLeft + textAreaRight) / 2)

  const lineGap = Math.round(titleFontSize * 1.12)
  const subGap = Math.round(subFontSize * 1.35)
  const titleBlockH =
    titleLines.length * titleFontSize +
    (titleLines.length > 1 ? lineGap * (titleLines.length - 1) : 0) +
    (subtitle ? subGap + subFontSize : 0)
  const titleY =
    barY + Math.round((mainH - titleBlockH) / 2) + Math.round(titleFontSize * 0.85)

  const titleLinesXml = titleLines
    .map((line, i) => {
      const dy = i === 0 ? 0 : lineGap
      return `<tspan x="${titleX}" dy="${dy}">${escapeXml(line)}</tspan>`
    })
    .join('')

  const subtitleInHolderXml = subtitle
    ? `<tspan x="${titleX}" dy="${subGap}" font-size="${subFontSize}" font-weight="600" fill="${blue}">${escapeXml(subtitle)}</tspan>`
    : ''

  // Left blue tab: accentLogo (partner) wins, else main logo
  const tabLogoBuffer =
    content.accentLogoBuffer?.length ? content.accentLogoBuffer : content.logoBuffer

  let logoImageXml = ''
  if (tabLogoBuffer?.length) {
    try {
      const logoMaxW = Math.round(logoW * 0.72)
      const logoMaxH = Math.round(mainH * 0.58)
      const logoPng = await sharp(tabLogoBuffer, { failOn: 'none' })
        .ensureAlpha()
        .resize({
          width: logoMaxW,
          height: logoMaxH,
          fit: 'inside',
          withoutEnlargement: false,
        })
        .png()
        .toBuffer()
      const b64 = logoPng.toString('base64')
      const meta = await sharp(logoPng).metadata()
      const lw = meta.width ?? logoMaxW
      const lh = meta.height ?? logoMaxH
      const lx = left + Math.round((logoW - lw) / 2) + Math.round(skew * 0.28)
      const ly = barY + Math.round((mainH - lh) / 2)
      logoImageXml = `<image href="data:image/png;base64,${b64}" x="${lx}" y="${ly}" width="${lw}" height="${lh}" />`
    } catch {
      logoImageXml = ''
    }
  }

  const fallbackLogoText = logoImageXml
    ? ''
    : `<text x="${left + Math.round(logoW / 2) + Math.round(skew * 0.28)}" y="${barY + Math.round(mainH * 0.58)}"
        text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(18 * s)}"
        font-weight="700" fill="#FFFFFF">LOGO</text>`

  // Thin decorative right accent — sits just past the white ribbon (not stranded at frame edge)
  const rightTabW = Math.round(22 * s)
  const rightTabX = left + mainW + Math.round(skew * 0.35)
  const rightTabY = barY + Math.round(mainH * 0.12)
  const rightTabH = Math.round(mainH * 0.85)

  const accentBarH = mainH - Math.round(14 * s)
  const accentBarY = barY + Math.round(8 * s)

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${frameWidth}" height="${frameHeight}" viewBox="0 0 ${frameWidth} ${frameHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <polygon points="${para(left + Math.round(18 * s), barY - Math.round(10 * s), mainW + Math.round(28 * s), mainH + Math.round(20 * s), skew)}" fill="${softGrey}" opacity="0.9" />
  <polygon points="${para(left - Math.round(34 * s), accentBarY, Math.round(8 * s), accentBarH, skew)}" fill="${lightBlue}" opacity="0.85" />
  <polygon points="${para(left - Math.round(20 * s), accentBarY, Math.round(8 * s), accentBarH, skew)}" fill="${lightBlue}" opacity="0.95" />
  <polygon points="${para(left - Math.round(6 * s), accentBarY, Math.round(8 * s), accentBarH, skew)}" fill="${lightBlue}" />
  <polygon points="${para(left + Math.round(logoW * 0.55), barY, mainW - Math.round(logoW * 0.25), mainH, skew)}" fill="#FFFFFF" />
  <polygon points="${para(left, barY - Math.round(4 * s), logoW, mainH + Math.round(8 * s), skew)}" fill="${blueDeep}" />
  <polygon points="${para(left + logoW - Math.round(18 * s), barY - Math.round(4 * s), Math.round(18 * s), mainH + Math.round(8 * s), skew)}" fill="${blue}" opacity="0.35" />
  ${logoImageXml}
  ${fallbackLogoText}
  <polygon points="${para(left, barY + mainH + Math.round(2 * s), logoW, Math.round(3 * s), skew)}" fill="${gold}" />
  <text x="${titleX}" y="${titleY}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${titleFontSize}" font-weight="700" fill="${blueDeep}">${titleLinesXml}${subtitleInHolderXml}</text>
  <polygon points="${para(rightTabX, rightTabY, rightTabW, rightTabH, Math.round(skew * 0.7))}" fill="${blue}" />
</svg>`

  return sharp(Buffer.from(svg))
    .resize(frameWidth, frameHeight, { fit: 'fill' })
    .png()
    .toBuffer()
}

export async function writeLowerThirdPng(
  workDir: string,
  sceneIndex: number,
  frameWidth: number,
  frameHeight: number,
  content: LowerThirdContent,
) {
  const buffer = await renderLowerThirdPng(frameWidth, frameHeight, content)
  const path = join(workDir, `lower-third-${sceneIndex}.png`)
  await writeFile(path, buffer)
  return path
}

export function resolveSceneLowerThirdCopy(params: {
  sceneIndex: number
  textOverlay?: string | null
  reelTitle?: string | null
  listingPriceText?: string | null
  sceneRole?: string | null
}) {
  const overlay = params.textOverlay?.trim()
  const reelTitle = params.reelTitle?.trim() || null
  const title =
    (params.sceneIndex === 0 && reelTitle ? reelTitle : overlay) || overlay || reelTitle || 'Homes.ph'

  let subtitle: string | null = null
  if (params.listingPriceText?.trim()) {
    subtitle = params.listingPriceText.trim()
  } else if (reelTitle && reelTitle.toLowerCase() !== title.toLowerCase()) {
    subtitle = reelTitle
  }

  return { title, subtitle }
}

/**
 * Lower-third entrance animation (overlay onto [base] from input [1:v]).
 * - `left` — slides in from the left (portrait reels default)
 * - `bottom` — slides up from below (YouTube / landscape)
 */
export function buildLowerThirdRevealFilterComplex(options?: {
  delaySeconds?: number
  durationSeconds?: number
  /** Entrance direction. Default `left`. Use `bottom` for landscape YouTube. */
  from?: 'left' | 'bottom'
}) {
  const delay = options?.delaySeconds ?? 0.08
  const anim = options?.durationSeconds ?? 0.55
  const from = options?.from ?? 'left'
  const d = delay.toFixed(3)
  const a = anim.toFixed(3)
  const progress = `min(1\\,max(0\\,(t-${d})/${a}))`
  const eased = `pow(${progress}\\,0.72)`
  const fadeDur = Math.min(0.28, anim * 0.4).toFixed(3)
  const xExpr = from === 'bottom' ? '0' : `-w+w*(${eased})`
  const yExpr = from === 'bottom' ? `h-h*(${eased})` : '0'
  return (
    `[1:v]format=rgba,fade=t=in:st=${d}:d=${fadeDur}:alpha=1[lt];` +
    `[base][lt]overlay=x='${xExpr}':y='${yExpr}':format=auto,format=yuv420p[vout]`
  )
}
