const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

export function getReelsApiUrl(): string | null {
  const url = process.env.REELS_API_URL?.trim()
  return url || null
}

export function shouldProxyReelsApi(): boolean {
  return Boolean(getReelsApiUrl())
}

/** Forward a reels API request to the EC2 worker (used when REELS_API_URL is set on Vercel). */
export async function proxyReelsApiRequest(request: Request, path: string): Promise<Response | null> {
  const base = getReelsApiUrl()
  if (!base) return null

  const incoming = new URL(request.url)
  const target = `${base.replace(/\/$/, '')}${path}${incoming.search}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  const secret = process.env.REELS_API_SECRET?.trim()
  if (secret) {
    headers.set('x-reels-api-secret', secret)
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    signal: AbortSignal.timeout(600_000),
  }

  if (hasBody) {
    init.body = request.body
    init.duplex = 'half'
  }

  const upstream = await fetch(target, init)

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  })
}
