import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'

const DATA_DIR = join(process.cwd(), '.data')
const KEYS_FILE = join(DATA_DIR, 'api-keys.json')

export type ApiKey = {
  key: string
  name: string
  createdAt: string
  active: boolean
}

async function readKeys(): Promise<ApiKey[]> {
  try {
    const raw = await readFile(KEYS_FILE, 'utf8')
    return JSON.parse(raw) as ApiKey[]
  } catch {
    return []
  }
}

async function writeKeys(keys: ApiKey[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8')
}

export async function createApiKey(name: string): Promise<ApiKey> {
  const keys = await readKeys()
  const key: ApiKey = {
    key: `rk_${randomBytes(24).toString('hex')}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
    active: true,
  }
  keys.push(key)
  await writeKeys(keys)
  return key
}

export async function validateApiKey(key: string): Promise<boolean> {
  const keys = await readKeys()
  return keys.some((k) => k.key === key && k.active)
}

export async function listApiKeys(): Promise<ApiKey[]> {
  return readKeys()
}

export async function revokeApiKey(key: string): Promise<boolean> {
  const keys = await readKeys()
  const target = keys.find((k) => k.key === key)
  if (!target) return false
  target.active = false
  await writeKeys(keys)
  return true
}
