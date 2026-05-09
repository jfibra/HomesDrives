/**
 * V1 BACKUP — Prompt-heavy poster generator (original architecture).
 * Accessible at: POST /api/poster-generator/generate-v1
 *
 * This is the original single-prompt approach where Gemini generates the
 * entire poster including typography, layout, and visual elements.
 * Kept as a reference and fallback while V2 (generate/) is in development.
 */
import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'

const GEMINI_SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
])

const PERSON_REQUEST_PATTERN = /\b(person|people|human|model|agent|broker|realtor|portrait|face|woman|man|family|mother|father|child|kid|children|couple|team|presenter)\b/i

async function normalizeReferenceImage(file: File) {
  const sourceMimeType = file.type || ''
  const sourceBuffer = Buffer.from(await file.arrayBuffer())

  if (GEMINI_SUPPORTED_IMAGE_MIME_TYPES.has(sourceMimeType)) {
    return {
      mimeType: sourceMimeType,
      buffer: sourceBuffer,
      data: sourceBuffer.toString('base64'),
    }
  }

  if (!sourceMimeType.startsWith('image/')) {
    throw new Error(`Unsupported reference file type: ${sourceMimeType || 'unknown'}.`)
  }

  try {
    const pngBuffer = await sharp(sourceBuffer, { density: 300 }).png().toBuffer()
    return {
      mimeType: 'image/png',
      buffer: pngBuffer,
      data: pngBuffer.toString('base64'),
    }
  } catch {
    throw new Error(`Unable to process reference image type: ${sourceMimeType}.`)
  }
}

function getAspectRatio(width: number | null, height: number | null) {
  if (!width || !height) return undefined

  const ratio = width / height
  const supported = [
    { label: '1:1', value: 1 / 1 },
    { label: '2:3', value: 2 / 3 },
    { label: '3:2', value: 3 / 2 },
    { label: '3:4', value: 3 / 4 },
    { label: '4:3', value: 4 / 3 },
    { label: '9:16', value: 9 / 16 },
    { label: '16:9', value: 16 / 9 },
    { label: '21:9', value: 21 / 9 },
  ]

  return supported.reduce((closest, current) => {
    const closestDelta = Math.abs(closest.value - ratio)
    const currentDelta = Math.abs(current.value - ratio)
    return currentDelta < closestDelta ? current : closest
  }).label
}

async function compositeLogos(baseImageBuffer: Buffer, logos: Array<{ buffer: Buffer }>) {
  if (logos.length === 0) return baseImageBuffer

  const baseMetadata = await sharp(baseImageBuffer).metadata()
  const baseWidth = baseMetadata.width ?? 1024
  const baseHeight = baseMetadata.height ?? 1024
  const margin = Math.max(24, Math.round(baseWidth * 0.04))
  const maxLogoWidth = Math.max(160, Math.round(baseWidth * 0.22))
  const maxLogoHeight = Math.max(60, Math.round(baseHeight * 0.07))

  const prepared = await Promise.all(
    logos.slice(0, 3).map(async (logo) => {
      const resized = await sharp(logo.buffer)
        .resize({
          width: maxLogoWidth,
          height: maxLogoHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer()

      const metadata = await sharp(resized).metadata()
      return {
        input: resized,
        width: metadata.width ?? maxLogoWidth,
        height: metadata.height ?? maxLogoHeight,
      }
    }),
  )

  const logoGap = Math.max(8, Math.round(baseHeight * 0.012))
  const totalLogoHeight = prepared.reduce((sum, l) => sum + l.height + logoGap, 0) - logoGap
  const bannerW = maxLogoWidth + margin * 2
  const bannerH = totalLogoHeight + margin * 2

  const whiteBanner = await sharp({
    create: { width: bannerW, height: bannerH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.92 } },
  })
    .png()
    .toBuffer()

  let currentTop = margin
  const logoComposites = prepared.map((logo) => {
    const overlay = { input: logo.input, left: margin, top: currentTop }
    currentTop += logo.height + logoGap
    return overlay
  })

  return sharp(baseImageBuffer)
    .composite([
      { input: whiteBanner, left: 0, top: 0 },
      ...logoComposites,
    ])
    .png()
    .toBuffer()
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function compositePersonPhotos(
  baseImageBuffer: Buffer,
  photos: Array<{ buffer: Buffer }>,
  namedPeople: Array<{ name: string; company: string; jobTitle: string }>,
) {
  if (photos.length === 0) return baseImageBuffer

  const baseMetadata = await sharp(baseImageBuffer).metadata()
  const baseWidth = baseMetadata.width ?? 1024
  const baseHeight = baseMetadata.height ?? 1024

  const maxPersonWidth = Math.round(baseWidth * 0.44)

  const person = namedPeople[0] ?? null
  const hasText = !!(person && (person.name || person.jobTitle || person.company))
  const textBlockHeight = hasText ? Math.round(baseHeight * 0.11) : 0
  const maxPersonHeight = Math.round(baseHeight * 0.86) - textBlockHeight

  const resized = await sharp(photos[0].buffer)
    .resize({
      width: maxPersonWidth,
      height: maxPersonHeight,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .ensureAlpha()
    .png()
    .toBuffer()

  const meta = await sharp(resized).metadata()
  const w = meta.width ?? maxPersonWidth
  const h = meta.height ?? maxPersonHeight

  const fadeLeftPx = Math.round(w * 0.30)
  const fadeBottomStart = Math.round(h * 0.90)
  const fadeMaskSvg = [
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`,
    '  <defs>',
    `    <linearGradient id="lf" x1="0" y1="0" x2="${fadeLeftPx}" y2="0" gradientUnits="userSpaceOnUse">`,
    '      <stop offset="0%" stop-color="white" stop-opacity="0"/>',
    '      <stop offset="100%" stop-color="white" stop-opacity="1"/>',
    '    </linearGradient>',
    `    <linearGradient id="bf" x1="0" y1="${fadeBottomStart}" x2="0" y2="${h}" gradientUnits="userSpaceOnUse">`,
    '      <stop offset="0%" stop-color="white" stop-opacity="1"/>',
    '      <stop offset="100%" stop-color="white" stop-opacity="0"/>',
    '    </linearGradient>',
    '    <mask id="m">',
    `      <rect width="${w}" height="${h}" fill="url(#lf)"/>`,
    `      <rect width="${w}" height="${h}" fill="url(#bf)" style="mix-blend-mode:multiply"/>`,
    '    </mask>',
    '  </defs>',
    `  <rect width="${w}" height="${h}" fill="white" mask="url(#m)"/>`,
    '</svg>',
  ].join('\n')

  const fadeMask = await sharp(Buffer.from(fadeMaskSvg)).ensureAlpha().png().toBuffer()

  const fadedPhoto = await sharp(resized)
    .composite([{ input: fadeMask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const photoLeft = baseWidth - w
  const photoTop = Math.max(0, baseHeight - textBlockHeight - h)

  const composites: Array<{ input: Buffer; left: number; top: number }> = [
    { input: fadedPhoto, left: photoLeft, top: photoTop },
  ]

  if (hasText && person) {
    const textAreaW = Math.min(maxPersonWidth + Math.round(baseWidth * 0.04), baseWidth - photoLeft + Math.round(baseWidth * 0.04))
    const textAreaH = textBlockHeight + 8
    const textLeft = Math.max(0, baseWidth - textAreaW)
    const textTop = baseHeight - textBlockHeight

    const nameFontSize = Math.max(16, Math.round(baseHeight * 0.024))
    const detailFontSize = Math.max(13, Math.round(baseHeight * 0.018))
    const cx = textAreaW / 2

    const nameLine = person.name ? escapeXml(person.name) : ''
    const detailLine = [person.jobTitle, person.company].filter(Boolean).map(escapeXml).join(' \u00b7 ')

    const nameY = nameFontSize + 4
    const detailY = nameY + detailFontSize + 6

    const textSvg = [
      `<svg width="${textAreaW}" height="${textAreaH}" xmlns="http://www.w3.org/2000/svg">`,
      nameLine
        ? `  <text x="${cx}" y="${nameY}" font-family="Arial,Helvetica,sans-serif" font-size="${nameFontSize}" font-weight="bold" fill="#1E3A8A" text-anchor="middle">${nameLine}</text>`
        : '',
      detailLine
        ? `  <text x="${cx}" y="${detailY}" font-family="Arial,Helvetica,sans-serif" font-size="${detailFontSize}" fill="#374151" text-anchor="middle">${detailLine}</text>`
        : '',
      '</svg>',
    ].join('\n')

    const textBuf = await sharp(Buffer.from(textSvg)).png().toBuffer()
    composites.push({ input: textBuf, left: textLeft, top: textTop })
  }

  return sharp(baseImageBuffer).composite(composites).png().toBuffer()
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured.' }, { status: 500 })
    }

    const formData = await request.formData()

    const posterType = (formData.get('posterType') as string | null)?.trim() ?? ''
    const designStyle = (formData.get('designStyle') as string | null)?.trim() ?? ''
    const designTraits = (formData.get('designTraits') as string | null)?.trim() ?? ''
    const formatName = (formData.get('formatName') as string | null)?.trim() ?? ''
    const formatWidth = (formData.get('formatWidth') as string | null)?.trim() ?? ''
    const formatHeight = (formData.get('formatHeight') as string | null)?.trim() ?? ''
    const numericFormatWidth = Number(formatWidth) || null
    const numericFormatHeight = Number(formatHeight) || null
    const headline = (formData.get('headline') as string | null)?.trim() ?? ''
    const subtitle = (formData.get('subtitle') as string | null)?.trim() ?? ''
    const content = (formData.get('content') as string | null)?.trim() ?? ''
    const aiInstructions = (formData.get('aiInstructions') as string | null)?.trim() ?? ''
    const peopleJson = (formData.get('people') as string | null) ?? '[]'

    const sizeLabel = formatName || (formatWidth && formatHeight)
      ? formatName
        ? `${formatName}${formatWidth && formatHeight ? ` (${formatWidth} × ${formatHeight} px)` : ''}`
        : `${formatWidth} × ${formatHeight} px`
      : 'Not specified'

    let people: Array<{ name: string; company: string; jobTitle: string }> = []
    try {
      people = JSON.parse(peopleJson) as typeof people
    } catch {
      // ignore malformed JSON
    }

    const namedPeople = people.filter((p) => p.name || p.company || p.jobTitle)
    const explicitlyRequestsPeople = PERSON_REQUEST_PATTERN.test(aiInstructions)
    const peopleLines = namedPeople.length > 0
      ? namedPeople.map((person) => {
          const parts = [person.name, person.jobTitle, person.company].filter(Boolean)
          return `- ${parts.join(' · ')}`
        })
      : ['- No named people were provided in the brief.']

    const normalizedLogos: Array<{ buffer: Buffer; mimeType: string; data: string }> = []
    let logoIndex = 0
    while (formData.has(`logo_${logoIndex}`)) {
      const logoFile = formData.get(`logo_${logoIndex}`) as File
      const mimeType = logoFile?.type || ''
      if (logoFile && logoFile.size > 0 && mimeType.startsWith('image/')) {
        normalizedLogos.push(await normalizeReferenceImage(logoFile))
      }
      logoIndex++
    }

    const normalizedPersonPhotos: Array<{ buffer: Buffer; mimeType: string; data: string }> = []
    let personIndex = 0
    while (formData.has(`person_photo_${personIndex}`)) {
      const photoFile = formData.get(`person_photo_${personIndex}`) as File
      const mimeType = photoFile?.type || ''
      if (photoFile && photoFile.size > 0 && mimeType.startsWith('image/')) {
        normalizedPersonPhotos.push(await normalizeReferenceImage(photoFile))
      }
      personIndex++
    }

    const logoZoneDesc = normalizedLogos.length > 0
      ? `${normalizedLogos.length} logo(s) will be composited here.`
      : 'A brand logo will be composited here.'
    const personZoneDesc = normalizedPersonPhotos.length > 0
      ? 'CRITICAL: A real person photo will be composited here — keep this zone background-only (pale blue blob + white). No generated person. No text.'
      : 'Contains the main visual subject (generated person, property, or object).'

    const lines: string[] = [
      '=== HOMES.PH SOCIAL MEDIA POSTER — DESIGN SPECIFICATION ===',
      '',
      'Generate a social media marketing poster matching the Homes.ph brand style described below.',
      '',
      '--- CREATIVE BRIEF ---',
      `Poster Type: ${posterType || 'General real estate marketing'}`,
      `Design Style: ${designStyle || 'Modern friendly professional'}`,
      `Style Traits: ${designTraits || 'Not specified'}`,
      `Canvas Size: ${sizeLabel}`,
      `Headline: ${headline || 'No headline provided'}`,
      `Subtitle: ${subtitle || 'No subtitle provided'}`,
      `Body Copy: ${content || 'No body copy provided'}`,
      `Additional Instructions: ${aiInstructions || 'None'}`,
      '',
      '=== LAYOUT STRUCTURE — HIGHEST PRIORITY, READ FIRST ===',
      '',
      'The canvas has four spatial regions. No text or label referencing these regions should appear in the image. These are instructions only:',
      '',
      '[TOP-LEFT CORNER — logo landing area]',
      '  The top-left area (roughly the first 28% of width and first 13% of height) must be pure white with no content whatsoever.',
      '  No headline, no text, no icons, no shapes may appear in this corner.',
      `  ${logoZoneDesc}`,
      '  The main headline must not start until at least 14% down from the top edge.',
      '',
      '[LEFT COLUMN — all text content]',
      '  The left 56% of the canvas (from 14% down to 83% of height) holds: headline, script accent line, horizontal divider, subtitle, body text, icon row, and callout cards.',
      '  All person name, job title, and company text must be placed in this column — never on the right side.',
      '',
      '[RIGHT COLUMN — visual / photo area]',
      `  The right 44% of the canvas (full height): ${personZoneDesc}`,
      '',
      '[BOTTOM-LEFT CORNER — decorative accent]',
      '  The bottom-left corner (roughly 30% width × 25% height from the bottom) holds: 1–2 large overlapping dark navy curved wave or quarter-circle shapes, plus a small solid gold/amber circle.',
      '',
      '=== VISUAL STYLE ===',
      '',
      'BACKGROUND:',
      '- Pure white (#FFFFFF) base — bright, clean, airy.',
      '- Large soft organic blob in very pale light blue (#DBEAFE) at top-right (Zone C area), soft blurred edges.',
      '- Another pale-blue blob at bottom-left, partially under the navy waves.',
      '- Solid amber/gold circle (#F5A623) partially cropped at the very top-right corner.',
      '- 5×5 or 6×6 grid of small dark navy dots (#1E3A8A) in upper-right, overlapping the pale-blue blob.',
      '',
      'BRAND COLORS:',
      '- Dark navy #1E3A8A — headline, icons, borders, divider lines, wave shapes.',
      '- Gold/amber #F5A623 — script accent line, icon fills, heart symbols, gold circle.',
      '- Light sky blue #DBEAFE — blob shapes only.',
      '- White #FFFFFF — background and card fills.',
      '',
      'TYPOGRAPHY:',
      '- Headline: Large bold sans-serif (Montserrat ExtraBold / Poppins Bold), dark navy, left-aligned, stacked 2–3 lines. Starts at ~14% from the top of the canvas, inside the left column.',
      '- Script accent: The most emotional word/phrase rendered in flowing gold cursive (#F5A623), slightly larger, with a hand-drawn heart or underline curl.',
      '- Body text: Regular weight, dark navy or charcoal, left-aligned. Key words bolded or gold.',
      '- No all-caps headline unless it is an event/announcement poster.',
      '',
      'DECORATIVE ELEMENTS (always include):',
      '- Bottom-left corner: 1–2 large overlapping dark navy curved wave shapes.',
      '- Small gold/amber solid circle inside or near those wave shapes.',
      '- Thin horizontal dark navy divider line (spanning ~40%–55% of canvas width) between the headline block and body text.',
      '',
      'ICON ROW (only if body copy has list items or features):',
      '- Small circle icons (thin navy border, line-art inside). Bold navy label below each. Left column only.',
      '',
      'CALLOUT CARDS (only if body copy has CTA or closing message):',
      '- White rounded-rectangle cards, thin navy border. Bottom of the left column. Each: small icon + 2–3 lines navy text.',
    ]

    lines.push('', '=== PEOPLE & PHOTOGRAPHY ===')

    if (normalizedPersonPhotos.length > 0) {
      lines.push(
        `A real person photo will be composited onto the right side of the poster after generation.`,
        'Because of this, the right column must have only a clean background: soft pale-blue blob + white. No generated person, no faces, no figures.',
        'Do NOT place any text in the right column.',
        'Person name, job title, and company must be rendered as styled text in the LEFT column, below the divider:',
        '  - Name: bold dark navy, medium-large.',
        '  - Job title and company: regular weight, smaller, charcoal.',
        namedPeople.length > 0 ? `  People to credit: ${peopleLines.join(' | ')}` : '  No named people — do not invent a name or title.',
      )
    } else if (explicitlyRequestsPeople || namedPeople.length > 0) {
      lines.push(
        'No person photo was uploaded. Generate a realistic person in the right column.',
        'Style: natural cut-out blending into the white background. No rectangular frame.',
        'Warm, aspirational, professionally styled. Southeast Asian / Filipino preferred.',
        namedPeople.length > 0
          ? `Render name/title as styled text in the lower-right area: ${peopleLines.join(' | ')}`
          : '',
      )
    } else {
      lines.push(
        'No person is involved. Right column visual: clean 3D house model, property photo, or lifestyle object, cut-out style blending into white.',
      )
    }

    lines.push(
      '',
      '=== CONTENT & INFORMATION HIERARCHY ===',
      '',
      'You are the designer — prioritize information, do not dump all text at equal size:',
      '  Priority 1 (largest): Headline + script accent line.',
      '  Priority 2 (medium): Subtitle or the single most important body copy sentence.',
      '  Priority 3 (small): Supporting details — dates, locations, organizer, contact info.',
      'For long body copy: break into logical groups using dividers, icon rows, or callout cards.',
      'Bold key phrases. Use gold color for emotionally important words. Let secondary info be smaller.',
      '',
      '=== TEXT RULES (STRICT) ===',
      '',
      'Only render text from: Headline, Subtitle, Body Copy, Additional Instructions fields.',
      'URLs, emails, contact details in the Body Copy MAY be rendered (they are user-provided).',
      'Do NOT invent: phone numbers, URLs, names, taglines, lorem ipsum, or filler text not in the brief.',
      'Do NOT render bracketed placeholders like [logo here], [website], [address].',
      'Empty fields = blank zone. Do not substitute invented content.',
      '',
      '=== BRANDING RULES ===',
      '',
      'Do NOT generate any logos or brand marks.',
      'The top-left corner of the poster (first 28% of width, first 13% of height) must be completely empty — pure white, nothing at all.',
      '',
      '=== CREATIVE DIRECTION ===',
      '',
      `Poster Type "${posterType || 'General'}" → tone: event/announcement = structured hierarchy; motivational = expressive typography; informational = icon rows + cards.`,
      `Design Style "${designStyle || 'Modern friendly professional'}" + Traits "${designTraits || 'not specified'}" → visual atmosphere, spacing, font weight.`,
      headline ? `Headline "${headline}" → expressive typographic treatment, script accent on the most emotional phrase.` : '',
      content ? `Body Copy (${content.split(/\s+/).length} words) → use layout elements to present cleanly. Prioritize. Breathe.` : '',
      aiInstructions ? `Additional Instructions: "${aiInstructions}" → follow precisely, these override other decisions.` : '',
      '',
      '=== FINAL QUALITY REQUIREMENTS ===',
      '',
      'Must look like a professional Filipino creative agency designed this for a real brand campaign.',
      'Bright, warm, friendly, modern. No dark backgrounds, no heavy shadows, no cluttered areas.',
      'No overlapping text. Every text element stays in the left column. The top-left corner is always empty.',
      'Every piece of information has intentional placement and appropriate size weight.',
      'Production-ready for Instagram and Facebook.',
    )

    const prompt = lines.join('\n')

    const ai = new GoogleGenAI({ apiKey })

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: getAspectRatio(numericFormatWidth, numericFormatHeight),
          imageSize: '1K',
        },
      },
    })

    const responseParts = response.candidates?.[0]?.content?.parts ?? []

    for (const part of responseParts) {
      if (part.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) {
        const generatedImageBuffer = Buffer.from(part.inlineData.data, 'base64')
        const withPeople = await compositePersonPhotos(generatedImageBuffer, normalizedPersonPhotos, namedPeople)
        const compositedBuffer = await compositeLogos(withPeople, normalizedLogos)
        return NextResponse.json({
          imageData: compositedBuffer.toString('base64'),
          mimeType: 'image/png',
        })
      }
    }

    const textPart = responseParts.find((p) => p.text)
    const detail = textPart?.text ?? 'The model did not return an image.'

    return NextResponse.json({ error: `Generation returned no image. ${detail}` }, { status: 500 })
  } catch (error) {
    console.error('[poster-generate-v1]', error)
    let message = 'Poster generation failed.'
    if (error instanceof Error) {
      try {
        const parsed = JSON.parse(error.message) as { error?: { message?: string } }
        message = parsed?.error?.message ?? error.message
      } catch {
        message = error.message
      }
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
