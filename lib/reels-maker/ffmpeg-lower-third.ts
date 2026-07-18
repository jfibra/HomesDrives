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
 * Broadcast-style slanted lower third (matches Homes.ph reference):
 * - Light-blue accent bars on the far left
 * - Navy logo tab on the left of the white title holder
 * - White main title ribbon
 * - Blue subtitle ribbon
 * - Thin decorative accent on the right (no logo)
 */
export async function renderLowerThirdPng(
  frameWidth: number,
  frameHeight: number,
  content: LowerThirdContent,
): Promise<Buffer> {
  const { default: sharp } = await import('sharp')

  const titleLines = wrapTitle(content.title || 'Homes.ph', 26)
  const subtitle = content.subtitle?.trim()
    ? content.subtitle.trim().slice(0, 42).toUpperCase()
    : null

  const s = frameWidth / 1080
  const barY = Math.round(frameHeight * 0.78)
  const mainH = Math.round(110 * s)
  const subH = Math.round(48 * s)
  const skew = Math.round(48 * s)
  const left = Math.round(48 * s)
  const logoW = Math.round(210 * s)
  const mainW = Math.round(780 * s)
  const subW = Math.round(520 * s)
  const gap = Math.round(10 * s)

  const blue = `#${BLUE_PRIMARY.replace(/^0x/i, '')}`
  const blueDeep = `#${BLUE_DEEP.replace(/^0x/i, '')}`
  const gold = `#${GOLD.replace(/^0x/i, '')}`
  const lightBlue = '#6BA6D4'
  const softGrey = '#E8EEF5'

  const para = (x: number, y: number, w: number, h: number, sk: number) =>
    `${x + sk},${y} ${x + w + sk},${y} ${x + w},${y + h} ${x},${y + h}`

  const titleFontSize =
    titleLines[0].length > 22
      ? Math.round(28 * s)
      : titleLines[0].length > 14
        ? Math.round(34 * s)
        : Math.round(40 * s)
  const subFontSize = Math.round(20 * s)

  // Center title in the white title holder (area to the right of the logo tab)
  const whiteStart = left + Math.round(logoW * 0.55)
  const whiteW = mainW - Math.round(logoW * 0.25)
  const textAreaLeft = left + logoW
  const textAreaRight = whiteStart + whiteW - Math.round(skew * 0.35)
  const titleX = Math.round((textAreaLeft + textAreaRight) / 2)
  const lineGap = Math.round(titleFontSize * 1.15)
  const titleBlockH =
    titleLines.length <= 1 ? titleFontSize : titleFontSize + lineGap
  const titleY =
    barY + Math.round((mainH - titleBlockH) / 2) + Math.round(titleFontSize * 0.82)
  const titleLinesXml = titleLines
    .map((line, i) => {
      const dy = i === 0 ? 0 : lineGap
      return `<tspan x="${titleX}" dy="${dy}">${escapeXml(line)}</tspan>`
    })
    .join('')

  // Left blue tab: accentLogo (partner) wins, else main logo
  const tabLogoBuffer =
    content.accentLogoBuffer?.length ? content.accentLogoBuffer : content.logoBuffer

  let logoImageXml = ''
  if (tabLogoBuffer?.length) {
    try {
      const logoMaxW = Math.round(logoW * 0.78)
      const logoMaxH = Math.round(mainH * 0.62)
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
        text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(22 * s)}"
        font-weight="700" fill="#FFFFFF">LOGO</text>`

  const subtitleXml = subtitle
    ? `
      <polygon points="${para(left + Math.round(logoW * 0.45), barY + mainH + gap, subW, subH, skew)}" fill="${blue}" />
      <polygon points="${para(left + Math.round(logoW * 0.45), barY + mainH + gap, Math.round(18 * s), subH, skew)}" fill="${blueDeep}" opacity="0.55" />
      <text x="${left + Math.round(logoW * 0.45) + Math.round(28 * s)}" y="${barY + mainH + gap + Math.round(subH * 0.68)}"
        font-family="Arial, Helvetica, sans-serif" font-size="${subFontSize}" font-weight="600" fill="#FFFFFF">${escapeXml(subtitle)}</text>
      <rect x="${left + Math.round(logoW * 0.45) + subW + Math.round(8 * s)}" y="${barY + mainH + gap + Math.round(subH * 0.72)}"
        width="${Math.round(160 * s)}" height="${Math.round(3 * s)}" fill="${lightBlue}" opacity="0.9" />
    `
    : `
      <rect x="${left + Math.round(logoW * 0.45) + Math.round(40 * s)}" y="${barY + mainH + gap + Math.round(18 * s)}"
        width="${Math.round(200 * s)}" height="${Math.round(3 * s)}" fill="${lightBlue}" opacity="0.85" />
    `

  // Thin decorative right accent only — never a logo
  const rightTabW = Math.round(28 * s)
  const rightTabX = frameWidth - Math.round(90 * s)
  const rightTabY = barY + Math.round(mainH * 0.12)
  const rightTabH = Math.round(mainH * 0.9)

  const accentBarH = mainH - Math.round(16 * s)
  const accentBarY = barY + Math.round(8 * s)

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${frameWidth}" height="${frameHeight}" viewBox="0 0 ${frameWidth} ${frameHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <polygon points="${para(left + Math.round(24 * s), barY - Math.round(14 * s), mainW + Math.round(40 * s), mainH + Math.round(28 * s), skew)}" fill="${softGrey}" opacity="0.92" />
  <polygon points="${para(left - Math.round(42 * s), accentBarY, Math.round(10 * s), accentBarH, skew)}" fill="${lightBlue}" opacity="0.85" />
  <polygon points="${para(left - Math.round(26 * s), accentBarY, Math.round(10 * s), accentBarH, skew)}" fill="${lightBlue}" opacity="0.95" />
  <polygon points="${para(left - Math.round(10 * s), accentBarY, Math.round(10 * s), accentBarH, skew)}" fill="${lightBlue}" />
  <polygon points="${para(left + Math.round(logoW * 0.55), barY, mainW - Math.round(logoW * 0.25), mainH, skew)}" fill="#FFFFFF" />
  <polygon points="${para(left, barY - Math.round(6 * s), logoW, mainH + Math.round(12 * s), skew)}" fill="${blueDeep}" />
  <polygon points="${para(left + logoW - Math.round(22 * s), barY - Math.round(6 * s), Math.round(22 * s), mainH + Math.round(12 * s), skew)}" fill="${blue}" opacity="0.35" />
  ${logoImageXml}
  ${fallbackLogoText}
  <polygon points="${para(left, barY + mainH + Math.round(4 * s), logoW, Math.round(4 * s), skew)}" fill="${gold}" />
  <text x="${titleX}" y="${titleY}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="${titleFontSize}" font-weight="700" fill="${blueDeep}">${titleLinesXml}</text>
  ${subtitleXml}
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
 * Left→right entrance for the lower-third PNG (input [1:v] onto [base]).
 * Uses overlay x animation (works on FFmpeg 4.4) — crop=w='…t…' does not.
 */
export function buildLowerThirdRevealFilterComplex(options?: {
  delaySeconds?: number
  durationSeconds?: number
}) {
  const delay = options?.delaySeconds ?? 0.15
  const anim = options?.durationSeconds ?? 1.15
  const d = delay.toFixed(3)
  const a = anim.toFixed(3)
  // Ease-out style slide: progress^0.65 spends more time near the end (softer settle)
  const progress = `min(1\\,max(0\\,(t-${d})/${a}))`
  const eased = `pow(${progress}\\,0.65)`
  const xExpr = `-w+w*(${eased})`
  const fadeDur = Math.min(0.45, anim * 0.35).toFixed(3)
  return (
    `[1:v]format=rgba,fade=t=in:st=${d}:d=${fadeDur}:alpha=1[lt];` +
    `[base][lt]overlay=x='${xExpr}':y=0:format=auto,format=yuv420p[vout]`
  )
}
