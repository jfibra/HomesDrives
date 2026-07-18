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
