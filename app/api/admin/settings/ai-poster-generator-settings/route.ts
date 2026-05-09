import { NextResponse } from 'next/server'

import { requireAdminByCode } from '@/lib/server/albums'
import { getAdminSettingByKey, upsertAdminSetting } from '@/lib/server/admin-settings'
import {
  AI_POSTER_DESIGN_STYLE_SETTING_DESCRIPTION,
  AI_POSTER_DESIGN_STYLE_SETTING_KEY,
  AI_POSTER_FORMAT_SETTING_CATEGORY,
  AI_POSTER_FORMAT_SETTING_DESCRIPTION,
  AI_POSTER_FORMAT_SETTING_KEY,
  AI_POSTER_TYPE_SETTING_DESCRIPTION,
  AI_POSTER_TYPE_SETTING_KEY,
  DEFAULT_POSTER_DESIGN_STYLES,
  DEFAULT_POSTER_FORMATS,
  DEFAULT_POSTER_TYPES,
  normalizePosterDesignStyles,
  normalizePosterFormats,
  normalizePosterTypes,
} from '@/lib/poster-format-settings'

export const runtime = 'nodejs'

function mergeFormatsWithDefaults(current: ReturnType<typeof normalizePosterFormats>) {
  const merged = [...current]
  const seen = new Set(current.map((item) => `${item.category}::${item.name}`))

  for (const item of DEFAULT_POSTER_FORMATS) {
    const key = `${item.category}::${item.name}`
    if (!seen.has(key)) {
      merged.push(item)
      seen.add(key)
    }
  }

  return merged
}

function mergePosterTypesWithDefaults(current: ReturnType<typeof normalizePosterTypes>) {
  const merged = [...current]
  const seen = new Set(current.map((item) => `${item.category}::${item.name}`))

  for (const item of DEFAULT_POSTER_TYPES) {
    const key = `${item.category}::${item.name}`
    if (!seen.has(key)) {
      merged.push(item)
      seen.add(key)
    }
  }

  return merged
}

function mergeDesignStylesWithDefaults(current: ReturnType<typeof normalizePosterDesignStyles>) {
  const merged = [...current]
  const seen = new Set(current.map((item) => item.name))

  for (const item of DEFAULT_POSTER_DESIGN_STYLES) {
    if (!seen.has(item.name)) {
      merged.push(item)
      seen.add(item.name)
    }
  }

  return merged
}

async function loadOrSeedFormats() {
  let setting = await getAdminSettingByKey(AI_POSTER_FORMAT_SETTING_KEY)

  if (!setting?.value) {
    setting = await upsertAdminSetting({
      key: AI_POSTER_FORMAT_SETTING_KEY,
      category: AI_POSTER_FORMAT_SETTING_CATEGORY,
      description: AI_POSTER_FORMAT_SETTING_DESCRIPTION,
      value: JSON.stringify(DEFAULT_POSTER_FORMATS),
    })
  }

  const parsedValue = setting.value ? JSON.parse(setting.value) : DEFAULT_POSTER_FORMATS
  const normalized = normalizePosterFormats(parsedValue)
  const merged = mergeFormatsWithDefaults(normalized)

  if (merged.length !== normalized.length) {
    setting = await upsertAdminSetting({
      key: AI_POSTER_FORMAT_SETTING_KEY,
      category: AI_POSTER_FORMAT_SETTING_CATEGORY,
      description: AI_POSTER_FORMAT_SETTING_DESCRIPTION,
      value: JSON.stringify(merged),
    })
  }

  return {
    updatedAt: setting.updated_at,
    value: merged,
  }
}

async function loadOrSeedPosterTypes() {
  let setting = await getAdminSettingByKey(AI_POSTER_TYPE_SETTING_KEY)

  if (!setting?.value) {
    setting = await upsertAdminSetting({
      key: AI_POSTER_TYPE_SETTING_KEY,
      category: AI_POSTER_FORMAT_SETTING_CATEGORY,
      description: AI_POSTER_TYPE_SETTING_DESCRIPTION,
      value: JSON.stringify(DEFAULT_POSTER_TYPES),
    })
  }

  const parsedValue = setting.value ? JSON.parse(setting.value) : DEFAULT_POSTER_TYPES
  const normalized = normalizePosterTypes(parsedValue)
  const merged = mergePosterTypesWithDefaults(normalized)

  if (merged.length !== normalized.length) {
    setting = await upsertAdminSetting({
      key: AI_POSTER_TYPE_SETTING_KEY,
      category: AI_POSTER_FORMAT_SETTING_CATEGORY,
      description: AI_POSTER_TYPE_SETTING_DESCRIPTION,
      value: JSON.stringify(merged),
    })
  }

  return {
    updatedAt: setting.updated_at,
    value: merged,
  }
}

async function loadOrSeedDesignStyles() {
  let setting = await getAdminSettingByKey(AI_POSTER_DESIGN_STYLE_SETTING_KEY)

  if (!setting?.value) {
    setting = await upsertAdminSetting({
      key: AI_POSTER_DESIGN_STYLE_SETTING_KEY,
      category: AI_POSTER_FORMAT_SETTING_CATEGORY,
      description: AI_POSTER_DESIGN_STYLE_SETTING_DESCRIPTION,
      value: JSON.stringify(DEFAULT_POSTER_DESIGN_STYLES),
    })
  }

  const parsedValue = setting.value ? JSON.parse(setting.value) : DEFAULT_POSTER_DESIGN_STYLES
  const normalized = normalizePosterDesignStyles(parsedValue)
  const merged = mergeDesignStylesWithDefaults(normalized)

  if (merged.length !== normalized.length) {
    setting = await upsertAdminSetting({
      key: AI_POSTER_DESIGN_STYLE_SETTING_KEY,
      category: AI_POSTER_FORMAT_SETTING_CATEGORY,
      description: AI_POSTER_DESIGN_STYLE_SETTING_DESCRIPTION,
      value: JSON.stringify(merged),
    })
  }

  return {
    updatedAt: setting.updated_at,
    value: merged,
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)

    const [formats, posterTypes, designStyles] = await Promise.all([
      loadOrSeedFormats(),
      loadOrSeedPosterTypes(),
      loadOrSeedDesignStyles(),
    ])

    return NextResponse.json({
      settings: {
        formats,
        posterTypes,
        designStyles,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to load AI poster generator settings.'
    const status = /forbidden|not active|not found/i.test(message)
      ? 403
      : /missing adminCode/i.test(message)
        ? 400
        : 500

    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const adminCode =
      typeof body?.adminCode === 'string' && body.adminCode.trim() ? body.adminCode.trim() : ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)

    const formats = normalizePosterFormats(body?.formats)
    const posterTypes = normalizePosterTypes(body?.posterTypes)
    const designStyles = normalizePosterDesignStyles(body?.designStyles)

    const [savedFormats, savedPosterTypes, savedDesignStyles] = await Promise.all([
      upsertAdminSetting({
        key: AI_POSTER_FORMAT_SETTING_KEY,
        category: AI_POSTER_FORMAT_SETTING_CATEGORY,
        description: AI_POSTER_FORMAT_SETTING_DESCRIPTION,
        value: JSON.stringify(formats),
      }),
      upsertAdminSetting({
        key: AI_POSTER_TYPE_SETTING_KEY,
        category: AI_POSTER_FORMAT_SETTING_CATEGORY,
        description: AI_POSTER_TYPE_SETTING_DESCRIPTION,
        value: JSON.stringify(posterTypes),
      }),
      upsertAdminSetting({
        key: AI_POSTER_DESIGN_STYLE_SETTING_KEY,
        category: AI_POSTER_FORMAT_SETTING_CATEGORY,
        description: AI_POSTER_DESIGN_STYLE_SETTING_DESCRIPTION,
        value: JSON.stringify(designStyles),
      }),
    ])

    return NextResponse.json({
      settings: {
        formats: {
          updatedAt: savedFormats.updated_at,
          value: formats,
        },
        posterTypes: {
          updatedAt: savedPosterTypes.updated_at,
          value: posterTypes,
        },
        designStyles: {
          updatedAt: savedDesignStyles.updated_at,
          value: designStyles,
        },
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to save AI poster generator settings.'
    const status = /forbidden|not active|not found/i.test(message)
      ? 403
      : /missing adminCode|must be an array|missing|invalid|at least one/i.test(message)
        ? 400
        : 500

    return NextResponse.json({ error: message }, { status })
  }
}