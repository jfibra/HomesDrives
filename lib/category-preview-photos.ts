const PHOTO_PARAMS = 'auto=format&fit=crop&w=960&h=576&q=85'

function unsplashPhoto(photoId: string, params = PHOTO_PARAMS) {
  return `https://images.unsplash.com/${photoId}?${params}`
}

/** Realistic preview photos for media profile category cards (Unsplash). */
export const CATEGORY_PREVIEW_PHOTOS = {
  news: unsplashPhoto('photo-1591115765373-5207764f72e7'),
  restaurant: unsplashPhoto('photo-1414235077428-338989a2e8c0'),
  event: unsplashPhoto('photo-1470229722913-7c0e2dbbafd3'),
  hotel: unsplashPhoto('photo-1564501049412-61c2a3083791'),
  school: unsplashPhoto('photo-1541339907198-e08756dedf3f'),
  touristSpot: unsplashPhoto('photo-1507525428034-b723cf961d3e'),
} as const

/** All category photos in display order (header collage, etc.). */
export const CATEGORY_PREVIEW_PHOTO_LIST = [
  CATEGORY_PREVIEW_PHOTOS.news,
  CATEGORY_PREVIEW_PHOTOS.restaurant,
  CATEGORY_PREVIEW_PHOTOS.event,
  CATEGORY_PREVIEW_PHOTOS.hotel,
  CATEGORY_PREVIEW_PHOTOS.school,
  CATEGORY_PREVIEW_PHOTOS.touristSpot,
] as const

export function buildCategoryPhotoBackground(photoUrl: string) {
  return `url("${photoUrl}")`
}

/** Dark cinematic wash so labels stay readable on photo backgrounds. */
export const CATEGORY_PHOTO_OVERLAY =
  'bg-[linear-gradient(180deg,rgba(15,23,42,0.08)_0%,rgba(15,23,42,0.38)_42%,rgba(15,23,42,0.78)_100%)]'
