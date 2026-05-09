import fs from 'node:fs'
import path from 'node:path'

import { createClient } from '@supabase/supabase-js'

const SETTINGS_TABLE_CANDIDATES = ['settings', 'site_settings', 'app_settings']

const AI_POSTER_FORMAT_SETTING_KEY = 'ai_poster_format_settings'
const AI_POSTER_TYPE_SETTING_KEY = 'ai_poster_type_settings'
const AI_POSTER_DESIGN_STYLE_SETTING_KEY = 'ai_poster_design_style_settings'
const AI_POSTER_FORMAT_SETTING_CATEGORY = 'poster-generator'

const DEFAULT_POSTER_FORMATS = [
  { category: 'Social Media', name: 'Facebook Post', width: 1080, height: 1080 },
  { category: 'Social Media', name: 'Facebook Story', width: 1080, height: 1920 },
  { category: 'Social Media', name: 'Instagram Post', width: 1080, height: 1080 },
  { category: 'Social Media', name: 'Instagram Story', width: 1080, height: 1920 },
  { category: 'Social Media', name: 'LinkedIn Post', width: 1200, height: 627 },
  { category: 'Print', name: 'A4 Portrait', width: 2480, height: 3508 },
  { category: 'Print', name: 'Bondpaper Size', width: 2550, height: 3300 },
  { category: 'Print', name: 'Flyer', width: 1080, height: 1350 },
  { category: 'Print', name: 'Landscape Presentation', width: 1920, height: 1080 },
]

const DEFAULT_POSTER_TYPES = [
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

const DEFAULT_POSTER_DESIGN_STYLES = [
  { name: 'Minimalist', traits: ['Clean', 'White space', 'Modern typography'] },
  { name: 'Corporate', traits: ['Professional', 'Structured layout'] },
  { name: 'Bold Marketing', traits: ['Strong headlines', 'Vibrant colors'] },
  { name: 'Elegant', traits: ['Luxury branding', 'Premium typography'] },
  { name: 'Modern Abstract', traits: ['Shapes', 'Gradient', 'AI abstract background'] },
]

function parseDotEnv(raw) {
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function mergeByKey(current, defaults, keyBuilder) {
  const merged = [...current]
  const seen = new Set(current.map(keyBuilder))
  for (const item of defaults) {
    const key = keyBuilder(item)
    if (!seen.has(key)) {
      merged.push(item)
      seen.add(key)
    }
  }
  return merged
}

async function detectSettingsTable(supabase) {
  let lastErr = null
  for (const table of SETTINGS_TABLE_CANDIDATES) {
    const { error } = await supabase.from(table).select('key').limit(1)
    if (!error) return table
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      lastErr = error
      continue
    }
    throw error
  }
  throw lastErr || new Error('Unable to detect settings table.')
}

async function upsertSetting({ supabase, tableName, key, value, description }) {
  const { data: existing, error: readError } = await supabase
    .from(tableName)
    .select('id, value')
    .eq('key', key)
    .maybeSingle()

  if (readError) throw readError

  if (existing) {
    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        value: JSON.stringify(value),
        description,
        category: AI_POSTER_FORMAT_SETTING_CATEGORY,
      })
      .eq('id', existing.id)

    if (updateError) throw updateError
    return 'updated'
  }

  const { error: insertError } = await supabase
    .from(tableName)
    .insert({
      key,
      value: JSON.stringify(value),
      description,
      category: AI_POSTER_FORMAT_SETTING_CATEGORY,
    })

  if (insertError) throw insertError
  return 'inserted'
}

async function main() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found in workspace root.')
  }

  const env = parseDotEnv(fs.readFileSync(envPath, 'utf8'))
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const tableName = await detectSettingsTable(supabase)

  const { data: existingFormats } = await supabase
    .from(tableName)
    .select('value')
    .eq('key', AI_POSTER_FORMAT_SETTING_KEY)
    .maybeSingle()
  const { data: existingTypes } = await supabase
    .from(tableName)
    .select('value')
    .eq('key', AI_POSTER_TYPE_SETTING_KEY)
    .maybeSingle()
  const { data: existingStyles } = await supabase
    .from(tableName)
    .select('value')
    .eq('key', AI_POSTER_DESIGN_STYLE_SETTING_KEY)
    .maybeSingle()

  const currentFormats = (() => {
    try {
      return Array.isArray(JSON.parse(existingFormats?.value || '[]')) ? JSON.parse(existingFormats?.value || '[]') : []
    } catch {
      return []
    }
  })()

  const currentTypes = (() => {
    try {
      return Array.isArray(JSON.parse(existingTypes?.value || '[]')) ? JSON.parse(existingTypes?.value || '[]') : []
    } catch {
      return []
    }
  })()

  const currentStyles = (() => {
    try {
      return Array.isArray(JSON.parse(existingStyles?.value || '[]')) ? JSON.parse(existingStyles?.value || '[]') : []
    } catch {
      return []
    }
  })()

  const mergedFormats = mergeByKey(
    currentFormats,
    DEFAULT_POSTER_FORMATS,
    (item) => `${item.category || ''}::${item.name || ''}`,
  )
  const mergedTypes = mergeByKey(
    currentTypes,
    DEFAULT_POSTER_TYPES,
    (item) => `${item.category || ''}::${item.name || ''}`,
  )
  const mergedStyles = mergeByKey(currentStyles, DEFAULT_POSTER_DESIGN_STYLES, (item) => item.name || '')

  const formatState = await upsertSetting({
    supabase,
    tableName,
    key: AI_POSTER_FORMAT_SETTING_KEY,
    value: mergedFormats,
    description: 'Available AI poster output formats grouped by category. Stored as JSON array.',
  })

  const typeState = await upsertSetting({
    supabase,
    tableName,
    key: AI_POSTER_TYPE_SETTING_KEY,
    value: mergedTypes,
    description: 'Poster categories and poster types used by the AI poster generator.',
  })

  const styleState = await upsertSetting({
    supabase,
    tableName,
    key: AI_POSTER_DESIGN_STYLE_SETTING_KEY,
    value: mergedStyles,
    description: 'Design styles and trait lists used by the AI poster generator.',
  })

  console.log(`Settings table: ${tableName}`)
  console.log(`Formats: ${formatState} (${mergedFormats.length} total)`) 
  console.log(`Poster types: ${typeState} (${mergedTypes.length} total)`) 
  console.log(`Design styles: ${styleState} (${mergedStyles.length} total)`) 
}

main().catch((error) => {
  console.error('Seed failed:', error.message || error)
  process.exit(1)
})
