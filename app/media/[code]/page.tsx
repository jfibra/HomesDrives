import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getUserByCode } from '@/lib/server/albums'
import { buildSocialMetadata } from '@/lib/social-metadata'

import MediaProfileClient from './profile-client'

type PageProps = {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const user = await getUserByCode(code).catch(() => null)

  if (!user || user.status !== 'active' || user.role !== 'media') {
    return buildSocialMetadata({
      title: 'Media Profile · Homes.ph',
      description: 'Open a public media profile on Homes.ph.',
    })
  }

  return buildSocialMetadata({
    title: `${user.full_name} · Media Profile`,
    description: `Open ${user.full_name}'s public media profile on Homes.ph.`,
    path: `/media/${encodeURIComponent(user.code)}`,
  })
}

function getPublicOrigin(headerList: Headers) {
  const forwardedProto = headerList.get('x-forwarded-proto')
  const forwardedHost = headerList.get('x-forwarded-host')
  const host = forwardedHost ?? headerList.get('host')

  if (!host) {
    return ''
  }

  const protocol = forwardedProto ?? (host.includes('localhost') ? 'http' : 'https')

  return `${protocol}://${host}`
}

export default async function MediaProfilePage({ params }: PageProps) {
  const { code } = await params
  const user = await getUserByCode(code).catch(() => null)

  if (!user || user.status !== 'active' || user.role !== 'media') {
    notFound()
  }

  const headerList = await headers()
  const origin = getPublicOrigin(headerList)
  const profilePath = `/media/${encodeURIComponent(user.code)}`
  const profileUrl = origin ? `${origin}${profilePath}` : profilePath

  return (
    <MediaProfileClient
      profileUrl={profileUrl}
      user={{
        avatarUrl: user.avatar_url ?? null,
        code: user.code,
        fullName: user.full_name,
        phoneNumber: user.phone_number,
      }}
    />
  )
}
