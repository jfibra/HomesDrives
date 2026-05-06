'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, CheckCircle2, Eye, EyeOff, Mail, Phone, ShieldCheck, User } from 'lucide-react'

import Navbar from '@/components/Navbar'

type SignupResponse = {
  success: boolean
  user?: {
    id: number
    fullName: string
    firstName: string
    email: string
    code: string
    role: string
  }
  error?: string
}

export default function SignupClient() {
  const router = useRouter()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [areaFocused, setAreaFocused] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agree, setAgree] = useState(false)

  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.')
      return
    }
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (!phoneNumber.trim()) {
      setError('Please enter your phone number.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!agree) {
      setError('Please agree to the terms before continuing.')
      return
    }

    setIsSubmitting(true)
    try {
      const signupRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phoneNumber: phoneNumber.trim(),
          areaFocused: areaFocused.trim(),
          password,
        }),
      })
      const signupData = (await signupRes.json().catch(() => null)) as SignupResponse | null

      if (!signupRes.ok || !signupData?.user) {
        throw new Error(signupData?.error || 'Unable to create your account.')
      }

      // Auto-sign-in via the existing login API so the user lands authenticated
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signupData.user.email,
          password,
          code: signupData.user.code,
        }),
      })

      if (!loginRes.ok) {
        // Fall back to the login page; account exists, just couldn't auto-sign-in
        router.push('/login')
        return
      }

      const code = signupData.user.code
      window.localStorage.setItem(`homes-albums-auth:${code}`, '1')
      router.push(`/${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create your account.')
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

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-16 pt-28 lg:flex-row lg:items-start lg:gap-16 lg:pt-32">
        {/* Left: marketing panel */}
        <section className="flex-1 lg:max-w-md">
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--ds-primary)' }}
          >
            Customer Drive
          </p>
          <h1
            className="mt-3 text-4xl font-bold leading-tight sm:text-5xl"
            style={{ fontFamily: 'var(--font-noto-serif)', color: 'var(--ds-on-surface)' }}
          >
            Save listings.
            <br />
            Build your dream drive.
          </h1>
          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: 'var(--ds-on-surface-variant)' }}
          >
            Create a free Homes.ph Customer Drive to save photos you love, share boards
            with family, and keep tabs on properties as they get added to the marketplace.
          </p>

          <ul className="mt-8 flex flex-col gap-3">
            {[
              'Free forever — no credit card required',
              'Save unlimited listings to your private drive',
              'Get notified when new photos match your interest',
            ].map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-3 text-sm"
                style={{ color: 'var(--ds-on-surface)' }}
              >
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{ color: 'var(--ds-primary)' }}
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <p className="mt-10 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
            Already have an account?{' '}
            <Link
              className="font-semibold underline-offset-4 hover:underline"
              href="/login"
              style={{ color: 'var(--ds-primary)' }}
            >
              Sign in
            </Link>
          </p>
        </section>

        {/* Right: form */}
        <section className="flex-1">
          <form
            className="rounded-3xl border bg-white p-6 shadow-xl sm:p-8"
            onSubmit={handleSubmit}
            style={{ borderColor: 'var(--ds-outline-variant)' }}
          >
            <div className="mb-6 flex items-center gap-2">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: 'var(--ds-surface-container)',
                  color: 'var(--ds-primary)',
                }}
              >
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2
                  className="text-lg font-semibold"
                  style={{ fontFamily: 'var(--font-noto-serif)' }}
                >
                  Create your account
                </h2>
                <p
                  className="text-xs"
                  style={{ color: 'var(--ds-on-surface-variant)' }}
                >
                  It only takes a minute.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field icon={<User className="h-4 w-4" />} label="First name">
                <input
                  autoComplete="given-name"
                  className="signup-input"
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  type="text"
                  value={firstName}
                />
              </Field>
              <Field icon={<User className="h-4 w-4" />} label="Last name">
                <input
                  autoComplete="family-name"
                  className="signup-input"
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  type="text"
                  value={lastName}
                />
              </Field>
              <Field className="sm:col-span-2" icon={<Mail className="h-4 w-4" />} label="Email">
                <input
                  autoComplete="email"
                  className="signup-input"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </Field>
              <Field icon={<Phone className="h-4 w-4" />} label="Phone number">
                <input
                  autoComplete="tel"
                  className="signup-input"
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+639171234567"
                  required
                  type="tel"
                  value={phoneNumber}
                />
              </Field>
              <Field label="Area of interest (optional)">
                <input
                  autoComplete="address-level2"
                  className="signup-input"
                  onChange={(e) => setAreaFocused(e.target.value)}
                  placeholder="e.g. Cebu, Manila"
                  type="text"
                  value={areaFocused}
                />
              </Field>
              <Field className="sm:col-span-2" label="Password">
                <div className="relative">
                  <input
                    autoComplete="new-password"
                    className="signup-input pr-10"
                    minLength={8}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
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
              <Field className="sm:col-span-2" label="Confirm password">
                <input
                  autoComplete="new-password"
                  className="signup-input"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                />
              </Field>
            </div>

            <label className="mt-4 flex items-start gap-2 text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
              <input
                checked={agree}
                className="mt-0.5"
                onChange={(e) => setAgree(e.target.checked)}
                type="checkbox"
              />
              <span>
                I agree to the Homes.ph Drive terms of service and acknowledge the privacy
                policy.
              </span>
            </label>

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
              {isSubmitting ? 'Creating your account...' : 'Create account'}
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </button>

            <p
              className="mt-4 text-center text-[11px]"
              style={{ color: 'var(--ds-on-surface-variant)' }}
            >
              Have a code from your manager?{' '}
              <Link className="font-semibold underline-offset-4 hover:underline" href="/login">
                Sign in instead
              </Link>
            </p>
          </form>
        </section>
      </main>

      <style jsx>{`
        :global(.signup-input) {
          width: 100%;
          border: 1px solid var(--ds-outline-variant);
          background-color: var(--ds-surface-container-low);
          color: var(--ds-on-surface);
          padding: 0.65rem 0.85rem;
          border-radius: 0.6rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        :global(.signup-input:focus) {
          border-color: var(--ds-primary);
          box-shadow: 0 0 0 1px var(--ds-primary);
        }
      `}</style>
    </div>
  )
}

function Field({
  children,
  className,
  icon,
  label,
}: {
  children: React.ReactNode
  className?: string
  icon?: React.ReactNode
  label: string
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
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
