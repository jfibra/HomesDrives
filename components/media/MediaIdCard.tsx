'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Download, Facebook, Instagram, Loader2, Youtube } from 'lucide-react'

import {
  downloadBlob,
  exportElementToPng,
  preloadImageDataUrl,
  sanitizeDownloadName,
} from '@/lib/client/export-element-to-png'

import styles from './media-id-card.module.css'

const ARTBOARD_WIDTH = 595
const ARTBOARD_HEIGHT = 842

type MediaIdCardProps = {
  fullName: string
  avatarUrl: string | null
  profileUrl: string
  side?: 'front' | 'back' | 'both'
  className?: string
}

type DownloadKind = 'front' | 'back' | 'both'

function ScaledArtboard({ children, label }: { children: ReactNode; label: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return

    const updateScale = () => {
      setScale(node.clientWidth / ARTBOARD_WIDTH)
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={wrapRef} className={styles.artboardWrap}>
      <div className={styles.artboardSizer} style={{ height: ARTBOARD_HEIGHT * scale }}>
        <article
          aria-label={label}
          className={styles.artboard}
          style={{ transform: `scale(${scale})` }}
        >
          {children}
        </article>
      </div>
    </div>
  )
}

function ExportArtboard({
  children,
  exportRef,
}: {
  children: ReactNode
  exportRef: RefObject<HTMLElement | null>
}) {
  return (
    <article ref={exportRef} className={styles.exportArtboard} aria-hidden>
      {children}
    </article>
  )
}

function ProfilePhoto({ avatarUrl, fullName }: { avatarUrl: string | null; fullName: string }) {
  const initials =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'M'

  if (avatarUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={fullName} src={avatarUrl} />
      </>
    )
  }

  return <div className={styles.photoInitials}>{initials}</div>
}

type ExportAssets = {
  avatar: string | null
  logo: string
  logoWhite: string
  qr: string
  watermark: string
}

function FrontFace({
  fullName,
  avatarUrl,
  exportAssets,
}: Pick<MediaIdCardProps, 'fullName' | 'avatarUrl'> & { exportAssets?: ExportAssets }) {
  const resolvedAvatar = exportAssets?.avatar ?? avatarUrl
  const logoSrc = exportAssets?.logo ?? '/media-profile-logo.png'

  return (
    <div className={styles.front}>
      <div aria-hidden className={styles.cornerTop} />
      <div aria-hidden className={styles.cornerBottom} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Homes.ph" className={styles.frontLogo} src={logoSrc} />
      <p className={styles.mediaLabel}>Media</p>
      <div aria-hidden className={styles.photoRing} />
      <div className={styles.photoInner}>
        <ProfilePhoto avatarUrl={resolvedAvatar} fullName={fullName} />
      </div>
      <h2 className={styles.mediaName}>{fullName}</h2>
      <div aria-hidden className={styles.goldLine} />
      <p className={styles.teamLabel}>DIGITAL MEDIA TEAM</p>
    </div>
  )
}

function BackFace({
  profileUrl,
  exportAssets,
}: Pick<MediaIdCardProps, 'profileUrl'> & { exportAssets?: ExportAssets }) {
  const qrImageUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=720x720&margin=0&data=${encodeURIComponent(profileUrl)}`
  }, [profileUrl])

  const resolvedQr = exportAssets?.qr ?? qrImageUrl
  const logoWhiteSrc = exportAssets?.logoWhite ?? '/media-profile-logo-white.png'
  const watermarkSrc = exportAssets?.watermark ?? '/abstract%20bg.png'

  return (
    <div className={styles.back}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" aria-hidden className={styles.watermarkImg} src={watermarkSrc} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Homes.ph" className={styles.backLogo} src={logoWhiteSrc} />
      <div className={styles.qrFrame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="Public profile QR code" src={resolvedQr} />
      </div>
      <p className={styles.scanText}>Scan QR to access form</p>
      <div className={styles.socialRow}>
        <div className={`${styles.socialItem} ${styles.socialItemFacebook}`}>
          <Facebook aria-hidden className={styles.socialIcon} strokeWidth={1.75} />
          <span>Homes.ph</span>
        </div>
        <div className={`${styles.socialItem} ${styles.socialItemInstagram}`}>
          <Instagram aria-hidden className={styles.socialIcon} strokeWidth={1.75} />
          <span>Homes.phofficial</span>
        </div>
        <div className={`${styles.socialItem} ${styles.socialItemYoutube}`}>
          <Youtube aria-hidden className={styles.socialIcon} strokeWidth={1.75} />
          <span>Homes.ph</span>
        </div>
      </div>
      <p className={styles.contactCall}>Call Us: (+63) 977 815 0888</p>
      <p className={styles.contactEmail}>Email Us: info@homes.ph</p>
    </div>
  )
}

function MediaIdCardFront({ fullName, avatarUrl }: Pick<MediaIdCardProps, 'fullName' | 'avatarUrl'>) {
  return (
    <ScaledArtboard label="Media ID front">
      <FrontFace avatarUrl={avatarUrl} fullName={fullName} />
    </ScaledArtboard>
  )
}

function MediaIdCardBack({ profileUrl }: Pick<MediaIdCardProps, 'profileUrl'>) {
  return (
    <ScaledArtboard label="Media ID back">
      <BackFace profileUrl={profileUrl} />
    </ScaledArtboard>
  )
}

function DownloadButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className={styles.downloadButton}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function MediaIdDownloads({
  fullName,
  avatarUrl,
  profileUrl,
}: Pick<MediaIdCardProps, 'fullName' | 'avatarUrl' | 'profileUrl'>) {
  const frontExportRef = useRef<HTMLElement>(null)
  const backExportRef = useRef<HTMLElement>(null)
  const [downloading, setDownloading] = useState<DownloadKind | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [exportAssets, setExportAssets] = useState<ExportAssets | null>(null)
  const [isPreparingExport, setIsPreparingExport] = useState(true)

  const fileBase = useMemo(() => sanitizeDownloadName(fullName), [fullName])
  const qrImageUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=720x720&margin=0&data=${encodeURIComponent(profileUrl)}`
  }, [profileUrl])

  useEffect(() => {
    let cancelled = false

    async function prepareExportAssets() {
      setIsPreparingExport(true)
      setDownloadError(null)

      try {
        const [logo, logoWhite, watermark, qr, avatar] = await Promise.all([
          preloadImageDataUrl('/media-profile-logo.png'),
          preloadImageDataUrl('/media-profile-logo-white.png'),
          preloadImageDataUrl('/abstract%20bg.png'),
          preloadImageDataUrl(qrImageUrl),
          avatarUrl ? preloadImageDataUrl(avatarUrl) : Promise.resolve(null),
        ])

        if (!cancelled) {
          setExportAssets({ logo, logoWhite, watermark, qr, avatar })
        }
      } catch (error) {
        if (!cancelled) {
          setExportAssets(null)
          setDownloadError(
            error instanceof Error ? error.message : 'Unable to prepare ID images for download.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsPreparingExport(false)
        }
      }
    }

    void prepareExportAssets()

    return () => {
      cancelled = true
    }
  }, [avatarUrl, qrImageUrl])

  async function exportSide(kind: 'front' | 'back') {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })

    const node = kind === 'front' ? frontExportRef.current : backExportRef.current
    if (!node) {
      throw new Error('ID card is not ready to download yet.')
    }

    return exportElementToPng(node, {
      width: ARTBOARD_WIDTH,
      height: ARTBOARD_HEIGHT,
      pixelRatio: 2,
    })
  }

  async function handleDownload(kind: DownloadKind) {
    if (!exportAssets) {
      setDownloadError('ID images are still preparing. Please try again in a moment.')
      return
    }
    setDownloading(kind)
    setDownloadError(null)

    try {
      if (kind === 'front' || kind === 'back') {
        const blob = await exportSide(kind)
        downloadBlob(blob, `homesph-media-id-${fileBase}-${kind}.png`)
        return
      }

      const [frontBlob, backBlob] = await Promise.all([exportSide('front'), exportSide('back')])
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      zip.file(`homesph-media-id-${fileBase}-front.png`, frontBlob)
      zip.file(`homesph-media-id-${fileBase}-back.png`, backBlob)
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(zipBlob, `homesph-media-id-${fileBase}.zip`)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to download ID images.')
    } finally {
      setDownloading(null)
    }
  }

  const isBusy = downloading !== null || isPreparingExport || !exportAssets

  return (
    <>
      <div className={styles.downloadBar}>
        <p className={styles.downloadHint}>
          {isPreparingExport
            ? 'Preparing your ID images for download...'
            : 'Download your ID as print-ready PNG images.'}
        </p>
        <div className={styles.downloadActions}>
          <DownloadButton disabled={isBusy} onClick={() => void handleDownload('front')}>
            {downloading === 'front' || isPreparingExport ? (
              <Loader2 aria-hidden className={styles.downloadIcon} />
            ) : (
              <Download aria-hidden className={styles.downloadIcon} />
            )}
            Front
          </DownloadButton>
          <DownloadButton disabled={isBusy} onClick={() => void handleDownload('back')}>
            {downloading === 'back' || isPreparingExport ? (
              <Loader2 aria-hidden className={styles.downloadIcon} />
            ) : (
              <Download aria-hidden className={styles.downloadIcon} />
            )}
            Back
          </DownloadButton>
          <DownloadButton disabled={isBusy} onClick={() => void handleDownload('both')}>
            {downloading === 'both' || isPreparingExport ? (
              <Loader2 aria-hidden className={styles.downloadIcon} />
            ) : (
              <Download aria-hidden className={styles.downloadIcon} />
            )}
            Both sides
          </DownloadButton>
        </div>
        {downloadError ? <p className={styles.downloadError}>{downloadError}</p> : null}
      </div>

      {exportAssets ? (
        <div className={styles.exportLayer}>
          <ExportArtboard exportRef={frontExportRef}>
            <FrontFace avatarUrl={avatarUrl} exportAssets={exportAssets} fullName={fullName} />
          </ExportArtboard>
          <ExportArtboard exportRef={backExportRef}>
            <BackFace exportAssets={exportAssets} profileUrl={profileUrl} />
          </ExportArtboard>
        </div>
      ) : null}
    </>
  )
}

export default function MediaIdCard({
  fullName,
  avatarUrl,
  profileUrl,
  side = 'both',
  className,
}: MediaIdCardProps) {
  if (side === 'front') {
    return (
      <div className={`${styles.cardShell} ${className ?? ''}`.trim()}>
        <MediaIdCardFront avatarUrl={avatarUrl} fullName={fullName} />
      </div>
    )
  }

  if (side === 'back') {
    return (
      <div className={`${styles.cardShell} ${className ?? ''}`.trim()}>
        <MediaIdCardBack profileUrl={profileUrl} />
      </div>
    )
  }

  return (
    <div className={`${styles.cardShell} ${className ?? ''}`.trim()}>
      <MediaIdDownloads avatarUrl={avatarUrl} fullName={fullName} profileUrl={profileUrl} />
      <div className={styles.cardPair}>
        <MediaIdCardFront avatarUrl={avatarUrl} fullName={fullName} />
        <MediaIdCardBack profileUrl={profileUrl} />
      </div>
    </div>
  )
}
