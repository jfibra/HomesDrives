export function withEventQuery(
  path: string,
  eventSlug: string,
  extra?: Record<string, string | undefined | null>,
) {
  const params = new URLSearchParams()
  params.set('eventSlug', eventSlug)
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) params.set(key, value)
  }
  return `${path}?${params.toString()}`
}
