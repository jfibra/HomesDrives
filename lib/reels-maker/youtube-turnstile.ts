declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
        },
      ) => string
      remove: (widgetId: string) => void
    }
  }
}

let turnstileScriptPromise: Promise<void> | null = null

function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile can only run in the browser.'))
  }

  if (window.turnstile) return Promise.resolve()

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-reels-turnstile="1"]')
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('Turnstile failed to load.')), {
          once: true,
        })
        return
      }

      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.reelsTurnstile = '1'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Turnstile failed to load.'))
      document.head.appendChild(script)
    })
  }

  return turnstileScriptPromise
}

export async function requestTurnstileToken(sitekey: string, container: HTMLElement) {
  await loadTurnstileScript()

  if (!window.turnstile) {
    throw new Error('Turnstile is unavailable.')
  }

  container.replaceChildren()

  return new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Turnstile verification timed out.'))
    }, 120_000)

    const widgetId = window.turnstile!.render(container, {
      sitekey,
      callback: (token) => {
        window.clearTimeout(timeout)
        resolve(token)
      },
      'error-callback': () => {
        window.clearTimeout(timeout)
        reject(new Error('Turnstile verification failed.'))
      },
      'expired-callback': () => {
        window.clearTimeout(timeout)
        reject(new Error('Turnstile verification expired.'))
      },
    })

    container.dataset.turnstileWidgetId = widgetId
  })
}

export function resetTurnstileContainer(container: HTMLElement | null) {
  if (!container || !window.turnstile) return
  const widgetId = container.dataset.turnstileWidgetId
  if (widgetId) {
    try {
      window.turnstile.remove(widgetId)
    } catch {
      // ignore cleanup errors
    }
  }
  container.replaceChildren()
  delete container.dataset.turnstileWidgetId
}
