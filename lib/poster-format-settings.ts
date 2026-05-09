export type PosterFormat = {
  category: string
  height: number
  name: string
  width: number
}

export type PosterType = {
  category: string
  name: string
}

export type PosterDesignStyle = {
  name: string
  traits: string[]
}

type PosterFormatInput = {
  category?: unknown
  height?: unknown
  name?: unknown
  width?: unknown
}

type PosterTypeInput = {
  category?: unknown
  name?: unknown
}

type PosterDesignStyleInput = {
  name?: unknown
  traits?: unknown
}

export const AI_POSTER_FORMAT_SETTING_KEY = 'ai_poster_format_settings'
export const AI_POSTER_TYPE_SETTING_KEY = 'ai_poster_type_settings'
export const AI_POSTER_DESIGN_STYLE_SETTING_KEY = 'ai_poster_design_style_settings'
export const AI_POSTER_FORMAT_SETTING_CATEGORY = 'poster-generator'
export const AI_POSTER_FORMAT_SETTING_DESCRIPTION =
  'Available AI poster output formats grouped by category. Stored as JSON array.'
export const AI_POSTER_TYPE_SETTING_DESCRIPTION =
  'Poster categories and poster types used by the AI poster generator.'
export const AI_POSTER_DESIGN_STYLE_SETTING_DESCRIPTION =
  'Design styles and trait lists used by the AI poster generator.'

export const DEFAULT_POSTER_FORMATS: PosterFormat[] = [
  {
    name: 'Facebook Post',
    width: 1080,
    height: 1080,
    category: 'Social Media',
  },
  {
    name: 'Facebook Story',
    width: 1080,
    height: 1920,
    category: 'Social Media',
  },
  {
    name: 'Instagram Post',
    width: 1080,
    height: 1080,
    category: 'Social Media',
  },
  {
    name: 'Instagram Story',
    width: 1080,
    height: 1920,
    category: 'Social Media',
  },
  {
    name: 'LinkedIn Post',
    width: 1200,
    height: 627,
    category: 'Social Media',
  },
  {
    name: 'A4 Portrait',
    width: 2480,
    height: 3508,
    category: 'Print',
  },
  {
    name: 'Bondpaper Size',
    width: 2550,
    height: 3300,
    category: 'Print',
  },
  {
    name: 'Flyer',
    width: 1080,
    height: 1350,
    category: 'Print',
  },
  {
    name: 'Landscape Presentation',
    width: 1920,
    height: 1080,
    category: 'Print',
  },
]

export const DEFAULT_POSTER_TYPES: PosterType[] = [
  { category: 'Business', name: 'Announcement' },
  { category: 'Business', name: 'Event Poster' },
  { category: 'Business', name: 'Restaurant Feature' },
  { category: 'Business', name: 'Promo Poster' },
  { category: 'Business', name: 'Corporate Letter' },
  { category: 'Real Estate', name: 'Motivational Quote' },
  { category: 'Real Estate', name: 'Sales Tips' },
  { category: 'Real Estate', name: 'Property Showcase' },
  { category: 'Real Estate', name: 'Agent Recruitment' },
  { category: 'Real Estate', name: 'Open House' },
  { category: 'Government / Compliance', name: 'Training Schedule' },
  { category: 'Government / Compliance', name: 'Public Advisory' },
  { category: 'Government / Compliance', name: 'Seminar Announcement' },
]

export const DEFAULT_POSTER_DESIGN_STYLES: PosterDesignStyle[] = [
  {
    name: 'Minimalist',
    traits: ['Clean', 'White space', 'Modern typography'],
  },
  {
    name: 'Corporate',
    traits: ['Professional', 'Structured layout'],
  },
  {
    name: 'Bold Marketing',
    traits: ['Strong headlines', 'Vibrant colors'],
  },
  {
    name: 'Elegant',
    traits: ['Luxury branding', 'Premium typography'],
  },
  {
    name: 'Modern Abstract',
    traits: ['Shapes', 'Gradient', 'AI abstract background'],
  },
]

export function normalizePosterFormats(value: unknown): PosterFormat[] {
  if (!Array.isArray(value)) {
    throw new Error('Poster formats must be an array.')
  }

  return value.map((item, index) => {
    const format = item as PosterFormatInput
    const name = typeof format.name === 'string' ? format.name.trim() : ''
    const category = typeof format.category === 'string' ? format.category.trim() : ''
    const width = Number(format.width)
    const height = Number(format.height)

    if (!name) {
      throw new Error(`Format #${index + 1} is missing a name.`)
    }

    if (!category) {
      throw new Error(`Format #${index + 1} is missing a category.`)
    }

    if (!Number.isFinite(width) || width <= 0) {
      throw new Error(`Format #${index + 1} has an invalid width.`)
    }

    if (!Number.isFinite(height) || height <= 0) {
      throw new Error(`Format #${index + 1} has an invalid height.`)
    }

    return {
      name,
      width,
      height,
      category,
    }
  })
}

export function normalizePosterTypes(value: unknown): PosterType[] {
  if (!Array.isArray(value)) {
    throw new Error('Poster types must be an array.')
  }

  return value.map((item, index) => {
    const posterType = item as PosterTypeInput
    const name = typeof posterType.name === 'string' ? posterType.name.trim() : ''
    const category = typeof posterType.category === 'string' ? posterType.category.trim() : ''

    if (!name) {
      throw new Error(`Poster type #${index + 1} is missing a name.`)
    }

    if (!category) {
      throw new Error(`Poster type #${index + 1} is missing a category.`)
    }

    return {
      name,
      category,
    }
  })
}

export function normalizePosterDesignStyles(value: unknown): PosterDesignStyle[] {
  if (!Array.isArray(value)) {
    throw new Error('Poster design styles must be an array.')
  }

  return value.map((item, index) => {
    const style = item as PosterDesignStyleInput
    const name = typeof style.name === 'string' ? style.name.trim() : ''
    const traits = Array.isArray(style.traits)
      ? style.traits
          .map((trait) => (typeof trait === 'string' ? trait.trim() : ''))
          .filter(Boolean)
      : []

    if (!name) {
      throw new Error(`Design style #${index + 1} is missing a name.`)
    }

    if (traits.length === 0) {
      throw new Error(`Design style #${index + 1} needs at least one trait.`)
    }

    return {
      name,
      traits,
    }
  })
}