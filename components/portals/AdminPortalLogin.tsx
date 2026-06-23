'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AlertCircle, Eye, EyeOff, Lock, LogIn, Mail, Shield } from 'lucide-react'

import PortalFrame from '@/components/portals/PortalFrame'
import { PORTAL_ADMIN_SESSION_KEY, PORTAL_API_BASE, STATIC_ADMIN_CREDENTIALS } from '@/lib/portals/constants'

export default function AdminPortalLogin() {
  const router = useRouter()
  const [email, setEmail] = useState(STATIC_ADMIN_CREDENTIALS.email)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    const code = localStorage.getItem(PORTAL_ADMIN_SESSION_KEY)
    if (code) {
      router.replace('/admin/events')
      return
    }
    setIsCheckingSession(false)
  }, [router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const res = await fetch(`${PORTAL_API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.adminCode) {
        throw new Error(data?.error || 'Invalid email or password.')
      }

      localStorage.setItem(PORTAL_ADMIN_SESSION_KEY, data.adminCode)
      router.push('/admin/events')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isCheckingSession) {
    return (
      <PortalFrame
        badge="Admin Portal"
        subtitle="Checking your session…"
        title="Admin login"
        variant="admin"
      >
        <div className="mx-auto w-full max-w-md px-6 py-10 text-center text-sm text-slate-500">
          Loading admin dashboard…
        </div>
      </PortalFrame>
    )
  }

  return (
    <PortalFrame
      badge="Admin Portal"
      subtitle="Sign in to review, rename, delete, and replace portal uploads."
      title="Admin login"
      variant="admin"
    >
      <div className="mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-[#10233f]/5 to-transparent px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10233f] text-white">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#10233f]">Administrator access</p>
                <p className="text-xs text-slate-500">Temporary portal credentials only</p>
              </div>
            </div>
          </div>

          <form className="space-y-5 px-6 py-6 sm:px-8 sm:py-7" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-[#10233f] focus:bg-white focus:ring-2 focus:ring-[#10233f]/10"
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  value={email}
                />
              </div>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Password
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-12 text-sm outline-none transition focus:border-[#10233f] focus:bg-white focus:ring-2 focus:ring-[#10233f]/10"
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-600"
                  onClick={() => setShowPassword((v) => !v)}
                  type="button"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            <button
              className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#10233f]/15 transition hover:bg-[#1a3358] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              <LogIn className="h-4 w-4" />
              {isSubmitting ? 'Signing in…' : 'Open admin dashboard'}
            </button>
          </form>
        </div>
      </div>
    </PortalFrame>
  )
}
