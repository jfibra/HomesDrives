import type { ReelFrameDimensions } from '@/lib/reels-maker/aspect-ratio'
import { REEL_SCALE_FLAGS } from '@/lib/reels-maker/render-quality'
import type { ReelSceneMotion } from '@/lib/reels-maker/types'

const FPS = 30

/**
 * Straight directional pans only (no circular / orbital float).
 * View pans: left↔right and top↔bottom at a gentle fixed zoom.
 */
export const DIRECTIONAL_MOTIONS: ReelSceneMotion[] = [
  'gentle-pan-left', // right → left
  'gentle-pan-right', // left → right
  'reveal-from-top', // top → bottom
  'vertical-drift', // bottom → top
]

/** Full set kept for type compatibility; non-directional names alias into the 4 pans. */
export const CINEMATIC_MOTIONS: ReelSceneMotion[] = [
  ...DIRECTIONAL_MOTIONS,
  'horizontal-track',
  'dolly-in',
  'dolly-out',
  'push-in-corner',
  'float',
  'slow-zoom-in',
  'slow-zoom-out',
  'static',
]

const LEGACY_ALIASES: Record<string, ReelSceneMotion> = {
  'slow-zoom-in': 'gentle-pan-right',
  'slow-zoom-out': 'gentle-pan-left',
  'dolly-in': 'gentle-pan-right',
  'dolly-out': 'gentle-pan-left',
  'push-in-corner': 'reveal-from-top',
  'horizontal-track': 'gentle-pan-left',
  float: 'vertical-drift',
  static: 'gentle-pan-right',
}

export function normalizeMotion(motion: string | null | undefined): ReelSceneMotion {
  if (!motion) return 'gentle-pan-right'
  if ((DIRECTIONAL_MOTIONS as string[]).includes(motion)) return motion as ReelSceneMotion
  if ((CINEMATIC_MOTIONS as string[]).includes(motion)) {
    return LEGACY_ALIASES[motion] ?? (motion as ReelSceneMotion)
  }
  return LEGACY_ALIASES[motion] ?? 'gentle-pan-right'
}

export function buildPreScale(frame: ReelFrameDimensions) {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  return `scale=${frame.preScaleWidth}:${frame.preScaleHeight}:force_original_aspect_ratio=increase:${scaleFlags},crop=${frame.preScaleWidth}:${frame.preScaleHeight}`
}

export function buildStaticScale(frame: ReelFrameDimensions) {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  return `scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase:${scaleFlags},crop=${frame.width}:${frame.height},fps=${FPS}`
}

/** Linear progress 0→1 across the scene (smooth, not circular). */
function linearExpr(frames: number) {
  return `min(1\\,on/${Math.max(1, frames - 1)})`
}

/**
 * Map motion → straight Ken Burns pans (constant mild zoom, no sin/cos float).
 */
export function buildMotionFilter(
  motion: ReelSceneMotion,
  durationSeconds: number,
  frame: ReelFrameDimensions,
): string {
  const preScale = buildPreScale(frame)
  const frames = Math.max(1, Math.round(durationSeconds * FPS))
  const t = linearExpr(frames)
  const size = `s=${frame.width}x${frame.height}:fps=${FPS}:d=${frames}`
  const resolved = normalizeMotion(motion)
  // Mild zoom so edges have room to pan without circular wander
  const z = `1.12`

  switch (resolved) {
    case 'gentle-pan-left':
      // Right → left
      return `${preScale},zoompan=z='${z}':x='(iw-iw/zoom)*(1-${t})':y='ih/2-(ih/zoom/2)':${size}`
    case 'gentle-pan-right':
    case 'horizontal-track':
      // Left → right
      return `${preScale},zoompan=z='${z}':x='(iw-iw/zoom)*${t}':y='ih/2-(ih/zoom/2)':${size}`
    case 'reveal-from-top':
      // Top → bottom
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*${t}':${size}`
    case 'vertical-drift':
      // Bottom → top
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-${t})':${size}`
    default:
      return `${preScale},zoompan=z='${z}':x='(iw-iw/zoom)*${t}':y='ih/2-(ih/zoom/2)':${size}`
  }
}

/** Directional crop push for video clips (no circular motion). */
export function buildVideoMotionFilter(
  durationSeconds: number,
  frame: ReelFrameDimensions,
  motion?: ReelSceneMotion | null,
): string {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  const overW = Math.round(frame.width * 1.12)
  const overH = Math.round(frame.height * 1.12)
  const dur = Math.max(0.5, durationSeconds)
  const resolved = normalizeMotion(motion)
  const p = `min(1\\,t/${dur})`

  let x = `(iw-ow)/2`
  let y = `(ih-oh)/2`
  switch (resolved) {
    case 'gentle-pan-left':
      x = `(iw-ow)*(1-${p})`
      break
    case 'gentle-pan-right':
    case 'horizontal-track':
      x = `(iw-ow)*${p}`
      break
    case 'reveal-from-top':
      y = `(ih-oh)*${p}`
      break
    case 'vertical-drift':
      y = `(ih-oh)*(1-${p})`
      break
    default:
      x = `(iw-ow)*${p}`
      break
  }

  return [
    `scale=${overW}:${overH}:force_original_aspect_ratio=increase:${scaleFlags}`,
    `crop=${overW}:${overH}`,
    `crop=${frame.width}:${frame.height}:${x}:${y}`,
    `fps=${FPS}`,
  ].join(',')
}

/** Rotate: L→R, R→L, T→B, B→T — never the same twice in a row. */
export function pickCinematicMotion(index: number, previous?: ReelSceneMotion | null): ReelSceneMotion {
  const palette = DIRECTIONAL_MOTIONS
  let pick = palette[index % palette.length]
  if (previous && normalizeMotion(pick) === normalizeMotion(previous)) {
    pick = palette[(index + 1) % palette.length]
  }
  return pick
}

export function ensureNoRepeatMotions(motions: ReelSceneMotion[]): ReelSceneMotion[] {
  const result: ReelSceneMotion[] = []
  for (let i = 0; i < motions.length; i++) {
    let next = normalizeMotion(motions[i])
    const prev = result[i - 1]
    if (prev && next === prev) {
      next = pickCinematicMotion(i + 1, prev)
    }
    // Prefer the deterministic directional sequence
    if (!DIRECTIONAL_MOTIONS.includes(next)) {
      next = pickCinematicMotion(i, prev)
    }
    result.push(next)
  }
  return result
}
