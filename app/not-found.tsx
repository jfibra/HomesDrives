import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-white via-orange-50/60 to-emerald-50/40 px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Homes Albums"
            className="h-12 w-auto opacity-80"
            src="/logo.png"
          />
        </div>

        {/* Error message */}
        <div className="space-y-3">
          <p className="text-[7rem] font-bold leading-none tracking-tighter text-gray-100 select-none">
            404
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-800">
            Page not found
          </h1>
          <p className="mx-auto max-w-xs text-sm leading-6 text-gray-500">
            This link doesn&apos;t exist or the access code is invalid.
            Please check your link and try again.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 active:scale-[0.98]"
          >
            Go to Home
          </Link>
          <p className="text-xs text-gray-400">
            If you believe this is an error, contact your administrator.
          </p>
        </div>
      </div>
    </main>
  )
}
