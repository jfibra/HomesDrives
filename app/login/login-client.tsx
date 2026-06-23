'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { ArrowRight, Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react'

import Navbar from '@/components/Navbar'

type LoginResponse = {
  success: boolean
  user?: {
    id: number
    fullName: string
    role: 'admin' | 'media' | 'customer'
    areaFocused: string
    code: string
  }
  error?: string
}

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams?.get('next') ?? null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const data = (await res.json().catch(() => null)) as LoginResponse | null

      if (!res.ok || !data?.user) {
        throw new Error(data?.error || 'Invalid email or password.')
      }

      const code = data.user.code
      window.localStorage.setItem(`homes-albums-auth:${code}`, '1')

      if (data.user.role === 'media') {
        window.sessionStorage.setItem('homes-media-dashboard-landing', code)
      }

      // If the user is an admin, also seed the global admin context so the
      // admin shell on /questionnaires etc. picks them up immediately.
      if (data.user.role === 'admin') {
        window.localStorage.setItem(
          'homes-admin-context',
          JSON.stringify({
            code,
            fullName: data.user.fullName,
            firstName: data.user.fullName.split(' ')[0] ?? 'A',
            email: email.trim().toLowerCase(),
            role: 'admin',
          }),
        )
      }

      router.push(next || `/${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen min-w-0 overflow-x-hidden"
      style={{ backgroundColor: 'var(--ds-surface)', color: 'var(--ds-on-surface)' }}
    >
      <Navbar />

      <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center px-4 pb-16 pt-28">
        <div className="w-full">
          <div className="mb-6 text-center">
            <span
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: 'var(--ds-primary)',
                color: 'var(--ds-on-primary)',
              }}
            >
              <LogIn className="h-6 w-6" />
            </span>
            <h1
              className="mt-4 text-3xl font-bold"
              style={{ fontFamily: 'var(--font-noto-serif)', color: 'var(--ds-on-surface)' }}
            >
              Welcome back
            </h1>
            <p
              className="mt-1 text-sm"
              style={{ color: 'var(--ds-on-surface-variant)' }}
            >
              Sign in to your Homes.ph Drive account
            </p>
          </div>

          <form
            className="rounded-3xl border bg-white p-6 shadow-xl sm:p-8"
            onSubmit={handleSubmit}
            style={{ borderColor: 'var(--ds-outline-variant)' }}
          >
            <div className="flex flex-col gap-4">
              <Field icon={<Mail className="h-4 w-4" />} label="Email">
                <input
                  autoComplete="email"
                  className="login-input"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
              </Field>

              <Field icon={<Lock className="h-4 w-4" />} label="Password">
                <div className="relative">
                  <input
                    autoComplete="current-password"
                    className="login-input pr-10"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors hover:bg-slate-100"
                    onClick={() => setShowPassword((s) => !s)}
                    style={{ color: 'var(--ds-on-surface-variant)' }}
                    type="button"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            </div>

            {error ? (
              <div
                className="mt-4 rounded-lg border px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--ds-error-container)',
                  borderColor: 'rgba(186,26,26,0.2)',
                  color: 'var(--ds-error)',
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
              style={{
                backgroundColor: 'var(--ds-primary)',
                color: 'var(--ds-on-primary)',
              }}
              type="submit"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </button>

            <p
              className="mt-4 text-center text-[11px]"
              style={{ color: 'var(--ds-on-surface-variant)' }}
            >
              New to Homes.ph Drive?{' '}
              <Link
                className="font-semibold underline-offset-4 hover:underline"
                href="/signup"
                style={{ color: 'var(--ds-primary)' }}
              >
                Create a Customer Drive account
              </Link>
            </p>
          </form>

          <p
            className="mt-6 text-center text-[11px]"
            style={{ color: 'var(--ds-on-surface-variant)' }}
          >
            Forgot your password? Contact your manager.
          </p>
        </div>
      </main>

      <style jsx>{`
        :global(.login-input) {
          width: 100%;
          border: 1px solid var(--ds-outline-variant);
          background-color: var(--ds-surface-container-low);
          color: var(--ds-on-surface);
          padding: 0.7rem 0.9rem;
          border-radius: 0.65rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        :global(.login-input:focus) {
          border-color: var(--ds-primary);
          box-shadow: 0 0 0 1px var(--ds-primary);
        }
      `}</style>
    </div>
  )
}

export default function LoginClient() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}

function Field({
  children,
  icon,
  label,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  label: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--ds-on-surface-variant)' }}
      >
        {icon}
        {label}
      </span>
      {children}
    </label>
  )
}

