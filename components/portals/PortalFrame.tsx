import type { ReactNode } from 'react'
import Link from 'next/link'
import { Camera, Download, Shield } from 'lucide-react'

type PortalFrameProps = {
  badge: string
  children: ReactNode
  subtitle?: string
  title: string
  actions?: ReactNode
  variant?: 'default' | 'photographer' | 'public' | 'admin'
}

const VARIANT_STYLES = {
  photographer: {
    page: 'min-h-screen bg-gradient-to-br from-[#faf7f4] via-[#f4f6f8] to-[#edf2f7] text-[#10233f]',
    header: 'border-b border-white/60 bg-white/75 backdrop-blur-xl',
    badge: 'text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c6603d]',
    badgePrefix: false,
    iconWrap: 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c6603d] to-[#ae5536] text-white shadow-lg shadow-[#c6603d]/25 sm:h-12 sm:w-12',
    icon: Camera,
    showExit: false,
  },
  public: {
    page: 'min-h-screen bg-gradient-to-br from-[#f0f7ff] via-[#f4f6f8] to-[#edf2f7] text-[#10233f]',
    header: 'border-b border-white/60 bg-white/80 backdrop-blur-xl',
    badge: 'text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2563eb]',
    badgePrefix: false,
    iconWrap:
      'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] text-white shadow-lg shadow-blue-500/20 sm:h-12 sm:w-12',
    icon: Download,
    showExit: false,
  },
  admin: {
    page: 'min-h-screen bg-gradient-to-br from-[#f4f6f8] via-[#eef1f5] to-[#e8ecf2] text-[#10233f]',
    header: 'border-b border-white/60 bg-white/80 backdrop-blur-xl',
    badge: 'text-[11px] font-semibold uppercase tracking-[0.22em] text-[#10233f]',
    badgePrefix: false,
    iconWrap:
      'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#10233f] to-[#1a3358] text-white shadow-lg shadow-[#10233f]/20 sm:h-12 sm:w-12',
    icon: Shield,
    showExit: false,
  },
  default: {
    page: 'min-h-screen bg-[#f4f6f8] text-slate-900',
    header: 'border-b border-slate-200 bg-white',
    badge: 'text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400',
    badgePrefix: true,
    iconWrap: '',
    icon: null as null,
    showExit: true,
  },
} as const

export default function PortalFrame({
  badge,
  children,
  subtitle,
  title,
  actions,
  variant = 'default',
}: PortalFrameProps) {
  const styles = VARIANT_STYLES[variant]
  const Icon = styles.icon

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            {Icon ? (
              <div className={styles.iconWrap}>
                <Icon className="h-5 w-5" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className={styles.badge}>
                {styles.badgePrefix ? `Temporary portal · ${badge}` : badge}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[#10233f] sm:mt-1 sm:text-2xl sm:text-[1.75rem]">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {actions}
            {styles.showExit ? (
              <Link
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 sm:flex-none"
                href="/"
              >
                Exit portal
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-8">{children}</main>
    </div>
  )
}
