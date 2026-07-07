'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { requestTurnstileToken, resetTurnstileContainer } from '@/lib/reels-maker/youtube-turnstile'

type TurnstileChallengeProps = {
  sitekey: string
  onToken: (token: string) => void
  onError: (error: Error) => void
}

export function TurnstileChallenge({ sitekey, onToken, onError }: TurnstileChallengeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  const onErrorRef = useRef(onError)
  const [status, setStatus] = useState<'loading' | 'interactive' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  onTokenRef.current = onToken
  onErrorRef.current = onError

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    setStatus('loading')
    setErrorMessage(null)

    void requestTurnstileToken(sitekey, container)
      .then((token) => {
        if (cancelled) return
        onTokenRef.current(token)
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setStatus('error')
        setErrorMessage(message)
        onErrorRef.current(error instanceof Error ? error : new Error(message))
      })

    const readyTimer = window.setTimeout(() => {
      if (!cancelled) setStatus('interactive')
    }, 1500)

    return () => {
      cancelled = true
      window.clearTimeout(readyTimer)
      resetTurnstileContainer(container)
    }
  }, [sitekey])

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex min-h-[70px] w-full items-center justify-center" ref={containerRef} />
      {status === 'loading' && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading security check…
        </div>
      )}
      {status === 'interactive' && (
        <p className="text-muted-foreground text-center text-sm">
          Check the box above if you see one, or wait for automatic verification.
        </p>
      )}
      {status === 'error' && errorMessage && (
        <p className="text-destructive text-center text-sm">{errorMessage}</p>
      )}
    </div>
  )
}
