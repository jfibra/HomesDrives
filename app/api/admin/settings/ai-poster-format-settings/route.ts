import { NextResponse } from 'next/server'

import { requireAdminByCode } from '@/lib/server/albums'
import { getAdminSettingByKey, upsertAdminSetting } from '@/lib/server/admin-settings'
import {
  AI_POSTER_FORMAT_SETTING_CATEGORY,
  AI_POSTER_FORMAT_SETTING_DESCRIPTION,
  AI_POSTER_FORMAT_SETTING_KEY,
  DEFAULT_POSTER_FORMATS,
  normalizePosterFormats,
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)

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
    const formats = mergeFormatsWithDefaults(normalized)

    if (formats.length !== normalized.length) {
      setting = await upsertAdminSetting({
        key: AI_POSTER_FORMAT_SETTING_KEY,
        category: AI_POSTER_FORMAT_SETTING_CATEGORY,
        description: AI_POSTER_FORMAT_SETTING_DESCRIPTION,
        value: JSON.stringify(formats),
      })
    }

    return NextResponse.json({
      setting: {
        key: AI_POSTER_FORMAT_SETTING_KEY,
        category: setting.category ?? AI_POSTER_FORMAT_SETTING_CATEGORY,
        description: setting.description ?? AI_POSTER_FORMAT_SETTING_DESCRIPTION,
        updated_at: setting.updated_at ?? null,
        value: formats,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load poster formats.'
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

    const formats = normalizePosterFormats(body?.value)
    const setting = await upsertAdminSetting({
      key: AI_POSTER_FORMAT_SETTING_KEY,
      category: AI_POSTER_FORMAT_SETTING_CATEGORY,
      description: AI_POSTER_FORMAT_SETTING_DESCRIPTION,
      value: JSON.stringify(formats),
    })

    return NextResponse.json({
      setting: {
        key: setting.key,
        category: setting.category,
        description: setting.description,
        updated_at: setting.updated_at,
        value: formats,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save poster formats.'
    const status = /forbidden|not active|not found/i.test(message)
      ? 403
      : /missing adminCode|must be an array|missing a|invalid/i.test(message)
        ? 400
        : 500

    return NextResponse.json({ error: message }, { status })
  }
}