import { redirect } from 'next/navigation'

import {
  listAllowedPlaceTypes,
  listAllowedTags,
  listMarketplacePhotos,
  type AlbumsMarketplaceSort,
} from '@/lib/server/albums'
import HomeMarketplaceClient from './home-marketplace-client'

type SearchParamValue = string | string[] | undefined

type HomePageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>
}

const PAGE_SIZE = 24
/** Default public landing filter — `/` opens restaurant photos. */
const DEFAULT_PUBLIC_PLACE_TYPE = 'Restaurant'

function readSearchValue(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }

  return value ?? ''
}

function readPositiveInt(value: SearchParamValue, fallback: number) {
  const parsed = Number.parseInt(readSearchValue(value), 10)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return parsed
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams

  const query = readSearchValue(params.q).trim()
  const placeType = readSearchValue(params.placeType).trim()
  const tag = readSearchValue(params.tag).trim()
  const rawSort = readSearchValue(params.sort).trim()
  const page = readPositiveInt(params.page, 1)
  const sort: AlbumsMarketplaceSort =
    rawSort === 'oldest' || rawSort === 'captured' ? rawSort : 'newest'

  // Make Restaurant the main public homepage.
  if (!placeType) {
    const next = new URLSearchParams()
    if (query) next.set('q', query)
    next.set('placeType', DEFAULT_PUBLIC_PLACE_TYPE)
    if (tag) next.set('tag', tag)
    if (sort !== 'newest') next.set('sort', sort)
    if (page > 1) next.set('page', String(page))
    redirect(`/?${next.toString()}`)
  }

  const [placeTypes, tags, marketplace] = await Promise.all([
    listAllowedPlaceTypes().catch(() => []),
    listAllowedTags().catch(() => []),
    listMarketplacePhotos({
      page,
      pageSize: PAGE_SIZE,
      query,
      placeType,
      tag,
      sort,
    }).catch((error) => {
      console.error('[HomePage] listMarketplacePhotos failed:', error)
      return { photos: [], totalCount: 0 }
    }),
  ])

  const { photos, totalCount } = marketplace

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginationStart = Math.max(1, safePage - 2)
  const paginationEnd = Math.min(totalPages, paginationStart + 4)
  const pagesToShow = Array.from(
    { length: paginationEnd - paginationStart + 1 },
    (_, index) => paginationStart + index,
  )

  return (
    <HomeMarketplaceClient
      page={page}
      pagesToShow={pagesToShow}
      photos={photos}
      placeType={placeType}
      placeTypes={placeTypes}
      query={query}
      safePage={safePage}
      sort={sort}
      tag={tag}
      tags={tags}
      totalCount={totalCount}
      totalPages={totalPages}
    />
  )
}
