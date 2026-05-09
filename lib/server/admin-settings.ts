import { createSupabaseAdminClient } from '@/lib/server/albums'

export type AdminSettingRow = {
  id: string
  key: string
  value: string | null
  description: string | null
  category: string | null
  updated_at: string | null
}

const SETTINGS_TABLE_CANDIDATES = ['settings', 'site_settings', 'app_settings'] as const

let resolvedSettingsTablePromise: Promise<string> | null = null

async function detectSettingsTable() {
  const supabaseAdmin = createSupabaseAdminClient()
  let lastError: Error | null = null

  for (const tableName of SETTINGS_TABLE_CANDIDATES) {
    const { error } = await supabaseAdmin.from(tableName).select('key').limit(1)

    if (!error) {
      return tableName
    }

    if (/relation|does not exist|schema cache/i.test(error.message)) {
      lastError = new Error(error.message)
      continue
    }

    throw new Error(error.message)
  }

  throw lastError ?? new Error('Unable to locate a settings table.')
}

export async function getSettingsTableName() {
  if (!resolvedSettingsTablePromise) {
    resolvedSettingsTablePromise = detectSettingsTable()
  }

  return resolvedSettingsTablePromise
}

export async function getAdminSettingByKey(key: string) {
  const tableName = await getSettingsTableName()
  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from(tableName)
    .select('id, key, value, description, category, updated_at')
    .eq('key', key)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as AdminSettingRow | null) ?? null
}

export async function upsertAdminSetting(params: {
  key: string
  value: string
  description?: string | null
  category?: string | null
}) {
  const tableName = await getSettingsTableName()
  const supabaseAdmin = createSupabaseAdminClient()
  const existing = await getAdminSettingByKey(params.key)

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .update({
        value: params.value,
        description: params.description ?? existing.description,
        category: params.category ?? existing.category,
      })
      .eq('id', existing.id)
      .select('id, key, value, description, category, updated_at')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as AdminSettingRow
  }

  const { data, error } = await supabaseAdmin
    .from(tableName)
    .insert({
      key: params.key,
      value: params.value,
      description: params.description ?? null,
      category: params.category ?? 'poster-generator',
    })
    .select('id, key, value, description, category, updated_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as AdminSettingRow
}