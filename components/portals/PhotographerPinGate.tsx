'use client'

import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'

import PortalFrame from '@/components/portals/PortalFrame'
import { PORTAL_API_BASE } from '@/lib/portals/constants'
import { getPhotographerAccessStorageKey } from '@/lib/portals/photographer-access'

type PhotographerPinGateProps = {
  eventName?: string
  eventSlug: string
  onAuthorized: (accessToken: string) => void
}

export default function PhotographerPinGate({
  eventName,
  eventSlug,
  onAuthorized,
}: PhotographerPinGateProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\d{6}$/.test(pin)) {
      setError('Enter the 6-digit PIN from your event admin.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${PORTAL_API_BASE}/photographers/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventSlug, pin }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Incorrect PIN.')
      }

      const accessToken = typeof data?.accessToken === 'string' ? data.accessToken : ''
      if (!accessToken) {
        onAuthorized('')
        return
      }

      localStorage.setItem(getPhotographerAccessStorageKey(eventSlug), accessToken)
      onAuthorized(accessToken)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to verify PIN.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PortalFrame
      badge="Photographer Portal"
      subtitle={eventName ? `Enter the event PIN to open ${eventName}.` : 'Enter the event PIN to continue.'}
      title="Protected event"
      variant="photographer"
    >
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)]">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10233f]/10 text-[#10233f]">
          <KeyRound className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-[#10233f]">Enter event PIN</h2>
        <p className="mt-2 text-sm text-slate-600">
          Ask the event admin for the 6-digit photographer PIN, then enter it below to upload photos.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              6-digit PIN
            </span>
            <input
              autoComplete="one-time-code"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl font-semibold tracking-[0.45em] text-[#10233f] outline-none transition focus:border-[#10233f]"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, '').slice(0, 6))
                setError('')
              }}
              pattern="\d{6}"
              placeholder="••••••"
              type="password"
              value={pin}
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1a3358] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || pin.length !== 6}
            type="submit"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Checking PIN…' : 'Continue'}
          </button>
        </form>
      </div>
    </PortalFrame>
  )
}
