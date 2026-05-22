'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  Download,
  GraduationCap,
  Hotel,
  Link2,
  MapPinned,
  Newspaper,
  Phone,
  QrCode,
  Share2,
  UtensilsCrossed,
} from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getHomesFormUrl } from '@/lib/app-url'
import {
  buildCategoryPhotoBackground,
  CATEGORY_PHOTO_OVERLAY,
  CATEGORY_PREVIEW_PHOTO_LIST,
  CATEGORY_PREVIEW_PHOTOS,
} from '@/lib/category-preview-photos'
import { cn } from '@/lib/utils'

type MediaProfileClientProps = {
  profileUrl: string
  user: {
    avatarUrl: string | null
    code: string
    fullName: string
    phoneNumber: string
  }
}

const DESTINATIONS = [
  {
    href: (code: string) => getHomesFormUrl('share-your-news', code),
    icon: Newspaper,
    label: 'News',
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.news),
    previewTint: 'linear-gradient(135deg, rgba(30,64,175,0.22), rgba(15,23,42,0.08))',
  },
  {
    href: (code: string) => getHomesFormUrl('feature-your-restaurant', code),
    icon: UtensilsCrossed,
    label: 'Restaurant',
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.restaurant),
    previewTint: 'linear-gradient(135deg, rgba(124,45,18,0.24), rgba(15,23,42,0.1))',
  },
  {
    href: (code: string) => getHomesFormUrl('feature-your-event', code),
    icon: CalendarDays,
    label: 'Event',
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.event),
    previewTint: 'linear-gradient(135deg, rgba(88,28,135,0.2), rgba(15,23,42,0.1))',
  },
  {
    href: (code: string) => getHomesFormUrl('list-your-hotel', code),
    icon: Hotel,
    label: 'Hotels',
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.hotel),
    previewTint: 'linear-gradient(135deg, rgba(15,118,110,0.22), rgba(15,23,42,0.08))',
  },
  {
    href: (code: string) => getHomesFormUrl('feature-your-school', code),
    icon: GraduationCap,
    label: 'Schools',
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.school),
    previewTint: 'linear-gradient(135deg, rgba(79,70,229,0.2), rgba(15,23,42,0.1))',
  },
  {
    href: (code: string) => getHomesFormUrl('feature-your-tourist-spot', code),
    icon: MapPinned,
    label: 'Tourist Spot',
    previewPhoto: buildCategoryPhotoBackground(CATEGORY_PREVIEW_PHOTOS.touristSpot),
    previewTint: 'linear-gradient(135deg, rgba(5,150,105,0.18), rgba(15,23,42,0.08))',
  },
] as const

function ProfileAvatar({
  avatarUrl,
  fullName,
}: {
  avatarUrl: string | null
  fullName: string
}) {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'M'

  if (avatarUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={fullName}
          className="h-28 w-28 rounded-[2rem] border border-white/70 object-cover shadow-[0_18px_50px_rgba(10,37,64,0.18)]"
          src={avatarUrl}
        />
      </>
    )
  }

  return (
    <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-[#08243d] text-3xl font-bold text-white shadow-[0_18px_50px_rgba(10,37,64,0.18)]">
      {initials}
    </div>
  )
}

export default function MediaProfileClient({ profileUrl, user }: MediaProfileClientProps) {
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [categoryQrTarget, setCategoryQrTarget] = useState<{ label: string; url: string } | null>(null)
  const [shareMessage, setShareMessage] = useState('')
  const [resolvedProfileUrl, setResolvedProfileUrl] = useState(profileUrl)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    setResolvedProfileUrl(window.location.href)
  }, [])

  const qrImageUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(resolvedProfileUrl)}`
  }, [resolvedProfileUrl])

  const categoryQrImageUrl = useMemo(() => {
    if (!categoryQrTarget) {
      return ''
    }

    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(categoryQrTarget.url)}`
  }, [categoryQrTarget])

  function getAbsoluteUrl(path: string) {
    if (typeof window === 'undefined') {
      return path
    }

    return new URL(path, window.location.origin).toString()
  }

  async function handleShareProfile() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${user.fullName} · Media Profile`,
          text: `Open ${user.fullName}'s public media profile.`,
          url: resolvedProfileUrl,
        })
        setShareMessage('Profile shared.')
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(resolvedProfileUrl)
        setShareMessage('Profile link copied.')
        return
      }

      setShareMessage('Sharing is not available on this device.')
    } catch {
      setShareMessage('Sharing was cancelled.')
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4f0e8_0%,#fcfbf7_36%,#eef3f8_100%)] text-slate-900">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-10 lg:py-14">
        <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,#dfeaf6_0,#f6efe5_38%,#ffffff_72%)]">
            <div className="relative h-44 overflow-hidden sm:h-52">
              <div className="absolute inset-0 grid scale-105 grid-cols-3 grid-rows-2 gap-px bg-[#1428AE]/50">
                {CATEGORY_PREVIEW_PHOTO_LIST.map((photoUrl) => (
                  <div
                    key={photoUrl}
                    className="bg-cover bg-center"
                    style={{ backgroundImage: buildCategoryPhotoBackground(photoUrl) }}
                  />
                ))}
              </div>
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,40,174,0.78)_0%,rgba(20,40,174,0.86)_48%,rgba(20,40,174,0.92)_100%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#ffffff24_0%,#ffffff00_62%)]" />
              <div className="absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Homes.ph"
                  className="max-h-20 w-full max-w-3xl object-contain opacity-95 drop-shadow-[0_12px_35px_rgba(0,0,0,0.35)] sm:max-h-24"
                  src="/media-profile-logo-white.png"
                />
              </div>
            </div>

            <div className="relative px-6 pb-8 sm:px-8 sm:pb-10 lg:px-10">
              <div className="-mt-14 flex justify-center sm:-mt-16">
                <div className="rounded-[2.25rem] border-4 border-white bg-white p-1 shadow-[0_24px_70px_rgba(10,37,64,0.18)]">
                  <ProfileAvatar avatarUrl={user.avatarUrl} fullName={user.fullName} />
                </div>
              </div>

              <div className="mx-auto mt-5 flex max-w-xl flex-col items-center text-center">
                {/* <p className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Public Profile
                </p> */}
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  {user.fullName}
                </h1>
                <h2 className="mt-2 ">Media</h2>
                <a
                  className="mt-3 inline-flex items-center gap-2 text-base font-semibold text-[#a12d2f] transition hover:opacity-80"
                  href={`tel:${user.phoneNumber}`}
                >
                  <Phone className="h-4 w-4" />
                  {user.phoneNumber}
                </a>

                <div className="mt-6 flex w-full max-w-sm flex-col items-stretch gap-3">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#08243d] px-5 py-3.5 text-sm font-semibold text-white transition hover:opacity-90"
                    onClick={() => setIsQrOpen(true)}
                    type="button"
                  >
                    <QrCode className="h-4 w-4" />
                    Share QR
                  </button>
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                    download={`${user.code}-contact.vcf`}
                    href={`/media/${encodeURIComponent(user.code)}/contact`}
                  >
                    <Download className="h-4 w-4" />
                    Save Contact
                  </a>
                </div>

                {shareMessage ? (
                  <p className="mt-3 text-sm text-slate-500">{shareMessage}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur sm:p-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              {/* <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Quick Links
              </p> */}
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                Select by category
              </h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATIONS.map(({ href, icon: Icon, label, previewPhoto, previewTint }) => {
              const destinationHref = href(user.code)

              return (
                <article
                  className={cn(
                    'overflow-hidden rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] transition',
                    'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]',
                  )}
                  key={label}
                >
                  <div
                    className="relative min-h-44 overflow-hidden bg-slate-900 p-5 text-white"
                    style={{
                      backgroundImage: `${previewPhoto}, ${previewTint}`,
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: 'cover',
                    }}
                  >
                    <div className={cn('absolute inset-0', CATEGORY_PHOTO_OVERLAY)} />
                    <div className="mt-8 flex items-end justify-between gap-4">
                      <div className="relative z-10">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                          FORM
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
                          {label}
                        </h3>
                      </div>
                      <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] border border-white/25 bg-white/15 text-white backdrop-blur-sm">
                        <Icon className="h-7 w-7" />
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 p-4">
                    <p className="text-sm font-semibold text-slate-900">{label}</p>
                    <div className="flex items-center gap-2">
                      <button
                        aria-label={`Show QR code for ${label} category page`}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        onClick={() =>
                          setCategoryQrTarget({
                            label,
                            url: getAbsoluteUrl(destinationHref),
                          })
                        }
                        type="button"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                      <Link
                        aria-label={`Open ${label} category page`}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        href={destinationHref}
                      >
                        <Link2 className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}>
        <DialogContent className="max-w-md rounded-[2rem] border-white/70 bg-white p-6 sm:p-7">
          <DialogHeader>
            <DialogTitle className="text-2xl tracking-tight text-slate-950">Share QR</DialogTitle>
            <DialogDescription className="text-slate-500">
              Scan the QR code to open {user.fullName}&apos;s public media profile.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex flex-col items-center gap-5">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`QR code for ${user.fullName}'s public profile`}
                className="h-64 w-64 rounded-2xl"
                src={qrImageUrl}
              />
            </div>

            <div className="w-full rounded-[1.5rem] bg-slate-50 p-4 text-sm text-slate-600">
              <p className="line-clamp-3 break-all">{resolvedProfileUrl}</p>
            </div>

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#a12d2f] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              onClick={() => void handleShareProfile()}
              type="button"
            >
              <Share2 className="h-4 w-4" />
              Share Profile
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(categoryQrTarget)} onOpenChange={(open) => !open && setCategoryQrTarget(null)}>
        <DialogContent className="max-w-md rounded-[2rem] border-white/70 bg-white p-6 sm:p-7">
          <DialogHeader>
            <DialogTitle className="text-2xl tracking-tight text-slate-950">
              {categoryQrTarget?.label} QR
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Scan the QR code to open the {categoryQrTarget?.label?.toLowerCase()} category page.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex flex-col items-center gap-5">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
              {categoryQrTarget ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={`QR code for ${categoryQrTarget.label} category page`}
                    className="h-64 w-64 rounded-2xl"
                    src={categoryQrImageUrl}
                  />
                </>
              ) : null}
            </div>

            <div className="w-full rounded-[1.5rem] bg-slate-50 p-4 text-sm text-slate-600">
              <p className="line-clamp-3 break-all">{categoryQrTarget?.url}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
