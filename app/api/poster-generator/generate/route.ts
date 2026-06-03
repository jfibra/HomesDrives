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

  let currentTop = margin
  const logoComposites = prepared.map((logo) => {
    const overlay = { input: logo.input, left: margin, top: currentTop }
    currentTop += logo.height + logoGap
    return overlay
  })

  return sharp(baseImageBuffer)
    .composite(logoComposites)
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

async function enhanceBriefWithPerplexity(
  posterType: string,
  designStyle: string,
  designTraits: string,
  headline: string,
  subtitle: string,
  content: string,
  aiInstructions: string,
  apiKey: string,
): Promise<string> {
  const briefLines = [
    `Poster Type: ${posterType || 'General real estate marketing'}`,
    `Design Style: ${designStyle || 'Modern friendly professional'}`,
    `Style Traits: ${designTraits || 'Not specified'}`,
    headline ? `Headline: "${headline}"` : null,
    subtitle ? `Subtitle: "${subtitle}"` : null,
    content ? `Body Copy: "${content}"` : null,
    aiInstructions ? `Additional Instructions: "${aiInstructions}"` : null,
  ].filter(Boolean).join('\n')

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content:
            'You are a senior award-winning creative director at a world-class Philippine real estate marketing agency. Given a poster brief, write 5–7 sentences of specific, opinionated visual design direction for an AI image generator that will produce stunning, scroll-stopping work. Be specific about: exact background treatment (gradient colours, atmosphere), typography drama (size, weight contrast, accent techniques), one dominant focal point, specific colour palette with hex codes, and the emotional mood to convey. Reference real design aesthetics (e.g. "Brutalist editorial", "luxury magazine", "bold street poster", "cinematic"). Output design direction only — no preamble, no bullet points, no generic advice.',
        },
        {
          role: 'user',
          content: `Write specific, bold visual design direction for this poster brief. Push for something genuinely beautiful and modern — not safe or generic:\n\n${briefLines}`,
        },
      ],
      max_tokens: 400,
    }),
  })

  if (!response.ok) {
    throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

export async function POST(request: Request) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured.' }, { status: 500 })
    }

    const formData = await request.formData()

    const provider = (formData.get('provider') as string | null)?.trim() ?? 'gemini'
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

    let perplexityEnhancement = ''
    if (provider === 'perplexity') {
      const perplexityKey = process.env.PERPLEXITY_API_KEY
      if (!perplexityKey) {
        return NextResponse.json({ error: 'Perplexity API key is not configured.' }, { status: 500 })
      }
      try {
        perplexityEnhancement = await enhanceBriefWithPerplexity(
          posterType, designStyle, designTraits, headline, subtitle, content, aiInstructions, perplexityKey,
        )
      } catch (err) {
        console.error('[perplexity-enhance]', err)
        // Non-fatal — proceed with Gemini using the original brief
      }
    }

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

    const sceneMode = (formData.get('sceneMode') as string | null)?.trim() ?? 'background'
    const scenePhotoFile = formData.get('scene_photo') as File | null
    let normalizedScenePhoto: { buffer: Buffer; mimeType: string; data: string } | null = null
    if (scenePhotoFile && scenePhotoFile.size > 0 && scenePhotoFile.type.startsWith('image/')) {
      normalizedScenePhoto = await normalizeReferenceImage(scenePhotoFile)
    }

    const lines: string[] = [
      'You are an award-winning creative director at a world-class Philippine real estate marketing agency.',
      'Your work has won design awards, appeared in marketing publications, and stopped people mid-scroll on social media.',
      'Create a STUNNING, scroll-stopping social media poster for a real estate campaign.',
      '',
      '━━━ CAMPAIGN BRIEF ━━━',
      `Poster Type: ${posterType || 'General real estate marketing'}`,
      `Design Style: ${designStyle || 'Modern Premium'}`,
      `Style Traits: ${designTraits || 'sophisticated, bold, editorial'}`,
      `Canvas Size: ${sizeLabel}`,
      `Headline: ${headline || '(none — use visual elements to carry the poster)'}`,
      `Subtitle: ${subtitle || '(none)'}`,
      `Body Copy: ${content || '(none)'}`,
      `Additional Instructions: ${aiInstructions || 'none'}`,
      '',
      '━━━ NON-NEGOTIABLE CONSTRAINTS ━━━',
      '',
      ...(normalizedLogos.length > 0 ? [
        '1. LOGO PLACEMENT AREA: A transparent-background logo image will be composited onto the top-left area after generation.',
        '   - Let the poster background design continue naturally into the top-left corner — do NOT paint a white box, white panel, light rectangle, or any solid block of colour there.',
        '   - Simply avoid placing any headline text, icons, or decorative shapes in the top-left 28%-width × 13%-height corner.',
        '   - The background texture/colour/gradient should flow seamlessly through that corner so the transparent logo sits cleanly on top.',
        '   - The headline must NOT start until at least 15% down from the top edge.',
        '',
      ] : [
        '1. NO LOGO: There is no logo for this poster. Design freely across the full canvas — do NOT leave any white box, placeholder rectangle, or blank area in the top-left corner.',
        '',
      ]),
      '2. TEXT FIDELITY (STRICT): Only render text that appears in the Creative Brief above.',
      '   - Do NOT invent phone numbers, URLs, addresses, names, slogans, lorem ipsum, or any filler text.',
      '   - Do NOT render bracketed placeholders like [logo here] or [your name].',
      '   - If a field is empty, leave that space empty.',
      '',
      '3. NO LOGOS: Do not generate any brand marks, logos, or watermarks.',
      '',
      '━━━ VISUAL DESIGN — MAKE THIS GENUINELY BEAUTIFUL ━━━',
      '',
      'You have full creative freedom. AVOID these common AI design failures:',
      '✗ Plain white backgrounds with generic coloured blobs',
      '✗ Clip-art or cartoonish illustrations',
      '✗ Canva free-template layouts',
      '✗ Equal-weight text blocks with no visual hierarchy',
      '✗ Overcrowded layouts trying to fit everything in',
      '✗ Muddy or unintentional colour combinations',
      '',
      'INSTEAD, create:',
      '✓ A background with genuine visual atmosphere and depth',
      '✓ Typography so bold the headline owns the poster',
      '✓ Layered elements that create dimension and richness',
      '✓ A curated 3–4 colour palette used with precision',
      '✓ Generous white space around key text so it breathes',
      '✓ One dominant focal point that anchors the eye immediately',
      '',
      '━━━ BACKGROUND & ATMOSPHERE ━━━',
      '',
      'Choose a background treatment that matches the Design Style. Options:',
      '',
      'DARK/LUXURY: Deep gradient from near-black (#0A0E1A) or rich midnight navy (#0D1B2A) to deep forest (#0F2D27) or dark slate (#1A1A2E). Subtle noise or grain texture. Gold/champagne accent shapes.',
      'MODERN/BOLD: Rich colour blocking — e.g. deep teal (#006d6d) fills the top 60%, clean off-white (#F8F5F0) fills the bottom. A bold angled or curved divider between them.',
      'WARM/PREMIUM: Warm cream (#FDF6EC) or champagne base. Large bold accent panels in terracotta (#C75B3A), warm amber (#D4832A), or dusty rose. NOT plain white.',
      'CONTEMPORARY/CLEAN: Off-white (#F4F1EC) background with a single dramatic full-bleed colour bar — deep navy or charcoal — occupying one large portion of the canvas.',
      'VIBRANT/ENERGETIC: Vivid gradient (e.g. coral → magenta, or electric teal → deep purple) as the full background with white text on top. Bold and confident.',
      '',
      'Whatever you choose: the background must set a MOOD, not just fill space.',
      '',
      '━━━ TYPOGRAPHY — MAKE IT COMMAND ATTENTION ━━━',
      '',
      `Headline: Ultra-bold, massive — ${headline ? `"${headline}"` : 'use a grand architectural visual instead'}`,
      '  - Font: Playfair Display / Didot-style serif for luxury, or Poppins ExtraBold / Montserrat Black for modern.',
      '  - Size: Headline text should be LARGE — occupying 25%–40% of the canvas height visually.',
      '  - Colour: Contrasting with background (white/gold on dark; deep navy/charcoal on light).',
      '  - Style: Mix weights — ultra-bold main line, then a thinner weight for a sub-phrase on the next line.',
      '',
      subtitle ? `Subtitle: "${subtitle}" — elegant, moderate size, well-spaced below the headline. Lighter weight.` : '',
      content ? `Body copy (${content.split(/\s+/).length} words): Break into digestible chunks with clear visual grouping. No dense text walls.` : '',
      '',
      'ACCENT: Pick one emotionally powerful word or phrase from the headline. Render it in:',
      '  - A flowing script/italic style, OR',
      '  - A contrasting accent colour (gold #C9A44A, copper #B87333, or coral #E8604C), OR',
      '  - Oversized behind the main headline as a ghost/watermark element.',
      '',
      '━━━ LAYOUT & COMPOSITION ━━━',
      '',
      'PRIMARY LAYOUT: Left-heavy editorial.',
      '  - Left 55%–60%: All text — headline starts at 15% from top, body copy flows down with generous line-height.',
      '  - Right 40%–45%: Visual element (person, property, or abstract design shape).',
      '  - Bottom-left: Bold decorative anchor — large geometric shape, arc, or abstract form.',
      '',
      'DECORATIVE ELEMENTS (choose 2–3, not all):',
      '  - Large bold geometric shapes: rectangle cut at a diagonal, sweeping arc, oversized circle — in accent colour.',
      '  - Thin elegant rule lines above or below the headline (1–2px, spanning 30%–50% of canvas width).',
      '  - Subtle repeating pattern (tiny dots, fine diagonal lines, crosshatch) at 5%–10% opacity as background texture.',
      '  - An oversized numeral, letter, or abstract shape as a ghost layer behind the headline.',
      '  - A bold solid-colour panel or card holding body copy — contrasting with the background.',
      '',
      'BREATHING ROOM: Leave 8%–12% margin on all sides. Text should never touch the canvas edge.',
      '',
      '━━━ COLOUR STRATEGY ━━━',
      '',
      'Use exactly 3–4 colours. Choose a palette matching the Design Style:',
      '  - Luxury/Premium: Midnight Navy (#0D1B3E) + Champagne Gold (#C9A44A) + Ivory (#F5F0E8)',
      '  - Modern/Bold: Deep Teal (#005F73) + Coral (#EE6C4D) + Off-white (#F8F5F0) + Charcoal (#2B2D42)',
      '  - Warm/Friendly: Terracotta (#C1440E) + Warm Amber (#E8A838) + Cream (#FDF6EC) + Dark Brown (#3D1F00)',
      '  - Contemporary: Slate (#2B3A4A) + Electric Blue (#0A84FF) + White (#FFFFFF) + Light Grey (#F2F2F7)',
      '  - Vibrant: Magenta (#C2185B) + Deep Purple (#4A148C) + White (#FFFFFF) + Gold (#FFD600)',
      '',
      'Apply colours with intention: dominant background colour, contrasting text colour, accent colour for highlights, neutral for supporting text.',
      '',
      '━━━ PEOPLE & PHOTOGRAPHY ━━━',
    ]

    if (normalizedScenePhoto) {
      if (sceneMode === 'background') {
        lines.push(
          '',
          '━━━ BACKGROUND PHOTO (attached image — highest visual priority) ━━━',
          'The attached image is the poster background. Use it as the full-bleed canvas backdrop.',
          'Do NOT replace, ignore, or generate an alternative background — this image IS the background.',
          'Design all text, shapes, and decorative elements directly on top of this photo.',
          'Where text needs to be readable, apply a subtle gradient overlay or frosted-glass panel — never a solid white block.',
          'The overall visual mood, colour palette, and atmosphere must be drawn from this background photo.',
        )
      } else {
        lines.push(
          '',
          '━━━ FEATURED IMAGE (attached image — key visual element) ━━━',
          'The attached image must be prominently featured in the poster design.',
          'Place it in the right visual zone or as the dominant focal point of the layout.',
          'Style the surrounding design (colours, shapes, typography) to complement and showcase this image.',
          'Do not crop it aggressively — let it breathe. Frame it with design elements rather than boxing it.',
        )
      }
    }

    if (normalizedPersonPhotos.length > 0) {
      lines.push(
        'A real person photo WILL BE composited onto the right side after generation.',
        'CRITICAL: The right 44% of the canvas must be a CLEAN BACKGROUND ONLY — gradient, solid colour, or subtle texture that will frame the composited photo.',
        'Do NOT generate any person, face, or figure in the right zone. Do NOT place any text in the right zone.',
        'The background in the right zone should complement (not compete with) a professional person photo.',
        'Person credits go in the LEFT column, below the headline, in the designated text area:',
        namedPeople.length > 0
          ? `  Name, title, company: ${peopleLines.join(' | ')} — render as styled text, name in bold, title/company smaller.`
          : '  No named people provided — do not invent any name or title.',
      )
    } else if (explicitlyRequestsPeople || namedPeople.length > 0) {
      lines.push(
        'No photo uploaded. Generate a photorealistic person in the right visual zone.',
        'Style: professional, aspirational, naturally lit. Southeast Asian / Filipino appearance preferred.',
        'Cut-out style — figure blends softly into the poster background, no hard rectangular frame.',
        namedPeople.length > 0
          ? `Render their name/title elegantly below or beside them: ${peopleLines.join(' | ')}`
          : '',
      )
    } else {
      lines.push(
        'No person involved. Right-side visual: choose the most impactful option for this campaign:',
        '  A) A photorealistic architectural 3D render of a luxury home or property (not cartoonish).',
        '  B) A dramatic wide-angle interior shot — marble floors, floor-to-ceiling windows, modern furnishings.',
        '  C) A bold abstract shape or layered geometric composition in the accent colour palette.',
        '  D) An editorial lifestyle shot — family, couple, or individual in a premium property setting.',
      )
    }

    lines.push(
      '',
      '━━━ INFORMATION HIERARCHY ━━━',
      '',
      'Prioritise content ruthlessly — not everything needs equal prominence:',
      '  TIER 1 (dominant, ~60% of text real estate): Headline + accent phrase.',
      '  TIER 2 (secondary, ~25%): Subtitle or single most important body sentence.',
      '  TIER 3 (small, ~15%): Supporting detail — dates, locations, contact info if provided.',
      '',
      'For multi-item body copy: use minimal icon bullets or a clean numbered list — never a wall of text.',
      'For a call-to-action phrase: isolate it in a bold pill/button shape or bordered card for visual impact.',
      '',
      '━━━ FINAL QUALITY BAR ━━━',
      '',
      'Before you output, ask: "Would this win a design award or make someone stop scrolling?"',
      'The poster must look like it was crafted by a senior designer at a premium Manila creative studio.',
      'It should feel premium, intentional, and alive — not templated, safe, or generated.',
      '',
      aiInstructions ? `USER OVERRIDE (follow precisely, highest priority after constraints): "${aiInstructions}"` : '',
      '',
      'Output canvas size: ' + sizeLabel + '. Production-ready for Instagram and Facebook.',
    )

    if (perplexityEnhancement) {
      lines.push(
        '',
        '=== PERPLEXITY-ENHANCED CREATIVE DIRECTION (HIGHEST PRIORITY) ===',
        '',
        perplexityEnhancement,
        'Apply the above creative direction precisely — it overrides generic style defaults.',
      )
    }

    const prompt = lines.join('\n')

    const ai = new GoogleGenAI({ apiKey: geminiKey })

    const contents = normalizedScenePhoto
      ? [
          {
            role: 'user' as const,
            parts: [
              { text: prompt },
              { inlineData: { mimeType: normalizedScenePhoto.mimeType, data: normalizedScenePhoto.data } },
            ],
          },
        ]
      : prompt

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents,
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
