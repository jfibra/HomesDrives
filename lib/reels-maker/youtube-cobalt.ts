const DEFAULT_COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://co.wuk.sh',
  'https://cobalt-api.kwiatekmiki.com',
]

type CobaltResponse = {
  status?: string
  url?: string
  error?: { code?: string; context?: { service?: string } }
}

function cobaltDisabled() {
  return /^(1|true|yes|on)$/i.test(process.env.COBALT_API_DISABLED?.trim() || '')
}

function cobaltInstances(): string[] {
  const configured = process.env.COBALT_API_URL?.trim()
  if (configured) return [configured.replace(/\/$/, '')]

  const list = process.env.COBALT_API_INSTANCES?.split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean)

  return list?.length ? list : DEFAULT_COBALT_INSTANCES
}

function cobaltHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  const apiKey = process.env.COBALT_API_KEY?.trim()
  if (apiKey) {
    headers.Authorization = `Api-Key ${apiKey}`
  }

  return headers
}

export function cobaltApiKeyConfigured() {
  return Boolean(process.env.COBALT_API_KEY?.trim())
}

export async function fetchCobaltAudioUrl(youtubeUrl: string) {
  if (cobaltDisabled()) {
    throw new Error('Cobalt API fallback is disabled.')
  }

  let lastError: Error | null = null

  for (const base of cobaltInstances()) {
    try {
      const response = await fetch(`${base}/`, {
        method: 'POST',
        headers: cobaltHeaders(),
        body: JSON.stringify({
          url: youtubeUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: '128',
          alwaysProxy: true,
        }),
        signal: AbortSignal.timeout(35_000),
      })

      const text = await response.text()
      if (!text.trim().startsWith('{')) {
        lastError = new Error(`Cobalt ${base} returned non-JSON (HTTP ${response.status})`)
        continue
      }

      const data = JSON.parse(text) as CobaltResponse
      if (!response.ok) {
        lastError = new Error(data.error?.code || `Cobalt ${base} returned HTTP ${response.status}`)
        continue
      }

      if ((data.status === 'tunnel' || data.status === 'redirect') && data.url?.trim()) {
        return { url: data.url.trim(), instance: base }
      }

      lastError = new Error(data.error?.code || `Cobalt ${base} returned status ${data.status ?? 'unknown'}`)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[reels-maker/youtube/cobalt] ${base} failed:`, lastError.message)
    }
  }

  throw lastError ?? new Error('All Cobalt API instances failed.')
}
