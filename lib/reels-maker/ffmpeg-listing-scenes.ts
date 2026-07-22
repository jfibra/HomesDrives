import { execFile } from 'child_process'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

import { resolveFfmpegBinary } from '@/lib/reels-maker/audio-utils'
import type { ReelFrameDimensions } from '@/lib/reels-maker/aspect-ratio'
import { CAPTION_COLOR, escapeDrawText, fadeIn, fontParam, slideUp } from '@/lib/reels-maker/ffmpeg-text'
import { buildReelVideoEncodeArgs } from '@/lib/reels-maker/render-quality'
import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'

const execFileAsync = promisify(execFile)

const FPS = 30
const ENCODE_ARGS = [...buildReelVideoEncodeArgs(FPS)]

async function runFilterComplex(args: {
  inputs: string[]
  filterComplex: string
  durationSeconds: number
  outputPath: string
}) {
  const ffmpeg = await resolveFfmpegBinary()
  await execFileAsync(
    ffmpeg,
    [
      '-y',
      ...args.inputs,
      '-filter_complex',
      args.filterComplex,
      '-map',
      '[vout]',
      '-t',
      String(args.durationSeconds),
      ...ENCODE_ARGS,
      args.outputPath,
    ],
    { maxBuffer: 1024 * 1024 * 64 },
  )
  return readFile(args.outputPath)
}

export type RenderedListingScene = { buffer: Buffer; durationSeconds: number }

const OUTRO_BG_PATH = join(process.cwd(), 'lib', 'reels-maker', 'assets', 'outro-bg.png')
const YOUTUBE_OUTRO_PLATE_PATH = join(process.cwd(), 'lib', 'reels-maker', 'assets', 'youtube-outro-plate.png')
const YOUTUBE_OUTRO_FALLBACK_PATH = join(process.cwd(), 'lib', 'reels-maker', 'assets', 'youtube-outro-bg.png')
const BEBAS_NEUE_PATH = join(process.cwd(), 'lib', 'reels-maker', 'fonts', 'BebasNeue-Regular.ttf')

/** Design size on the ~1024×576 sample plate → scale up for 1080p. */
const YOUTUBE_OUTRO_DESIGN_H = 576
/** Target Bebas title size in px at 1080p landscape (width-fit may use shorter wraps). */
const YOUTUBE_OUTRO_TITLE_SIZE = 90
/** White details under title — smaller regular sans (matches sample hierarchy). */
const YOUTUBE_OUTRO_DETAIL_SIZE = 22
/** Sample airy leading when the band has spare height. */
const YOUTUBE_OUTRO_TITLE_LEADING = 1.55
const YOUTUBE_OUTRO_TITLE_LEADING_MIN = 1.32
const YOUTUBE_OUTRO_TITLE_LEADING_MAX = 1.68
/** Mascot hand/head encroach into center-left from ~42% down on the plate. */
const YOUTUBE_OUTRO_MASCOT_TOP = 0.42
/** Visual gap between last title line and white details (~32px at 576p in sample). */
const YOUTUBE_OUTRO_TITLE_DETAIL_GAP = 48
/** All text ink must end above this Y (visual bottom, not baseline). */
const YOUTUBE_OUTRO_TEXT_BOTTOM = 0.54

/** Cover-scale a still into the reel frame (centers crop). */
function coverScaleFilter(width: number, height: number, labelIn: string, labelOut: string) {
  return `[${labelIn}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[${labelOut}]`
}

async function circleCropPng(buffer: Buffer, size: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  const round = Math.round(size)
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round}" height="${round}"><circle cx="${round / 2}" cy="${round / 2}" r="${round / 2}" fill="white"/></svg>`,
  )
  const circle = await sharp(buffer)
    .resize(round, round, { fit: 'cover', position: 'centre' })
    .composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer()

  // Thin white ring so the headshot reads on the navy plate
  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round}" height="${round}">
      <circle cx="${round / 2}" cy="${round / 2}" r="${round / 2 - 2}" fill="none" stroke="white" stroke-width="6"/>
    </svg>`,
  )
  return sharp(circle)
    .composite([{ input: await sharp(ring).png().toBuffer(), blend: 'over' }])
    .png()
    .toBuffer()
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Rasterize name / phone as PNG — more reliable than FFmpeg drawtext on EC2. */
async function renderOutroContactPng(
  frameWidth: number,
  lines: Array<{ text: string; fontSize: number; opacity?: number }>,
): Promise<{ buffer: Buffer; height: number }> {
  const { default: sharp } = await import('sharp')
  const width = frameWidth
  const lineGap = Math.round(14 * (frameWidth / 1080))
  const paddingY = Math.round(8 * (frameWidth / 1080))
  let y = paddingY
  const tspans: string[] = []
  for (const line of lines) {
    const size = line.fontSize
    y += size
    const fill = `rgba(255,255,255,${line.opacity ?? 1})`
    tspans.push(
      `<text x="50%" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" fill="${fill}">${escapeXml(line.text)}</text>`,
    )
    y += lineGap
  }
  const height = Math.max(y + paddingY, 40)
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${tspans.join('')}</svg>`,
  )
  const buffer = await sharp(svg).png().toBuffer()
  return { buffer, height }
}

type OutroAgent = { name?: string; phone?: string; email?: string; agencyName?: string }

/**
 * Branded outro on the Homes.ph navy mascot plate:
 * logo (top) → circular agent photo → name / phone → QR (mascot stays in BG bottom-left).
 */
export async function renderBrandedOutroScene(params: {
  frame: ReelFrameDimensions
  logoBuffer?: Buffer | null
  headshotBuffer?: Buffer | null
  qrBuffer?: Buffer | null
  agent?: OutroAgent
  ctaText?: string | null
  durationSeconds?: number
}): Promise<RenderedListingScene> {
  const duration = params.durationSeconds ?? 4.5
  const workDir = await mkdtemp(join(tmpdir(), 'reels-branded-outro-'))
  const outputPath = join(workDir, 'outro.mp4')
  const { width, height } = params.frame
  const agent = params.agent ?? {}

  try {
    const inputs: string[] = ['-loop', '1', '-framerate', String(FPS), '-i', OUTRO_BG_PATH]
    let inputIndex = 1
    const filters: string[] = [coverScaleFilter(width, height, '0:v', 'plate')]
    let base = 'plate'

    const hasPhoto = Boolean(params.headshotBuffer)
    const hasQr = Boolean(params.qrBuffer)
    const name = agent.name?.trim() || ''
    const phone = agent.phone?.trim() || ''
    const email = agent.email?.trim() || ''
    const agency = agent.agencyName?.trim() || ''

    // Keep stack centered above the waving mascot (bottom-left of the plate).
    const s = width / 1080
    const logoY = 0.05
    const photoY = hasPhoto ? 0.17 : 0.16
    const photoSize = Math.round(width * 0.34)
    // Contact block sits just under the circular headshot (or under the logo when no photo).
    const contactY = hasPhoto
      ? Math.round(height * photoY + photoSize + 28 * s)
      : Math.round(height * 0.26)
    const qrY = hasPhoto ? 0.55 : name || phone || email || agency ? 0.4 : 0.36

    if (params.logoBuffer) {
      const logoPath = join(workDir, 'logo.png')
      await writeFile(logoPath, params.logoBuffer)
      inputs.push('-loop', '1', '-framerate', String(FPS), '-i', logoPath)
      const idx = inputIndex++
      const logoWidth = Math.round(width * 0.5)
      filters.push(
        `[${idx}:v]scale=w=${logoWidth}:h=-1,format=rgba,fade=t=in:st=0.08:d=0.45:alpha=1[logo]`,
        `[${base}][logo]overlay=x='(main_w-overlay_w)/2':y='main_h*${logoY}'[withlogo]`,
      )
      base = 'withlogo'
    }

    if (params.headshotBuffer) {
      const circled = await circleCropPng(params.headshotBuffer, photoSize)
      const headPath = join(workDir, 'headshot.png')
      await writeFile(headPath, circled)
      inputs.push('-loop', '1', '-framerate', String(FPS), '-i', headPath)
      const idx = inputIndex++
      filters.push(
        `[${idx}:v]format=rgba,fade=t=in:st=0.25:d=0.5:alpha=1[head]`,
        `[${base}][head]overlay=x='(main_w-overlay_w)/2':y='main_h*${photoY}'[withhead]`,
      )
      base = 'withhead'
    }

    if (params.qrBuffer) {
      const qrPath = join(workDir, 'qr.png')
      await writeFile(qrPath, params.qrBuffer)
      inputs.push('-loop', '1', '-framerate', String(FPS), '-i', qrPath)
      const idx = inputIndex++
      const qrSize = Math.round(width * 0.34)
      const qrPad = 16

      filters.push(
        `[${idx}:v]scale=${qrSize}:${qrSize}[qrs]`,
        `[qrs]pad=iw+${qrPad * 2}:ih+${qrPad * 2}:${qrPad}:${qrPad}:white,format=rgba,fade=t=in:st=0.7:d=0.5:alpha=1[qrbox]`,
        `[${base}][qrbox]overlay=x='(main_w-overlay_w)/2':y='main_h*${qrY}'[withqr]`,
      )
      base = 'withqr'
    }

    const contactLines: Array<{ text: string; fontSize: number; opacity?: number }> = []
    if (name) contactLines.push({ text: name.toUpperCase(), fontSize: Math.round(40 * s) })
    else if (agency) contactLines.push({ text: agency.toUpperCase(), fontSize: Math.round(34 * s) })
    if (phone) contactLines.push({ text: phone, fontSize: Math.round(30 * s) })
    if (email) contactLines.push({ text: email, fontSize: Math.round((phone ? 24 : 26) * s), opacity: phone ? 0.9 : 0.95 })

    if (contactLines.length) {
      const contact = await renderOutroContactPng(width, contactLines)
      const contactPath = join(workDir, 'contact.png')
      await writeFile(contactPath, contact.buffer)
      inputs.push('-loop', '1', '-framerate', String(FPS), '-i', contactPath)
      const idx = inputIndex++
      filters.push(
        `[${idx}:v]format=rgba,fade=t=in:st=0.35:d=0.45:alpha=1[contact]`,
        `[${base}][contact]overlay=x='(main_w-overlay_w)/2':y=${contactY}[withcontact]`,
      )
      base = 'withcontact'
    }

    const bodyFont = fontParam('body')
    const cta = params.ctaText?.trim()
    if (cta && !hasQr) {
      const delay = 0.85
      const y = hasPhoto || name || phone ? 0.68 : 0.52
      filters.push(
        `[${base}]drawtext=${bodyFont}:text='${escapeDrawText(cta)}':fontcolor=${CAPTION_COLOR}:fontsize=32:x=(w-text_w)/2:y='${slideUp(y, 16, delay, 0.45)}':alpha='${fadeIn(delay, 0.45)}':shadowcolor=black@0.7:shadowx=2:shadowy=2[texted];[texted]format=yuv420p[vout]`,
      )
    } else {
      filters.push(`[${base}]format=yuv420p[vout]`)
    }

    const buffer = await runFilterComplex({
      inputs,
      filterComplex: filters.join(';'),
      durationSeconds: duration,
      outputPath,
    })
    return { buffer, durationSeconds: duration }
  } finally {
    await safeRemoveDir(workDir)
  }
}

/** @deprecated Prefer renderBrandedOutroScene — kept as a thin alias. */
export async function renderLogoOutroScene(params: {
  frame: ReelFrameDimensions
  logoBuffer: Buffer
  ctaText?: string
  durationSeconds?: number
}): Promise<RenderedListingScene> {
  return renderBrandedOutroScene({
    frame: params.frame,
    logoBuffer: params.logoBuffer,
    ctaText: params.ctaText,
    durationSeconds: params.durationSeconds ?? 3.2,
  })
}

/**
 * Landscape YouTube outro (16:9) — matches Homes.ph sample layout:
 * Clean navy+mascot plate → logo top-left → listing title/details left-center → large QR right.
 * Plate has no baked wordmark/QR; partners upload logo + qr and send listingTitle / listingDetails.
 */
export async function renderYoutubeOutroScene(params: {
  frame: ReelFrameDimensions
  logoBuffer?: Buffer | null
  qrBuffer?: Buffer | null
  listingTitle?: string | null
  /** Hex color for the title block only (default `#FFFFFF`). Details stay light. */
  listingTitleColor?: string | null
  listingDetails?: string | null
  durationSeconds?: number
}): Promise<RenderedListingScene> {
  const { existsSync } = await import('fs')
  const duration = params.durationSeconds ?? 5
  const workDir = await mkdtemp(join(tmpdir(), 'reels-youtube-outro-'))
  const outputPath = join(workDir, 'outro.mp4')
  const { width, height } = params.frame
  const platePath = existsSync(YOUTUBE_OUTRO_PLATE_PATH)
    ? YOUTUBE_OUTRO_PLATE_PATH
    : YOUTUBE_OUTRO_FALLBACK_PATH
  if (!existsSync(platePath)) {
    throw new Error(
      `YouTube outro plate missing (${platePath}). Deploy lib/reels-maker/assets/youtube-outro-plate.png (or youtube-outro-bg.png).`,
    )
  }

  try {
    const { default: sharp } = await import('sharp')
    const { existsSync: fileExists, readFileSync } = await import('fs')
    const title = params.listingTitle?.trim() || 'Homes.ph Listing'
    const details = params.listingDetails?.trim() || ''
    // Sample default accent when partners omit color — gold like Homes.ph plate
    const titleColor = normalizeHexColor(params.listingTitleColor) || '#F4AA1D'

    // Match sample: logo top-left · airy 3-line title fills center-left · mascot BL · QR right
    const scale = height / YOUTUBE_OUTRO_DESIGN_H
    const outScale = height / 1080
    let titleFont = Math.round(YOUTUBE_OUTRO_TITLE_SIZE * outScale)
    const minTitleFont = Math.round(YOUTUBE_OUTRO_TITLE_SIZE * outScale)
    let titleLeading = YOUTUBE_OUTRO_TITLE_LEADING
    const detailFont = Math.round(YOUTUBE_OUTRO_DETAIL_SIZE * scale)
    const textX = Math.round(width * 0.09)

    // Logo plate (partner wordmark) — title must start below this band
    const logoY = Math.round(height * 0.055)
    const logoW = Math.round(width * 0.18)
    let logoBottomY = Math.round(height * 0.15)
    if (params.logoBuffer?.length) {
      const logoMeta = await sharp(params.logoBuffer).metadata()
      const srcW = logoMeta.width ?? logoW
      const srcH = logoMeta.height ?? Math.round(logoW * 0.3)
      const logoH = Math.round(logoW * (srcH / srcW))
      logoBottomY = logoY + logoH + Math.round(height * 0.02)
    }

    // Keep a clear gutter before the QR column — clip + composited QR sit to the right
    const qrLeft = Math.round(width * 0.685)
    const qrSafeMargin = Math.round(width * 0.022)
    const titleMaxW = Math.max(280, qrLeft - textX - qrSafeMargin)

    const safeTop = logoBottomY
    const safeBottom = Math.round(height * YOUTUBE_OUTRO_TEXT_BOTTOM)

    const fitTitle = (fontPx: number, leading: number, chars: number) => {
      const lines = wrapYoutubeTitle(title.toUpperCase(), chars, 3)
      const gap = Math.round(fontPx * leading)
      return { lines, gap, blockH: Math.max(0, lines.length - 1) * gap + fontPx, chars }
    }

    const titleWidthBudget = titleMaxW - Math.round(6 * outScale)

    let fontFaceCss = ''
    if (fileExists(BEBAS_NEUE_PATH)) {
      const b64 = readFileSync(BEBAS_NEUE_PATH).toString('base64')
      fontFaceCss = `@font-face{font-family:'BebasNeue';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:400;font-style:normal;}`
    }
    const bebasFamily = fontFaceCss
      ? `'BebasNeue', 'Arial Narrow', Impact, sans-serif`
      : `'Arial Narrow', Impact, Arial, sans-serif`

    const measureTitleLineWidth = async (line: string, fontPx: number) => {
      const probe = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.max(120, fontPx + 40)}">
  <style type="text/css">${fontFaceCss}
  .m{font-family:${bebasFamily};font-size:${fontPx}px;font-weight:400;fill:#000;letter-spacing:1px;}
  </style>
  <text x="0" y="${fontPx}" class="m">${escapeXml(line)}</text>
</svg>`)
      const { data, info } = await sharp(probe).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      let maxX = 0
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * 4
          if (data[i + 3] > 0) maxX = Math.max(maxX, x)
        }
      }
      return maxX + 1
    }

    const titleLinesFit = async (lines: string[], fontPx: number) => {
      for (const line of lines) {
        const w = await measureTitleLineWidth(line, fontPx)
        if (w > titleWidthBudget) return false
      }
      return true
    }

    const wrapTitleForFont = async (fontPx: number, leading: number) => {
      const preferred = preferredYoutubeTitleLines(title)
      if (await titleLinesFit(preferred, fontPx)) {
        const gap = Math.round(fontPx * leading)
        return {
          lines: preferred,
          gap,
          blockH: Math.max(0, preferred.length - 1) * gap + fontPx,
          chars: 0,
        }
      }
      let lo = 16
      let hi = 42
      let best = fitTitle(fontPx, leading, 16)
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        const candidate = fitTitle(fontPx, leading, mid)
        if (await titleLinesFit(candidate.lines, fontPx)) {
          best = candidate
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      return best
    }

    const findLargestFittingFont = async (startFont: number, leading: number) => {
      let font = startFont
      let best = await wrapTitleForFont(font, leading)
      while (font > Math.round(42 * outScale)) {
        if (await titleLinesFit(best.lines, font)) break
        font = Math.max(Math.round(42 * outScale), font - 2)
        best = await wrapTitleForFont(font, leading)
      }
      while (font < startFont) {
        const next = font + 2
        const candidate = await wrapTitleForFont(next, leading)
        if (await titleLinesFit(candidate.lines, next)) {
          font = next
          best = candidate
        } else break
      }
      return { font, ...best }
    }

    // Details stay on one line when possible — sample uses a single subtitle
    const detailGap = Math.round(detailFont * 1.15)
    const detailChars = Math.max(32, Math.min(52, Math.floor(titleMaxW / (detailFont * 0.52))))
    const detailLines = details ? wrapYoutubeTitle(details, detailChars, 1) : []

    let { font: titleFontFit, lines: titleLines, gap: titleLineGap, blockH: titleBlockH } =
      await findLargestFittingFont(titleFont, titleLeading)
    titleFont = titleFontFit

    const titleToDetailGap = () =>
      Math.round((YOUTUBE_OUTRO_TITLE_DETAIL_GAP + detailFont * 0.35) * scale)
    const detailsExtra = detailLines.length
      ? titleToDetailGap() + detailLines.length * detailGap
      : 0

    const titleCapAboveBaseline = () => Math.round(titleFont * 0.88)

    const measureVisualTop = (titleY: number) => titleY - titleCapAboveBaseline()

    const measureVisualBottom = (titleY: number) => {
      const lastTitleBaseline = titleY + Math.max(0, titleLines.length - 1) * titleLineGap
      const titleInkBottom = lastTitleBaseline + Math.round(titleFont * 0.12)
      if (!detailLines.length) return titleInkBottom
      const detailsY = lastTitleBaseline + titleToDetailGap()
      const lastDetailBaseline = detailsY + (detailLines.length - 1) * detailGap
      return lastDetailBaseline + Math.round(detailFont * 0.35)
    }

    // Shrink only if the filled band would hit the mascot
    const titleBandTop = () => logoBottomY + Math.round(height * 0.01)
    const titleBandBottom = () => safeBottom - detailsExtra

    const computeFillLeading = (firstBaseline: number) => {
      const bandH = titleBandBottom() - titleBandTop()
      const ideal = Math.round(
        (bandH - titleFont) / Math.max(1, titleLines.length - 1),
      )
      const minGap = Math.round(titleFont * YOUTUBE_OUTRO_TITLE_LEADING_MIN)
      const maxGap = Math.round(titleFont * YOUTUBE_OUTRO_TITLE_LEADING_MAX)
      return Math.max(minGap, Math.min(maxGap, ideal))
    }

    let titleLineGapFilled = computeFillLeading(0)

    for (
      let i = 0;
      i < 12 &&
      measureVisualBottom(titleBandTop() + titleFont + (titleLines.length - 1) * titleLineGapFilled) >
        safeBottom;
      i++
    ) {
      if (titleLineGapFilled > Math.round(titleFont * YOUTUBE_OUTRO_TITLE_LEADING_MIN)) {
        titleLineGapFilled = Math.max(
          Math.round(titleFont * YOUTUBE_OUTRO_TITLE_LEADING_MIN),
          Math.round(titleLineGapFilled * 0.96),
        )
      } else {
        titleFont = Math.max(Math.round(48 * outScale), Math.round(titleFont * 0.97))
        const refit = await findLargestFittingFont(titleFont, titleLeading)
        titleFont = refit.font
        titleLines = refit.lines
        titleLineGapFilled = computeFillLeading(0)
      }
    }
    titleLineGap = titleLineGapFilled

    // Pin below logo, then expand leading so the block fills logo → mascot band (sample look)
    const minTitleBaselineY = () => titleBandTop() + titleCapAboveBaseline()
    let adjTitleY = minTitleBaselineY()
    let adjDetailsY = adjTitleY
    const syncDetailsY = () => {
      adjDetailsY =
        adjTitleY +
        Math.max(0, titleLines.length - 1) * titleLineGap +
        titleToDetailGap()
    }
    syncDetailsY()

    // Nudge down to occupy spare band height (sample: title fills center-left)
    const blockH =
      titleFont + Math.max(0, titleLines.length - 1) * titleLineGap
    const spare = titleBandBottom() - (titleBandTop() + blockH)
    if (spare > Math.round(height * 0.02)) {
      adjTitleY += Math.round(spare * 0.45)
      syncDetailsY()
    }

    let visualBottom = measureVisualBottom(adjTitleY)
    if (visualBottom > safeBottom) {
      adjTitleY = Math.max(minTitleBaselineY(), adjTitleY - (visualBottom - safeBottom))
      syncDetailsY()
    }

    const detailFamily = `Arial, Helvetica, sans-serif`

    const titleTspans = titleLines
      .map((line, i) => {
        const y = adjTitleY + i * titleLineGap
        return `<tspan x="${textX}" y="${y}">${escapeXml(line)}</tspan>`
      })
      .join('')

    const detailTspans = detailLines
      .map((line, i) => {
        const y = adjDetailsY + i * detailGap
        return `<tspan x="${textX}" y="${y}">${escapeXml(line)}</tspan>`
      })
      .join('')

    // Hard clip: text never paints into QR column; vertical limit enforced by layout above
    const clipW = textX + titleWidthBudget
    const clipH = safeBottom
    const textSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <style type="text/css">${fontFaceCss}
    .yt-title{font-family:${bebasFamily};font-size:${titleFont}px;font-weight:400;fill:${titleColor};letter-spacing:1px;}
    .yt-detail{font-family:${detailFamily};font-size:${detailFont}px;font-weight:500;fill:#FFFFFF;letter-spacing:0.2px;}
    </style>
    <clipPath id="textSafe"><rect x="0" y="0" width="${clipW}" height="${clipH}"/></clipPath>
  </defs>
  <g clip-path="url(#textSafe)">
  <text x="${textX}" y="${adjTitleY}" class="yt-title">${titleTspans}</text>
  ${
    detailLines.length
      ? `<text x="${textX}" y="${adjDetailsY}" class="yt-detail">${detailTspans}</text>`
      : ''
  }
  </g>
</svg>`)
    const textPng = await sharp(textSvg).png().toBuffer()
    const textPath = join(workDir, 'yt-title.png')
    await writeFile(textPath, textPng)

    const inputs: string[] = ['-loop', '1', '-framerate', String(FPS), '-i', platePath]
    let inputIndex = 1
    const filters: string[] = [coverScaleFilter(width, height, '0:v', 'plate')]
    let base = 'plate'

    // Partner logo top-left (clean plate has no baked wordmark)
    if (params.logoBuffer?.length) {
      const logoPath = join(workDir, 'logo.png')
      await writeFile(logoPath, params.logoBuffer)
      inputs.push('-loop', '1', '-framerate', String(FPS), '-i', logoPath)
      const idx = inputIndex++
      const logoW = Math.round(width * 0.18)
      filters.push(
        `[${idx}:v]scale=w=${logoW}:h=-1,format=rgba,fade=t=in:st=0.05:d=0.35:alpha=1[ytlogo]`,
        `[${base}][ytlogo]overlay=x='${Math.round(width * 0.045)}':y='${Math.round(height * 0.055)}'[withlogo]`,
      )
      base = 'withlogo'
    }

    // Title (clipped left of QR / above mascot)
    inputs.push('-loop', '1', '-framerate', String(FPS), '-i', textPath)
    {
      const idx = inputIndex++
      filters.push(
        `[${idx}:v]format=rgba,fade=t=in:st=0.2:d=0.45:alpha=1[yttitle]`,
        `[${base}][yttitle]overlay=x=0:y=0[withtitle]`,
      )
      base = 'withtitle'
    }

    // QR last so it always sits above any text overflow
    if (params.qrBuffer?.length) {
      const qrPath = join(workDir, 'qr.png')
      await writeFile(qrPath, params.qrBuffer)
      inputs.push('-loop', '1', '-framerate', String(FPS), '-i', qrPath)
      const idx = inputIndex++
      const qrSize = Math.round(Math.min(height * 0.55, width * 0.26))
      const qrX = Math.round(width * 0.68 + (width * 0.28 - qrSize) / 2)
      const qrY = Math.round((height - qrSize) / 2)
      const pad = Math.round(Math.max(16, height * 0.018))
      filters.push(
        `[${idx}:v]scale=${qrSize}:${qrSize}[ytqrs]`,
        `[ytqrs]pad=iw+${pad * 2}:ih+${pad * 2}:${pad}:${pad}:white,format=rgba,fade=t=in:st=0.35:d=0.5:alpha=1[ytqr]`,
        `[${base}][ytqr]overlay=x=${qrX - pad}:y=${qrY - pad}[withqr]`,
      )
      base = 'withqr'
    }

    filters.push(`[${base}]format=yuv420p[vout]`)

    const buffer = await runFilterComplex({
      inputs,
      filterComplex: filters.join(';'),
      durationSeconds: duration,
      outputPath,
    })
    return { buffer, durationSeconds: duration }
  } finally {
    await safeRemoveDir(workDir)
  }
}

function normalizeHexColor(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const hex = raw.replace(/^0x/i, '').replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex) && !/^[0-9a-fA-F]{3}$/.test(hex)) return ''
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  return `#${full.toUpperCase()}`
}

/** Sample-style 3 lines: location on 1–2 comma-balanced rows, then PHILIPPINES | price. */
function preferredYoutubeTitleLines(text: string): string[] {
  const raw = text.replace(/\\n/g, '\n').trim()
  if (raw.includes('\n')) {
    return raw
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((l) => l.toUpperCase())
  }

  const pipeIdx = raw.indexOf('|')
  if (pipeIdx >= 0) {
    const price = raw.slice(pipeIdx).trim()
    const loc = raw
      .slice(0, pipeIdx)
      .trim()
      .toUpperCase()
      .replace(/\s*,?\s*PHILIPPINES\s*,?\s*$/i, '')
      .replace(/,\s*$/, '')
      .trim()
    const line3 = `PHILIPPINES ${price}`.replace(/\s+/g, ' ').trim()
    const headLines = splitCommaBalancedLines(loc, 2)
    return [...headLines.slice(0, 2), line3].filter(Boolean)
  }

  return splitCommaBalancedLines(raw.toUpperCase(), 3)
}

/** Split on commas into up to N lines (matches sample plate wrapping). */
function splitCommaBalancedLines(text: string, maxLines: number): string[] {
  const chunks = text
    .split(/(?<=,)\s*/)
    .map((c) => c.trim())
    .filter(Boolean)
  if (!chunks.length) return []
  if (chunks.length <= maxLines) return chunks

  const lines: string[] = []
  let current = ''
  const target = Math.ceil(chunks.length / maxLines)
  for (const chunk of chunks) {
    const next = current ? `${current} ${chunk}` : chunk
    if (lines.length < maxLines - 1 && next.split(/\s+/).length >= target && current) {
      lines.push(current)
      current = chunk
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, maxLines)
}

/** Honor explicit newlines (e.g. name\\nprice), then soft-wrap long lines.
 * Prefers breaks after commas; keeps price suffix on the last line when present. */
function wrapYoutubeTitle(text: string, maxLen: number, maxLines = 3) {
  const raw = text.replace(/\\n/g, '\n').trim()
  const pipeIdx = raw.indexOf('|')
  if (pipeIdx >= 0 && maxLines >= 2) {
    const beforePrice = raw.slice(0, pipeIdx).trim()
    const price = raw.slice(pipeIdx).trim()
    const words = beforePrice.toUpperCase().split(/\s+/).filter(Boolean)
    const tailWord = (words[words.length - 1] ?? '').replace(/,/g, '')
    const head = words
      .slice(0, -1)
      .join(' ')
      .replace(/\s*,?\s*PHILIPPINES\s*,?\s*$/i, '')
      .replace(/,\s*$/, '')
      .trim()
    const line3 = `PHILIPPINES ${price}`.replace(/\s+/g, ' ').trim()
    const headLines = head ? wrapYoutubeTitleBody(head, maxLen, Math.min(maxLines - 1, 2)) : []
    if (!headLines.length) return [line3].slice(0, maxLines)
    return [...headLines.slice(0, maxLines - 1), line3].slice(0, maxLines)
  }
  return wrapYoutubeTitleBody(raw.toUpperCase(), maxLen, maxLines)
}

function wrapYoutubeTitleBody(text: string, maxLen: number, maxLines = 3) {
  const paragraphs = text
    .replace(/\\n/g, '\n')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const lines: string[] = []
  const pushOverflow = (chunk: string) => {
    if (!chunk) return
    if (lines.length < maxLines) {
      lines.push(chunk)
      return
    }
    const last = lines[lines.length - 1] ?? ''
    lines[lines.length - 1] = last ? `${last} ${chunk}` : chunk
  }
  for (const paragraph of paragraphs.length ? paragraphs : [text.trim()]) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let current = ''
    for (const word of words) {
      if (lines.length >= maxLines) {
        pushOverflow(current)
        current = ''
        pushOverflow(word)
        continue
      }
      const next = current ? `${current} ${word}` : word
      if (next.length > maxLen && current) {
        lines.push(current)
        current = word
      } else {
        current = next
        // Prefer ending a line after a comma when we're in the last ~30% of the budget
        if (
          word.endsWith(',') &&
          current.length >= Math.floor(maxLen * 0.7) &&
          current.length <= maxLen &&
          lines.length < maxLines - 1
        ) {
          lines.push(current)
          current = ''
        }
      }
    }
    pushOverflow(current)
  }
  return lines.slice(0, maxLines)
}

/** Universal branded end card — geometric plate + logo / QR / CTA. */
export async function renderBrandedEndCardScene(params: {
  frame: ReelFrameDimensions
  logoBuffer?: Buffer | null
  qrBuffer?: Buffer | null
  ctaText?: string | null
  durationSeconds?: number
}): Promise<RenderedListingScene> {
  return renderBrandedOutroScene({
    frame: params.frame,
    logoBuffer: params.logoBuffer,
    qrBuffer: params.qrBuffer,
    ctaText: params.ctaText,
    durationSeconds: params.durationSeconds ?? 4,
  })
}

/** Agent contact outro — same geometric plate as the branded end card. */
export async function renderAgentCardScene(params: {
  frame: ReelFrameDimensions
  logoBuffer?: Buffer | null
  headshotBuffer?: Buffer | null
  qrBuffer?: Buffer | null
  agent: OutroAgent
  durationSeconds?: number
}): Promise<RenderedListingScene> {
  return renderBrandedOutroScene({
    frame: params.frame,
    logoBuffer: params.logoBuffer,
    headshotBuffer: params.headshotBuffer,
    qrBuffer: params.qrBuffer,
    agent: params.agent,
    durationSeconds: params.durationSeconds ?? 4.5,
  })
}
