const DEFAULT_PRODUCTION_ORIGIN = 'https://homes.ph'

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, '')
}

/** Public site origin for links (localhost in dev, production otherwise). */
export function getPublicAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (configured) {
    return normalizeOrigin(configured)
  }

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000'
  }

  return DEFAULT_PRODUCTION_ORIGIN
}

/** Legacy homes.ph form URLs, routed locally when using localhost. */
export function getHomesFormUrl(slug: string, code: string) {
  const origin = getPublicAppOrigin()
  const safeSlug = encodeURIComponent(slug)
  const safeCode = encodeURIComponent(code)

  return `${origin}/form/${safeSlug}/${safeCode}`
}
