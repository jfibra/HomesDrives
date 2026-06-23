'use client'

import { useEffect, useState } from 'react'

import { buildPortalQrCodeDataUrl, getQrCodeImageUrl } from '@/lib/client/portal-qr-code'

type EventQrCodeProps = {
  targetUrl: string
  logoUrl?: string | null
  alt: string
  className?: string
  previewSize?: number
}

export default function EventQrCode({
  targetUrl,
  logoUrl,
  alt,
  className = 'h-20 w-20',
  previewSize = 160,
}: EventQrCodeProps) {
  const [src, setSrc] = useState(() =>
    getQrCodeImageUrl(targetUrl, previewSize, logoUrl ? 'H' : 'M'),
  )
  const [loading, setLoading] = useState(Boolean(logoUrl))

  useEffect(() => {
    let active = true

    if (!logoUrl) {
      setSrc(getQrCodeImageUrl(targetUrl, previewSize))
      setLoading(false)
      return () => {
        active = false
      }
    }

    setLoading(true)
    void buildPortalQrCodeDataUrl(targetUrl, { logoUrl, size: previewSize })
      .then((dataUrl) => {
        if (active) setSrc(dataUrl)
      })
      .catch(() => {
        if (active) setSrc(getQrCodeImageUrl(targetUrl, previewSize, 'H'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [targetUrl, logoUrl, previewSize])

  return (
    <div className="relative">
      {loading ? <div className="absolute inset-0 animate-pulse rounded-lg bg-slate-100" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={alt} className={className} src={src} />
    </div>
  )
}
