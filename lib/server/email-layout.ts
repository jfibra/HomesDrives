import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Attachment } from 'nodemailer/lib/mailer'

export const EMAIL_LOGO_CID = 'homes-drive-logo'

const BRAND = {
  primary: '#002045',
  primaryLight: '#1a365d',
  accent: '#f5a623',
  surface: '#f8fafc',
  text: '#1f2937',
  muted: '#64748b',
  border: '#e2e8f0',
  white: '#ffffff',
} as const

const LOGO_FILE = 'Homes Drive Logo Blue.png'

function getLogoPath() {
  return join(process.cwd(), 'public', LOGO_FILE)
}

export function getEmailLogoAttachment(): Attachment {
  return {
    filename: 'homes-drive-logo.png',
    path: getLogoPath(),
    cid: EMAIL_LOGO_CID,
  }
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type BrandedEmailParams = {
  title: string
  previewText?: string
  bodyHtml: string
  footerHtml?: string
}

export function renderBrandedEmailHtml(params: BrandedEmailParams) {
  const title = escapeHtml(params.title)
  const previewText = escapeHtml(params.previewText ?? params.title)
  const footer =
    params.footerHtml ??
    `&copy; ${new Date().getFullYear()} Homes.ph Drive. All rights reserved.`

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BRAND.surface};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
      ${previewText}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.surface};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:${BRAND.white};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,32,69,0.08);">
            <tr>
              <td style="background:linear-gradient(180deg, ${BRAND.surface} 0%, ${BRAND.white} 100%);padding:28px 32px 20px;text-align:center;border-bottom:3px solid ${BRAND.accent};">
                <img
                  src="cid:${EMAIL_LOGO_CID}"
                  alt="Homes.ph Drive"
                  width="240"
                  style="display:block;margin:0 auto;max-width:240px;width:100%;height:auto;border:0;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px;">
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.primary};">
                  ${title}
                </h1>
                ${params.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background-color:${BRAND.primary};padding:20px 32px;text-align:center;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.82);">
                  ${footer}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function renderEmailButton(params: { href: string; label: string }) {
  const href = escapeHtml(params.href)
  const label = escapeHtml(params.label)

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:10px;background-color:${BRAND.primary};">
          <a
            href="${href}"
            style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:700;color:${BRAND.white};text-decoration:none;border-radius:10px;"
          >
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `
}

export function renderCodeBlock(code: string) {
  const safeCode = escapeHtml(code)

  return `
    <div style="margin:24px 0;padding:20px 16px;border-radius:12px;background-color:${BRAND.surface};border:1px dashed ${BRAND.border};text-align:center;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};font-weight:700;">
        Verification code
      </p>
      <p style="margin:0;font-size:36px;line-height:1;font-weight:700;letter-spacing:0.35em;color:${BRAND.primary};">
        ${safeCode}
      </p>
    </div>
  `
}

export function renderDetailsTable(rows: Array<{ label: string; value: string; href?: string }>) {
  const rowHtml = rows
    .map((row) => {
      const label = escapeHtml(row.label)
      const value = row.href
        ? `<a href="${escapeHtml(row.href)}" style="color:${BRAND.primaryLight};text-decoration:none;font-weight:700;">${escapeHtml(row.value)}</a>`
        : `<strong style="color:${BRAND.text};">${escapeHtml(row.value)}</strong>`

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:14px;width:38%;vertical-align:top;">
            ${label}
          </td>
          <td style="padding:12px 0;border-bottom:1px solid ${BRAND.border};font-size:14px;vertical-align:top;">
            ${value}
          </td>
        </tr>
      `
    })
    .join('')

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;">
      ${rowHtml}
    </table>
  `
}

// Warm cache so missing logo fails early during send.
try {
  readFileSync(getLogoPath())
} catch {
  // Logo is optional at import time; send will fail with a clear error if missing.
}
