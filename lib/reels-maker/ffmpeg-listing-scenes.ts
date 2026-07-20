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
    const title = params.listingTitle?.trim() || 'Homes.ph Listing'
    const details = params.listingDetails?.trim() || ''

    // Match sample: title mid-left above mascot; details one line under title
    const titleFont = Math.round(Math.min(68, Math.max(40, width * 0.036)))
    const detailFont = Math.round(Math.min(32, Math.max(20, width * 0.018)))
    const cardW = Math.round(width * 0.48)
    const lineGap = Math.round(titleFont * 1.2)
    const titleLines = wrapYoutubeTitle(title, 26)
    const detailLine = details.slice(0, 64)
    const titleBlockH = titleLines.length * lineGap
    const cardH = titleBlockH + (detailLine ? Math.round(detailFont * 2.2) : Math.round(titleFont * 0.4))
    const cardX = Math.round(width * 0.055)
    // Vertically center the text block in the left half, clear of mascot (~bottom 28%)
    const cardY = Math.round(height * 0.34)

    const titleTspans = titleLines
      .map((line, i) => {
        const dy = i === 0 ? 0 : lineGap
        if (i === 0) return `<tspan x="0" dy="0">${escapeXml(line)}</tspan>`
        return `<tspan x="0" dy="${dy}">${escapeXml(line)}</tspan>`
      })
      .join('')

    const titleBaseline = Math.round(titleFont * 0.92)
    const detailY = titleBaseline + titleBlockH + Math.round(detailFont * 0.55)

    const textSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}">
  <text x="0" y="${titleBaseline}" font-family="Georgia, 'Times New Roman', serif" font-size="${titleFont}"
    font-weight="700" fill="#FFFFFF">${titleTspans}</text>
  ${
    detailLine
      ? `<text x="0" y="${detailY}" font-family="Arial, Helvetica, sans-serif" font-size="${detailFont}"
    font-weight="500" fill="#E8EEF5">${escapeXml(detailLine)}</text>`
      : ''
  }
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
      const logoW = Math.round(width * 0.2)
      filters.push(
        `[${idx}:v]scale=w=${logoW}:h=-1,format=rgba,fade=t=in:st=0.05:d=0.35:alpha=1[ytlogo]`,
        `[${base}][ytlogo]overlay=x='${Math.round(width * 0.045)}':y='${Math.round(height * 0.06)}'[withlogo]`,
      )
      base = 'withlogo'
    }

    inputs.push('-loop', '1', '-framerate', String(FPS), '-i', textPath)
    {
      const idx = inputIndex++
      filters.push(
        `[${idx}:v]format=rgba,fade=t=in:st=0.2:d=0.45:alpha=1[yttitle]`,
        `[${base}][yttitle]overlay=x=${cardX}:y=${cardY}[withtitle]`,
      )
      base = 'withtitle'
    }

    if (params.qrBuffer?.length) {
      const qrPath = join(workDir, 'qr.png')
      await writeFile(qrPath, params.qrBuffer)
      inputs.push('-loop', '1', '-framerate', String(FPS), '-i', qrPath)
      const idx = inputIndex++
      // Sample: large QR on right ~38% of height, vertically centered
      const qrSize = Math.round(Math.min(height * 0.58, width * 0.28))
      const qrX = Math.round(width * 0.66 + (width * 0.28 - qrSize) / 2)
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

function wrapYoutubeTitle(text: string, maxLen: number) {
  const words = text.trim().split(/\s+/).filter(Boolean)
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
