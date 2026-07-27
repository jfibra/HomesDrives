/** Build people-library list URL, preserving page + search. */
export function buildPeopleListHref(
  basePath: string,
  options?: { page?: number; q?: string | null },
): string {
  const params = new URLSearchParams()
  const page = options?.page ?? 1
  if (page > 1) params.set('page', String(page))
  const q = options?.q?.trim()
  if (q) params.set('q', q)
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

/** Person detail URL that remembers which people-list page to return to. */
export function buildPersonHref(
  personBasePath: string,
  personId: string,
  options?: { listPage?: number; listQuery?: string | null },
): string {
  const params = new URLSearchParams()
  const listPage = options?.listPage ?? 1
  if (listPage > 1) params.set('fromPage', String(listPage))
  const listQuery = options?.listQuery?.trim()
  if (listQuery) params.set('fromQ', listQuery)
  const query = params.toString()
  const path = `${personBasePath.replace(/\/$/, '')}/${encodeURIComponent(personId)}`
  return query ? `${path}?${query}` : path
}

export function readPeopleListReturn(searchParams: {
  fromPage?: string
  fromQ?: string
}): { page: number; q: string } {
  const parsed = Number.parseInt(searchParams.fromPage ?? '1', 10)
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  return {
    page,
    q: searchParams.fromQ?.trim() ?? '',
  }
}
