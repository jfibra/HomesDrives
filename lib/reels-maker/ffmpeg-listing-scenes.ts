import { execFile } from 'child_process'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

import { resolveFfmpegBinary } from '@/lib/reels-maker/audio-utils'
import type { ReelFrameDimensions } from '@/lib/reels-maker/aspect-ratio'
import {
  CAPTION_COLOR,
  TITLE_ACCENT,
  TITLE_COLOR,
  escapeDrawText,
  fadeIn,
  fontParam,
  slideUp,
} from '@/lib/reels-maker/ffmpeg-text'
import { buildReelVideoEncodeArgs } from '@/lib/reels-maker/render-quality'
import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'

const execFileAsync = promisify(execFile)

const FPS = 30
const ENCODE_ARGS = [...buildReelVideoEncodeArgs(FPS)]
/** Clean neutral backdrop for the structural (non-photo) Listing Showcase scenes. */
const CARD_BACKGROUND = '0x0B0B0C'

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

/** Fade-in + scale-up + soft glow halo for the centered logo, used by both intro and outro. */
async function renderLogoScene(params: {
  frame: ReelFrameDimensions
  logoBuffer: Buffer
  durationSeconds: number
  ctaText?: string
}): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'reels-logo-scene-'))
  const outputPath = join(workDir, 'logo-scene.mp4')
  const logoPath = join(workDir, 'logo.png')

  try {
    await writeFile(logoPath, params.logoBuffer)

    const logoWidth = Math.round(params.frame.width * 0.42)
    const growDuration = 0.6

    const filters: string[] = [
      `[1:v]scale=w=${logoWidth}:h=-1,format=rgba,scale=w='iw*(0.82+0.18*min(1\\,t/${growDuration}))':h='ih*(0.82+0.18*min(1\\,t/${growDuration}))':eval=frame[lg]`,
      '[lg]split=2[lgsharp][lgblursrc]',
      `[lgblursrc]gblur=sigma=28,colorchannelmixer=aa=0.55,fade=t=in:st=0:d=${growDuration}:alpha=1[glow]`,
      `[lgsharp]fade=t=in:st=0:d=${growDuration}:alpha=1[sharp]`,
      `[0:v][glow]overlay=x='(main_w-overlay_w)/2':y='(main_h-overlay_h)/2'[withglow]`,
    ]

    let base = 'withglow'
    if (params.ctaText?.trim()) {
      filters.push(`[${base}][sharp]overlay=x='(main_w-overlay_w)/2':y='main_h*0.42'[withlogo]`)
      base = 'withlogo'
      const ctaDelay = growDuration + 0.35
      const fade = fadeIn(ctaDelay, 0.5)
      const yExpr = slideUp(0.62, 22, ctaDelay, 0.5)
      const bodyFont = fontParam('body')
      filters.push(
        `[${base}]drawtext=${bodyFont}:text='${escapeDrawText(params.ctaText.trim())}':fontcolor=${CAPTION_COLOR}:fontsize=38:x=(w-text_w)/2:y='${yExpr}':alpha='${fade}':shadowcolor=black@0.75:shadowx=2:shadowy=2[vout]`,
      )
    } else {
      filters.push(`[${base}][sharp]overlay=x='(main_w-overlay_w)/2':y='(main_h-overlay_h)/2'[vout]`)
    }

    return await runFilterComplex({
      inputs: [
        '-f',
        'lavfi',
        '-i',
        `color=c=${CARD_BACKGROUND}:s=${params.frame.width}x${params.frame.height}:d=${params.durationSeconds}:r=${FPS}`,
        '-loop',
        '1',
        '-i',
        logoPath,
      ],
      filterComplex: filters.join(';'),
      durationSeconds: params.durationSeconds,
      outputPath,
    })
  } finally {
    await safeRemoveDir(workDir)
  }
}

export async function renderLogoIntroScene(params: {
  frame: ReelFrameDimensions
  logoBuffer: Buffer
  durationSeconds?: number
}): Promise<RenderedListingScene> {
  const durationSeconds = params.durationSeconds ?? 2.6
  const buffer = await renderLogoScene({ frame: params.frame, logoBuffer: params.logoBuffer, durationSeconds })
  return { buffer, durationSeconds }
}

export async function renderLogoOutroScene(params: {
  frame: ReelFrameDimensions
  logoBuffer: Buffer
  ctaText?: string
  durationSeconds?: number
}): Promise<RenderedListingScene> {
  const durationSeconds = params.durationSeconds ?? 2.8
  const buffer = await renderLogoScene({
    frame: params.frame,
    logoBuffer: params.logoBuffer,
    durationSeconds,
    ctaText: params.ctaText,
  })
  return { buffer, durationSeconds }
}

/**
 * Universal branded end card for all templates when outroEnabled.
 * Logo reveal + optional QR slide-up + CTA line — no PowerPoint bounce.
 */
export async function renderBrandedEndCardScene(params: {
  frame: ReelFrameDimensions
  logoBuffer?: Buffer | null
  qrBuffer?: Buffer | null
  ctaText?: string | null
  durationSeconds?: number
}): Promise<RenderedListingScene> {
  const duration = params.durationSeconds ?? 3.2
  const workDir = await mkdtemp(join(tmpdir(), 'reels-end-card-'))
  const outputPath = join(workDir, 'end-card.mp4')

  try {
    const inputs: string[] = [
      '-f',
      'lavfi',
      '-i',
      `color=c=${CARD_BACKGROUND}:s=${params.frame.width}x${params.frame.height}:d=${duration}:r=${FPS}`,
    ]

    let inputIndex = 1
    const filters: string[] = []
    let base = '0:v'

    if (params.logoBuffer) {
      const logoPath = join(workDir, 'logo.png')
      await writeFile(logoPath, params.logoBuffer)
      inputs.push('-loop', '1', '-i', logoPath)
      const idx = inputIndex++
      const logoWidth = Math.round(params.frame.width * 0.4)
      filters.push(
        `[${idx}:v]scale=w=${logoWidth}:h=-1,format=rgba,scale=w='iw*(0.88+0.12*min(1\\,t/0.55))':h='ih*(0.88+0.12*min(1\\,t/0.55))':eval=frame[lg]`,
        '[lg]split=2[lgsharp][lgblursrc]',
        '[lgblursrc]gblur=sigma=24,colorchannelmixer=aa=0.45,fade=t=in:st=0:d=0.55:alpha=1[glow]',
        '[lgsharp]fade=t=in:st=0:d=0.55:alpha=1[sharp]',
        `[${base}][glow]overlay=x='(main_w-overlay_w)/2':y='main_h*0.28'[withglow]`,
        `[withglow][sharp]overlay=x='(main_w-overlay_w)/2':y='main_h*0.28'[withlogo]`,
      )
      base = 'withlogo'
    }

    if (params.qrBuffer) {
      const qrPath = join(workDir, 'qr.png')
      await writeFile(qrPath, params.qrBuffer)
      inputs.push('-loop', '1', '-i', qrPath)
      const idx = inputIndex++
      const qrSize = Math.round(params.frame.width * 0.26)
      const qrPad = 14
      filters.push(
        `[${idx}:v]scale=${qrSize}:${qrSize}[qrs]`,
        `[qrs]pad=iw+${qrPad * 2}:ih+${qrPad * 2}:${qrPad}:${qrPad}:white[qrbox]`,
        `[qrbox]format=rgba,fade=t=in:st=0.75:d=0.5:alpha=1[qrfade]`,
        `[${base}][qrfade]overlay=x='(main_w-overlay_w)/2':y='main_h*0.58'[withqr]`,
      )
      base = 'withqr'
    }

    const cta = params.ctaText?.trim() || 'Homes.ph'
    const bodyFont = fontParam('body')
    const ctaDelay = params.qrBuffer ? 1.15 : 0.85
    const fade = fadeIn(ctaDelay, 0.45)
    const yExpr = slideUp(params.qrBuffer ? 0.88 : 0.62, 20, ctaDelay, 0.45)
    filters.push(
      `[${base}]drawtext=${bodyFont}:text='${escapeDrawText(cta)}':fontcolor=${CAPTION_COLOR}:fontsize=34:x=(w-text_w)/2:y='${yExpr}':alpha='${fade}':shadowcolor=black@0.75:shadowx=2:shadowy=2[vout]`,
    )

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

/** The "business card" scene: headshot + QR + contact details + agency logo. */
export async function renderAgentCardScene(params: {
  frame: ReelFrameDimensions
  logoBuffer?: Buffer | null
  headshotBuffer?: Buffer | null
  qrBuffer?: Buffer | null
  agent: { name?: string; phone?: string; email?: string; agencyName?: string }
  durationSeconds?: number
}): Promise<RenderedListingScene> {
  const duration = params.durationSeconds ?? 4
  const workDir = await mkdtemp(join(tmpdir(), 'reels-agent-card-'))
  const outputPath = join(workDir, 'agent-card.mp4')

  try {
    const inputs: string[] = [
      '-f',
      'lavfi',
      '-i',
      `color=c=${CARD_BACKGROUND}:s=${params.frame.width}x${params.frame.height}:d=${duration}:r=${FPS}`,
    ]

    let inputIndex = 1
    const filters: string[] = []
    let base = '0:v'

    if (params.headshotBuffer) {
      const headshotPath = join(workDir, 'headshot.png')
      await writeFile(headshotPath, params.headshotBuffer)
      inputs.push('-loop', '1', '-i', headshotPath)
      const idx = inputIndex++
      const size = Math.round(params.frame.width * 0.34)
      filters.push(`[${idx}:v]scale=${size}:${size},format=rgba,fade=t=in:st=0.1:d=0.5:alpha=1[headshot]`)
      filters.push(`[${base}][headshot]overlay=x='(main_w-overlay_w)/2':y='main_h*0.16'[card1]`)
      base = 'card1'
    }

    if (params.qrBuffer) {
      const qrPath = join(workDir, 'qr.png')
      await writeFile(qrPath, params.qrBuffer)
      inputs.push('-loop', '1', '-i', qrPath)
      const idx = inputIndex++
      const qrSize = Math.round(params.frame.width * 0.34)
      const qrPad = 16
      filters.push(
        `[${idx}:v]scale=${qrSize}:${qrSize}[qrs]`,
        `[qrs]pad=iw+${qrPad * 2}:ih+${qrPad * 2}:${qrPad}:${qrPad}:white[qrbox]`,
        `[qrbox]format=rgba,fade=t=in:st=0.6:d=0.55:alpha=1[qrfade]`,
      )
      filters.push(`[${base}][qrfade]overlay=x='(main_w-overlay_w)/2':y='main_h*0.62'[card2]`)
      base = 'card2'
    }

    if (params.logoBuffer) {
      const logoPath = join(workDir, 'logo.png')
      await writeFile(logoPath, params.logoBuffer)
      inputs.push('-loop', '1', '-i', logoPath)
      const idx = inputIndex++
      const logoWidth = Math.round(params.frame.width * 0.22)
      filters.push(`[${idx}:v]scale=w=${logoWidth}:h=-1,format=rgba,fade=t=in:st=0.05:d=0.4:alpha=1[brandlogo]`)
      filters.push(`[${base}][brandlogo]overlay=x='(main_w-overlay_w)/2':y='main_h*0.06'[card3]`)
      base = 'card3'
    }

    const bodyFont = fontParam('body')
    const brandFont = fontParam('brand')
    const textLines: Array<{ text: string; y: number; size: number; font: string; color: string }> = []
    if (params.agent.name?.trim()) {
      textLines.push({ text: params.agent.name.trim(), y: 0.4, size: 44, font: brandFont, color: TITLE_COLOR })
    }
    if (params.agent.phone?.trim()) {
      textLines.push({ text: params.agent.phone.trim(), y: 0.465, size: 30, font: bodyFont, color: CAPTION_COLOR })
    }
    if (params.agent.email?.trim()) {
      textLines.push({ text: params.agent.email.trim(), y: 0.505, size: 26, font: bodyFont, color: CAPTION_COLOR })
    }
    if (params.agent.agencyName?.trim()) {
      textLines.push({ text: params.agent.agencyName.trim(), y: 0.545, size: 24, font: bodyFont, color: TITLE_ACCENT })
    }

    const textFilters: string[] = []
    textLines.forEach((line, index) => {
      const delay = 0.15 + index * 0.12
      const fade = fadeIn(delay, 0.45)
      const yExpr = slideUp(line.y, 22, delay, 0.45)
      textFilters.push(
        `drawtext=${line.font}:text='${escapeDrawText(line.text)}':fontcolor=${line.color}:fontsize=${line.size}:x=(w-text_w)/2:y='${yExpr}':alpha='${fade}':shadowcolor=black@0.75:shadowx=2:shadowy=2`,
      )
    })

    if (params.qrBuffer) {
      const ctaDelay = 0.15 + textLines.length * 0.12 + 0.5
      const fade = fadeIn(ctaDelay, 0.4)
      textFilters.push(
        `drawtext=${bodyFont}:text='${escapeDrawText('Scan to view listing')}':fontcolor=${CAPTION_COLOR}:fontsize=26:x=(w-text_w)/2:y='h*0.945':alpha='${fade}':shadowcolor=black@0.70:shadowx=2:shadowy=2`,
      )
    }

    filters.push(textFilters.length ? `[${base}]${textFilters.join(',')}[vout]` : `[${base}]null[vout]`)

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
