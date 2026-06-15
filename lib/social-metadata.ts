import type { Metadata } from 'next'

import { getPublicAppOrigin } from '@/lib/app-url'

/** Logo used for link previews on Messenger, Facebook, X, etc. */
export const SOCIAL_SHARE_IMAGE_PATH = '/Screenshot_2026-06-12_123615-removebg-preview.png'

export const socialShareImage = {
  url: SOCIAL_SHARE_IMAGE_PATH,
  alt: 'Homes.ph',
}

export function buildSocialMetadata(input: {
  title: string
  description: string
  path?: string
}): Metadata {
  const openGraphUrl = input.path
    ? new URL(input.path, getPublicAppOrigin()).toString()
    : undefined

  return {
    title: input.title,
    description: input.description,
    openGraph: {
      title: input.title,
      description: input.description,
      images: [socialShareImage],
      type: 'website',
      siteName: 'Homes.ph',
      ...(openGraphUrl ? { url: openGraphUrl } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [SOCIAL_SHARE_IMAGE_PATH],
    },
  }
}

export const defaultSocialMetadata = buildSocialMetadata({
  title: 'Homes.ph Drive',
  description:
    'Browse and discover premium real estate photography across the Philippines and beyond.',
})
