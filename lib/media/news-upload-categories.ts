import type { LucideIcon } from 'lucide-react'
import { CalendarDays, GraduationCap, Hotel, MapPinned, UtensilsCrossed } from 'lucide-react'

import {
  buildCategoryPhotoBackground,
  CATEGORY_PHOTO_OVERLAY,
  CATEGORY_PREVIEW_PHOTOS,
} from '@/lib/category-preview-photos'

export type NewsUploadCategory = {
  slug: string
  label: string
  placeType: string
  description: string
  icon: LucideIcon
  previewImageUrl: string
  previewPhoto: string
  previewTint: string
}

export const NEWS_CATEGORY_TAG_PREFIX = 'news-category:'

export function buildNewsCategoryTag(slug: string) {
  return `${NEWS_CATEGORY_TAG_PREFIX}${slug}`
}

export function folderMatchesNewsCategory(
  folder: { tags: string[]; type_of_place: string[] },
  category: Pick<NewsUploadCategory, 'slug' | 'placeType'>,
) {
  if (folder.tags.includes(buildNewsCategoryTag(category.slug))) return true
  return folder.type_of_place.includes(category.placeType)
}

export function getNewsCategoryForFolder(
  folder: { tags: string[]; type_of_place: string[] },
): NewsUploadCategory | null {
  for (const category of NEWS_UPLOAD_CATEGORIES) {
    if (folderMatchesNewsCategory(folder, category)) return category
  }
  return null
}

export const NEWS_UPLOAD_CATEGORIES: NewsUploadCategory[] = [
  {
    slug: 'restaurant',
    label: 'Restaurant',
    placeType: 'Restaurant',
    description: 'Dining spots, cafes, and food service venues.',
    icon: UtensilsCrossed,
    previewImageUrl: CATEGORY_PREVIEW_PHOTOS.restaurant,
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.restaurant),
    previewTint: 'linear-gradient(135deg, rgba(124,45,18,0.24), rgba(15,23,42,0.1))',
  },
  {
    slug: 'event',
    label: 'Event',
    placeType: 'Event Venue',
    description: 'Concerts, launches, gatherings, and event coverage.',
    icon: CalendarDays,
    previewImageUrl: CATEGORY_PREVIEW_PHOTOS.event,
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.event),
    previewTint: 'linear-gradient(135deg, rgba(88,28,135,0.2), rgba(15,23,42,0.1))',
  },
  {
    slug: 'hotels',
    label: 'Hotels',
    placeType: 'Hotel',
    description: 'Hotels, resorts, and hospitality spaces.',
    icon: Hotel,
    previewImageUrl: CATEGORY_PREVIEW_PHOTOS.hotel,
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.hotel),
    previewTint: 'linear-gradient(135deg, rgba(15,118,110,0.22), rgba(15,23,42,0.08))',
  },
  {
    slug: 'schools',
    label: 'Schools',
    placeType: 'School',
    description: 'Campuses, classrooms, and school facilities.',
    icon: GraduationCap,
    previewImageUrl: CATEGORY_PREVIEW_PHOTOS.school,
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.school),
    previewTint: 'linear-gradient(135deg, rgba(79,70,229,0.2), rgba(15,23,42,0.1))',
  },
  {
    slug: 'tourist-spot',
    label: 'Tourist Spot',
    placeType: 'Tourist Attraction',
    description: 'Landmarks, attractions, and destination highlights.',
    icon: MapPinned,
    previewImageUrl: CATEGORY_PREVIEW_PHOTOS.touristSpot,
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.touristSpot),
    previewTint: 'linear-gradient(135deg, rgba(5,150,105,0.18), rgba(15,23,42,0.08))',
  },
]

export { CATEGORY_PHOTO_OVERLAY }
