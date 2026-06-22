'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react'

import Navbar from '@/components/Navbar'

type Step = 'details' | 'verify' | 'done'

export default function MediaSignupClient() {
  const [step, setStep] = useState<Step>('details')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [areaFocused, setAreaFocused] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [dashboardUrl, setDashboardUrl] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleRequestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/media/register/request-code', {
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
      const data = (await res.json().catch(() => null)) as {
        error?: string
        success?: boolean
        skipVerification?: boolean
        user?: { dashboardUrl?: string }
      } | null

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to send verification code.')
      }

      if (data.skipVerification) {
        setDashboardUrl(data.user?.dashboardUrl ?? '')
        setStep('done')
        return
      }

      setStep('verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send verification code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/media/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          password,
        }),
      })
      const data = (await res.json().catch(() => null)) as {
        error?: string
        success?: boolean
        user?: { dashboardUrl?: string }
      } | null

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to verify your registration.')
      }

      setDashboardUrl(data.user?.dashboardUrl ?? '')
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify your registration.')
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

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-16 pt-24 lg:flex-row lg:items-start lg:gap-16 lg:pt-32">
        <section className="flex-1 lg:max-w-md">
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--ds-primary)' }}
          >
            Media Signup
          </p>
          <h1
            className="mt-3 text-4xl font-bold leading-tight sm:text-5xl"
            style={{ fontFamily: 'var(--font-noto-serif)', color: 'var(--ds-on-surface)' }}
          >
            Join Homes.ph
            <br />
            as a media partner.
          </h1>

          <div className="mt-4 hidden lg:block">
            <p
              className="text-base leading-relaxed"
              style={{ color: 'var(--ds-on-surface-variant)' }}
            >
              Register your media account, choose a password, verify your email with a 6-digit code,
              and receive your dashboard link by email.
            </p>

            <ul className="mt-8 flex flex-col gap-3">
              {[
                'Choose your account password',
                'Verify your email with a secure 6-digit code',
                'Get your dashboard link by email',
                'Upload and manage media for Homes.ph',
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
              Already registered?{' '}
              <Link
                className="font-semibold underline-offset-4 hover:underline"
                href="/login"
                style={{ color: 'var(--ds-primary)' }}
              >
                Sign in
              </Link>
            </p>
          </div>
        </section>

        <section className="flex-1">
          <div
            className="rounded-3xl border bg-white p-6 shadow-xl sm:p-8"
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
                {step === 'done' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : step === 'verify' ? (
                  <Mail className="h-5 w-5" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
              </span>
              <div>
                <h2 className="text-lg font-semibold">
                  {step === 'done'
                    ? 'Signup complete'
                    : step === 'verify'
                      ? 'Verify your email'
                      : 'Create your media account'}
                </h2>
                <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  {step === 'done'
                    ? 'Check your inbox for your login details.'
                    : step === 'verify'
                      ? `We sent a 6-digit code to ${email}`
                      : 'We will email you a verification code first.'}
                </p>
              </div>
            </div>

            {error ? (
              <p
                className="mb-4 rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: '#fecaca',
                  backgroundColor: '#fef2f2',
                  color: '#b91c1c',
                }}
              >
                {error}
              </p>
            ) : null}

            {step === 'details' ? (
              <form className="space-y-4" onSubmit={handleRequestCode}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1.5 flex items-center gap-1.5 font-medium">
                      <User className="h-4 w-4" />
                      First name
                    </span>
                    <input
                      required
                      className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2"
                      style={{ borderColor: 'var(--ds-outline-variant)' }}
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">Last name</span>
                    <input
                      required
                      className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2"
                      style={{ borderColor: 'var(--ds-outline-variant)' }}
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                    />
                  </label>
                </div>

                <label className="block text-sm">
                  <span className="mb-1.5 flex items-center gap-1.5 font-medium">
                    <Mail className="h-4 w-4" />
                    Email
                  </span>
                  <input
                    required
                    autoComplete="email"
                    className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2"
                    style={{ borderColor: 'var(--ds-outline-variant)' }}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 flex items-center gap-1.5 font-medium">
                    <Phone className="h-4 w-4" />
                    Phone number
                  </span>
                  <input
                    required
                    autoComplete="tel"
                    className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2"
                    style={{ borderColor: 'var(--ds-outline-variant)' }}
                    type="tel"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Area focused (optional)</span>
                  <input
                    className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2"
                    placeholder="e.g. Cebu, Metro Manila"
                    style={{ borderColor: 'var(--ds-outline-variant)' }}
                    value={areaFocused}
                    onChange={(event) => setAreaFocused(event.target.value)}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 flex items-center gap-1.5 font-medium">
                    <Lock className="h-4 w-4" />
                    Password
                  </span>
                  <div className="relative">
                    <input
                      required
                      autoComplete="new-password"
                      className="w-full rounded-xl border px-4 py-3 pr-12 outline-none focus:ring-2"
                      minLength={8}
                      placeholder="At least 8 characters"
                      style={{ borderColor: 'var(--ds-outline-variant)' }}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md hover:bg-slate-100"
                      style={{ color: 'var(--ds-on-surface-variant)' }}
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium">Confirm password</span>
                  <input
                    required
                    autoComplete="new-password"
                    className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2"
                    style={{ borderColor: 'var(--ds-outline-variant)' }}
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>

                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                  disabled={isSubmitting}
                  style={{ backgroundColor: 'var(--ds-primary)' }}
                  type="submit"
                >
                  {isSubmitting ? 'Sending code…' : 'Send verification code'}
                  {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
                </button>
              </form>
            ) : null}

            {step === 'verify' ? (
              <form className="space-y-4" onSubmit={handleVerifyCode}>
                <label className="block text-sm">
                  <span className="mb-1.5 flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    6-digit code
                  </span>
                  <input
                    required
                    autoComplete="one-time-code"
                    className="w-full rounded-xl border px-4 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:ring-2"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="\d{6}"
                    placeholder="000000"
                    style={{ borderColor: 'var(--ds-outline-variant)' }}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>

                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                  disabled={isSubmitting || code.length !== 6}
                  style={{ backgroundColor: 'var(--ds-primary)' }}
                  type="submit"
                >
                  {isSubmitting ? 'Verifying…' : 'Verify and create account'}
                  {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
                </button>

                <button
                  className="w-full text-sm font-medium underline-offset-4 hover:underline"
                  disabled={isSubmitting}
                  style={{ color: 'var(--ds-primary)' }}
                  type="button"
                  onClick={() => {
                    setStep('details')
                    setCode('')
                    setError('')
                  }}
                >
                  Use a different email
                </button>
              </form>
            ) : null}

            {step === 'done' ? (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  Your media account is ready. We emailed your dashboard link and login details to{' '}
                  <strong>{email}</strong>.
                </p>
                {dashboardUrl ? (
                  <Link
                    className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white"
                    href={dashboardUrl}
                    style={{ backgroundColor: 'var(--ds-primary)' }}
                  >
                    Open your dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Link
                    className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white"
                    href="/login"
                    style={{ backgroundColor: 'var(--ds-primary)' }}
                  >
                    Go to login
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex-1 lg:hidden">
          <p
            className="text-base leading-relaxed"
            style={{ color: 'var(--ds-on-surface-variant)' }}
          >
            Register your media account, choose a password, verify your email with a 6-digit code,
            and receive your dashboard link by email.
          </p>

          <ul className="mt-6 flex flex-col gap-3">
            {[
              'Choose your account password',
              'Verify your email with a secure 6-digit code',
              'Get your dashboard link by email',
              'Upload and manage media for Homes.ph',
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

          <p className="mt-8 text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
            Already registered?{' '}
            <Link
              className="font-semibold underline-offset-4 hover:underline"
              href="/login"
              style={{ color: 'var(--ds-primary)' }}
            >
              Sign in
            </Link>
          </p>
        </section>
      </main>
    </div>
  )
}
