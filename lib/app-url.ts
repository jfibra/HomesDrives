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

/** Relative form path — use with the current site origin (QR, links in the browser). */
export function getHomesFormPath(slug: string, code: string) {
  return `/form/${encodeURIComponent(slug)}/${encodeURIComponent(code)}`
}

/** Absolute form URL using NEXT_PUBLIC_APP_URL or production default (server/email). */
export function getHomesFormUrl(slug: string, code: string) {
  return `${getPublicAppOrigin()}${getHomesFormPath(slug, code)}`
}
