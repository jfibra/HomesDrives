const EXPORTABLE_STYLE_PROPS = [
  'align-items',
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'background-size',
  'border',
  'border-bottom',
  'border-left',
  'border-radius',
  'border-right',
  'border-top',
  'box-sizing',
  'color',
  'display',
  'flex-direction',
  'flex-shrink',
  'font-family',
  'font-size',
  'font-weight',
  'gap',
  'height',
  'justify-content',
  'left',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'object-fit',
  'opacity',
  'overflow',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'position',
  'right',
  'text-align',
  'top',
  'transform',
  'transform-origin',
  'white-space',
  'width',
  'word-break',
  'z-index',
] as const

type ExportElementToPngOptions = {
  width: number
  height: number
  pixelRatio?: number
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image data.'))
    reader.readAsDataURL(blob)
  })
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

async function toDataUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url

  const fetchUrl = getImageFetchUrl(url)
  const response = await fetch(fetchUrl, { credentials: 'omit', cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Unable to load image: ${url}`)
  }

  return blobToDataUrl(await response.blob())
}

function inlineComputedStyles(source: Element, target: Element) {
  if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) return

  const computed = window.getComputedStyle(source)
  const cssText = EXPORTABLE_STYLE_PROPS.map((prop) => {
    const value = computed.getPropertyValue(prop)
    return value ? `${prop}:${value};` : ''
  }).join('')

  target.style.cssText = cssText

  const sourceChildren = Array.from(source.children)
  const targetChildren = Array.from(target.children)
  for (let index = 0; index < sourceChildren.length; index += 1) {
    inlineComputedStyles(sourceChildren[index], targetChildren[index])
  }
}

async function inlineImageSources(source: Element, target: Element) {
  if (source instanceof HTMLImageElement && target instanceof HTMLImageElement) {
    const rawSrc = source.currentSrc || source.src
    if (!rawSrc) return

    target.removeAttribute('crossorigin')
    target.src = await toDataUrl(rawSrc)
    await waitForImage(target)
    return
  }

  const sourceChildren = Array.from(source.children)
  const targetChildren = Array.from(target.children)
  for (let index = 0; index < sourceChildren.length; index += 1) {
    await inlineImageSources(sourceChildren[index], targetChildren[index])
  }
}

async function inlineBackgroundImages(source: HTMLElement, target: HTMLElement) {
  const backgroundImage = window.getComputedStyle(source).backgroundImage
  if (backgroundImage && backgroundImage !== 'none' && backgroundImage.includes('url(')) {
    const match = backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)
    const rawUrl = match?.[1]
    if (rawUrl) {
      const dataUrl = await toDataUrl(rawUrl)
      target.style.backgroundImage = `url("${dataUrl}")`
    }
  }

  const sourceChildren = Array.from(source.children) as HTMLElement[]
  const targetChildren = Array.from(target.children) as HTMLElement[]
  for (let index = 0; index < sourceChildren.length; index += 1) {
    await inlineBackgroundImages(sourceChildren[index], targetChildren[index])
  }
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Unable to decode image: ${image.alt || 'image'}`))
  })
}

function addXmlns(element: Element) {
  if (element instanceof HTMLElement) {
    element.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  }

  for (const child of Array.from(element.children)) {
    addXmlns(child)
  }
}

function assertNoExternalResources(root: HTMLElement) {
  const html = root.outerHTML
  if (/src=["']https?:\/\//i.test(html)) {
    throw new Error('External image sources must be inlined before export.')
  }

  if (/url\(["']?https?:\/\//i.test(html)) {
    throw new Error('External background images must be inlined before export.')
  }
}

export async function exportElementToPng(
  element: HTMLElement,
  { width, height, pixelRatio = 2 }: ExportElementToPngOptions,
): Promise<Blob> {
  if (typeof window === 'undefined') {
    throw new Error('Image export is only available in the browser.')
  }

  await document.fonts.ready

  const clone = element.cloneNode(true) as HTMLElement
  inlineComputedStyles(element, clone)
  await inlineImageSources(element, clone)
  await inlineBackgroundImages(element, clone)
  addXmlns(clone)
  assertNoExternalResources(clone)

  const serialized = new XMLSerializer().serializeToString(clone)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;">
          ${serialized}
        </div>
      </foreignObject>
    </svg>
  `

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Unable to render ID card image.'))
    img.src = svgDataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = width * pixelRatio
  canvas.height = height * pixelRatio

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create image canvas.')
  }

  context.scale(pixelRatio, pixelRatio)
  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })

  if (!blob) {
    throw new Error('Unable to create PNG file.')
  }

  return blob
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function sanitizeDownloadName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'media'
}

export async function preloadImageDataUrl(url: string) {
  return toDataUrl(url)
}
