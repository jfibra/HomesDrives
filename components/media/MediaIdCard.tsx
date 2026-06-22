'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Facebook, Instagram, Youtube } from 'lucide-react'

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

function MediaIdCardFront({ fullName, avatarUrl }: Pick<MediaIdCardProps, 'fullName' | 'avatarUrl'>) {
  return (
    <ScaledArtboard label="Media ID front">
      <div className={styles.front}>
        <div aria-hidden className={styles.cornerTop} />
        <div aria-hidden className={styles.cornerBottom} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="Homes.ph" className={styles.frontLogo} src="/media-profile-logo.png" />
        <p className={styles.mediaLabel}>Media</p>
        <div aria-hidden className={styles.photoRing} />
        <div className={styles.photoInner}>
          <ProfilePhoto avatarUrl={avatarUrl} fullName={fullName} />
        </div>
        <h2 className={styles.mediaName}>{fullName}</h2>
        <div aria-hidden className={styles.goldLine} />
        <p className={styles.teamLabel}>DIGITAL MEDIA TEAM</p>
      </div>
    </ScaledArtboard>
  )
}

function MediaIdCardBack({ profileUrl }: Pick<MediaIdCardProps, 'profileUrl'>) {
  const qrImageUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=720x720&margin=0&data=${encodeURIComponent(profileUrl)}`
  }, [profileUrl])

  return (
    <ScaledArtboard label="Media ID back">
      <div className={styles.back}>
        <div aria-hidden className={styles.watermark} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="Homes.ph" className={styles.backLogo} src="/media-profile-logo-white.png" />
        <div className={styles.qrFrame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Public profile QR code" src={qrImageUrl} />
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
    </ScaledArtboard>
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
    <div className={`${styles.cardShell} ${styles.cardPair} ${className ?? ''}`.trim()}>
      <MediaIdCardFront avatarUrl={avatarUrl} fullName={fullName} />
      <MediaIdCardBack profileUrl={profileUrl} />
    </div>
  )
}
