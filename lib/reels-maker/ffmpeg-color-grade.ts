import type { ReelTemplateId } from '@/lib/reels-maker/types'

type Grade = {
  contrast: number
  brightness: number
  saturation: number
  gamma: number
  gammaR: number
  gammaB: number
  sharpness: number
  /** Film grain strength for noise filter (0 = off). */
  grain: number
}

// Stronger cinematic LUTs-as-eq — luxury darker/gold, beach cooler, villa warm
const GRADES: Record<ReelTemplateId, Grade> = {
  cinematic: {
    contrast: 1.14,
    brightness: -0.01,
    saturation: 0.9,
    gamma: 0.98,
    gammaR: 1.03,
    gammaB: 0.97,
    sharpness: 1.0,
    grain: 4,
  },
  luxury: {
    contrast: 1.16,
    brightness: -0.02,
    saturation: 1.02,
    gamma: 1.0,
    gammaR: 1.06,
    gammaB: 0.94,
    sharpness: 1.05,
    grain: 5,
  },
  modern: {
    contrast: 1.18,
    brightness: 0.0,
    saturation: 0.96,
    gamma: 0.95,
    gammaR: 1.0,
    gammaB: 1.02,
    sharpness: 1.25,
    grain: 3,
  },
  'real-estate': {
    contrast: 1.12,
    brightness: 0.03,
    saturation: 1.08,
    gamma: 1.02,
    gammaR: 1.04,
    gammaB: 0.96,
    sharpness: 1.0,
    grain: 3,
  },
  travel: {
    contrast: 1.14,
    brightness: 0.02,
    saturation: 1.18,
    gamma: 0.94,
    gammaR: 1.01,
    gammaB: 1.02,
    sharpness: 1.15,
    grain: 4,
  },
  family: {
    contrast: 1.08,
    brightness: 0.04,
    saturation: 1.06,
    gamma: 1.04,
    gammaR: 1.03,
    gammaB: 0.97,
    sharpness: 0.75,
    grain: 2,
  },
  event: {
    contrast: 1.18,
    brightness: 0.01,
    saturation: 1.16,
    gamma: 0.94,
    gammaR: 1.02,
    gammaB: 0.99,
    sharpness: 1.1,
    grain: 3,
  },
  birthday: {
    contrast: 1.12,
    brightness: 0.03,
    saturation: 1.14,
    gamma: 1.0,
    gammaR: 1.04,
    gammaB: 0.97,
    sharpness: 0.95,
    grain: 2,
  },
  wedding: {
    contrast: 1.06,
    brightness: 0.05,
    saturation: 0.88,
    gamma: 1.08,
    gammaR: 1.05,
    gammaB: 0.95,
    sharpness: 0.65,
    grain: 4,
  },
  minimal: {
    contrast: 1.1,
    brightness: 0.01,
    saturation: 0.82,
    gamma: 1.01,
    gammaR: 1.0,
    gammaB: 1.0,
    sharpness: 1.05,
    grain: 3,
  },
  'social-trend': {
    contrast: 1.22,
    brightness: 0.01,
    saturation: 1.2,
    gamma: 0.92,
    gammaR: 1.01,
    gammaB: 0.99,
    sharpness: 1.35,
    grain: 4,
  },
  'listing-showcase': {
    contrast: 1.14,
    brightness: 0.01,
    saturation: 1.04,
    gamma: 0.98,
    gammaR: 1.03,
    gammaB: 0.97,
    sharpness: 1.15,
    grain: 4,
  },
}

/**
 * Premium color polish: eq grade + unsharp bloom approximation + subtle film grain.
 */
export function buildColorGradeFilter(templateId: ReelTemplateId): string {
  const g = GRADES[templateId] ?? GRADES.cinematic
  const parts: string[] = [
    `eq=contrast=${g.contrast.toFixed(2)}:brightness=${g.brightness.toFixed(2)}:saturation=${g.saturation.toFixed(2)}:gamma=${g.gamma.toFixed(2)}:gamma_r=${g.gammaR.toFixed(2)}:gamma_b=${g.gammaB.toFixed(2)}`,
  ]

  if (g.sharpness > 0) {
    // Soft bloom approx: mild unsharp + slightly softer large radius
    parts.push(`unsharp=lx=5:ly=5:la=${(g.sharpness * 0.45).toFixed(2)}:cx=3:cy=3:ca=${g.sharpness.toFixed(2)}`)
  }

  if (g.grain > 0) {
    parts.push(`noise=alls=${g.grain}:allf=t+u`)
  }

  return parts.join(',')
}
