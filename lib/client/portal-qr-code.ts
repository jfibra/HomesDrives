type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H'

export function getQrCodeImageUrl(
  url: string,
  size = 120,
  errorCorrection: QrErrorCorrection = 'M',
) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&ecc=${errorCorrection}&data=${encodeURIComponent(url)}`
}

function isSameOriginUrl(url: string) {
  return new URL(url, window.location.origin).origin === window.location.origin
}

function getImageFetchUrl(url: string) {
  const absoluteUrl = new URL(url, window.location.origin).href
  if (isSameOriginUrl(absoluteUrl)) {
    return absoluteUrl
  }

  return `/api/media/proxy-image?url=${encodeURIComponent(absoluteUrl)}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image.'))
    image.src = src
  })
}

async function loadImageForCanvas(url: string): Promise<HTMLImageElement> {
  if (!url || url.startsWith('data:')) {
    return loadImage(url)
  }

  const response = await fetch(getImageFetchUrl(url), { credentials: 'omit', cache: 'no-store' })
  if (!response.ok) {
    throw new Error('Unable to load image.')
  }

  const objectUrl = URL.createObjectURL(await response.blob())
  try {
    return await loadImage(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export async function buildPortalQrCodeDataUrl(
  targetUrl: string,
  options?: { logoUrl?: string | null; size?: number },
) {
  const size = options?.size ?? 512
  const logoUrl = options?.logoUrl?.trim() || null
  const errorCorrection: QrErrorCorrection = logoUrl ? 'H' : 'M'
  const qrImage = await loadImageForCanvas(getQrCodeImageUrl(targetUrl, size, errorCorrection))

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Unable to create QR code.')
  }

  ctx.drawImage(qrImage, 0, 0, size, size)

  if (logoUrl) {
    const logo = await loadImageForCanvas(logoUrl)
    const logoSize = Math.round(size * 0.22)
    const pad = Math.round(logoSize * 0.14)
    const x = Math.round((size - logoSize) / 2)
    const y = Math.round((size - logoSize) / 2)
    const bgSize = logoSize + pad * 2
    const bgX = x - pad
    const bgY = y - pad

    ctx.fillStyle = '#ffffff'
    drawRoundedRect(ctx, bgX, bgY, bgSize, bgSize, Math.round(bgSize * 0.18))
    ctx.fill()

    ctx.save()
    drawRoundedRect(ctx, x, y, logoSize, logoSize, Math.round(logoSize * 0.12))
    ctx.clip()
    ctx.drawImage(logo, x, y, logoSize, logoSize)
    ctx.restore()
  }

  return canvas.toDataURL('image/png')
}

export async function downloadPortalQrCode(
  targetUrl: string,
  filename: string,
  options?: { logoUrl?: string | null; size?: number },
) {
  const dataUrl = await buildPortalQrCodeDataUrl(targetUrl, {
    ...options,
    size: options?.size ?? 1024,
  })
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}
