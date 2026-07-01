'use client'

import { useEffect, useState } from 'react'
import { Loader2, UserRound } from 'lucide-react'

import PortalFrame from '@/components/portals/PortalFrame'
import { PORTAL_API_BASE } from '@/lib/portals/constants'
import {
  readStoredPhotographerIdentity,
  resolvePhotographerAccessToken,
  type StoredPhotographerIdentity,
} from '@/lib/portals/photographer-identity'

type PhotographerNameGateProps = {
  accessToken?: string
  eventName?: string
  eventSlug: string
  onRegistered: (identity: StoredPhotographerIdentity) => void
}

export default function PhotographerNameGate({
  accessToken = '',
  eventName,
  eventSlug,
  onRegistered,
}: PhotographerNameGateProps) {
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showNameForm, setShowNameForm] = useState(false)
  const [rememberedIdentity, setRememberedIdentity] = useState<StoredPhotographerIdentity | null>(null)

  useEffect(() => {
    const stored = readStoredPhotographerIdentity(eventSlug)
    setRememberedIdentity(stored)
    if (stored?.fullName) {
      setFullName(stored.fullName)
    }
    setShowNameForm(!stored)
  }, [eventSlug])

  async function registerName(name: string) {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (trimmed.length < 2) {
      setError('Enter your full name (at least 2 characters).')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${PORTAL_API_BASE}/photographers/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventSlug,
          fullName: trimmed,
          accessToken: resolvePhotographerAccessToken(eventSlug, accessToken) || undefined,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to open your workspace.')
      }

      const id = typeof data?.identity?.id === 'string' ? data.identity.id : ''
      const registeredName =
        typeof data?.identity?.fullName === 'string' ? data.identity.fullName : trimmed
      if (!id) {
        throw new Error('Unable to open your workspace.')
      }

      onRegistered({ id, fullName: registeredName })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to open your workspace.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await registerName(fullName)
  }

  const showWelcomeBack = Boolean(rememberedIdentity?.fullName) && !showNameForm

  return (
    <PortalFrame
      badge="Photographer Portal"
      subtitle={
        eventName
          ? `Open your folders for ${eventName}.`
          : 'Open your photographer workspace.'
      }
      title={showWelcomeBack ? 'Welcome back' : 'Your name'}
      variant="photographer"
    >
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)]">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10233f]/10 text-[#10233f]">
          <UserRound className="h-6 w-6" />
        </div>

        {showWelcomeBack && rememberedIdentity ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-[#10233f]">
                Continue as {rememberedIdentity.fullName}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                We saved your workspace on this device. Tap below to open your folders again.
              </p>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1a3358] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              onClick={() => void registerName(rememberedIdentity.fullName)}
              type="button"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Opening…' : 'Open my folders'}
            </button>

            <button
              className="w-full text-sm font-medium text-slate-500 transition hover:text-[#10233f]"
              disabled={loading}
              onClick={() => {
                setShowNameForm(true)
                setError('')
              }}
              type="button"
            >
              Use a different name
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-[#10233f]">Enter your full name</h2>
            <p className="mt-2 text-sm text-slate-600">
              Each photographer gets their own workspace for this event.{' '}
              <span className="font-medium text-slate-700">
                Use the same full name every time you open this link
              </span>{' '}
              so you return to your folders — on this device or a new phone.
            </p>

            <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Full name
                </span>
                <input
                  autoComplete="name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-[#10233f] outline-none transition focus:border-[#10233f]"
                  onChange={(event) => {
                    setFullName(event.target.value)
                    setError('')
                  }}
                  placeholder="e.g. Maria Santos"
                  type="text"
                  value={fullName}
                />
              </label>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <button
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1a3358] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading || fullName.trim().length < 2}
                type="submit"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? 'Opening…' : 'Open my folders'}
              </button>
            </form>

            {rememberedIdentity?.fullName ? (
              <button
                className="mt-4 w-full text-sm font-medium text-slate-500 transition hover:text-[#10233f]"
                disabled={loading}
                onClick={() => {
                  setShowNameForm(false)
                  setFullName(rememberedIdentity.fullName)
                  setError('')
                }}
                type="button"
              >
                Back to welcome back
              </button>
            ) : null}
          </>
        )}
      </div>
    </PortalFrame>
  )
}
