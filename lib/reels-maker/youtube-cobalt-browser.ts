const DEFAULT_COBALT_API_URL = 'https://api.cobalt.tools'

type CobaltInstanceInfo = {
  cobalt?: {
    turnstileSitekey?: string
    url?: string
  }
}

type CobaltSessionResponse = {
  token?: string
  exp?: number
  status?: string
  error?: { code?: string }
}

type CobaltTunnelResponse = {
  status?: string
  url?: string
  filename?: string
  error?: { code?: string }
}

function cobaltApiUrl() {
  return (process.env.NEXT_PUBLIC_COBALT_API_URL || DEFAULT_COBALT_API_URL).replace(/\/$/, '')
}

export async function fetchCobaltBrowserInstance() {
  const response = await fetch(`${cobaltApiUrl()}/`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Cobalt instance info returned HTTP ${response.status}.`)
  }

  return (await response.json()) as CobaltInstanceInfo
}

export async function createCobaltBrowserSession(turnstileResponse: string) {
  const response = await fetch(`${cobaltApiUrl()}/session`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'cf-turnstile-response': turnstileResponse,
    },
    cache: 'no-store',
  })

  const data = (await response.json()) as CobaltSessionResponse
  if (!response.ok || !data.token) {
    throw new Error(data.error?.code || `Cobalt session failed with HTTP ${response.status}.`)
  }

  return data.token
}

export async function fetchCobaltBrowserAudioUrl(youtubeUrl: string, bearerToken: string) {
  const response = await fetch(`${cobaltApiUrl()}/`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      url: youtubeUrl,
      downloadMode: 'audio',
      audioFormat: 'mp3',
      audioBitrate: '128',
      alwaysProxy: true,
    }),
    cache: 'no-store',
  })

  const data = (await response.json()) as CobaltTunnelResponse
  if (!response.ok) {
    throw new Error(data.error?.code || `Cobalt audio request failed with HTTP ${response.status}.`)
  }

  if ((data.status === 'tunnel' || data.status === 'redirect') && data.url?.trim()) {
    return {
      streamUrl: data.url.trim(),
      fileName: data.filename?.trim() || 'youtube-track.mp3',
    }
  }

  throw new Error(data.error?.code || `Cobalt returned status ${data.status ?? 'unknown'}.`)
}

export async function resolveCobaltBrowserAudio(
  youtubeUrl: string,
  requestTurnstile: (sitekey: string) => Promise<string>,
) {
  const instance = await fetchCobaltBrowserInstance()
  const sitekey = instance.cobalt?.turnstileSitekey?.trim()
  if (!sitekey) {
    throw new Error('Cobalt instance does not expose a Turnstile site key.')
  }

  const turnstileResponse = await requestTurnstile(sitekey)
  const bearerToken = await createCobaltBrowserSession(turnstileResponse)
  return fetchCobaltBrowserAudioUrl(youtubeUrl, bearerToken)
}
