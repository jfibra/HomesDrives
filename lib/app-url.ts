const DEFAULT_PRODUCTION_ORIGIN = 'https://homes.ph'
const DEFAULT_HOMES_FORM_ORIGIN = 'https://homes.ph'

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, '')
}

/** Drive / app origin for metadata and this app's own pages. */
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

/**
 * Main homes.ph origin for category forms and QR codes (not drive.homes.ph).
 * @see https://homes.ph/form
 */
export function getHomesFormOrigin() {
  const configured = process.env.NEXT_PUBLIC_HOMES_FORM_ORIGIN?.trim()

  if (configured) {
    return normalizeOrigin(configured)
  }

  if (process.env.NODE_ENV === 'development') {
    return getPublicAppOrigin()
  }

  return DEFAULT_HOMES_FORM_ORIGIN
}

/** Relative form path on homes.ph. */
export function getHomesFormPath(slug: string, code: string) {
  return `/form/${encodeURIComponent(slug)}/${encodeURIComponent(code)}`
}

/** Absolute category form URL on homes.ph (QR codes, share links). */
export function getHomesFormUrl(slug: string, code: string) {
  return `${getHomesFormOrigin()}${getHomesFormPath(slug, code)}`
}
