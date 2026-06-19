import nodemailer from 'nodemailer'

import {
  escapeHtml,
  getEmailLogoAttachment,
  renderBrandedEmailHtml,
  renderCodeBlock,
  renderDetailsTable,
  renderEmailButton,
} from '@/lib/server/email-layout'

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim() || 'smtp.hostinger.com'
  const port = Number.parseInt(process.env.SMTP_PORT?.trim() || '465', 10)
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  const secure = process.env.SMTP_SECURE?.trim() !== 'false'

  if (!user || !pass) {
    throw new Error('Missing SMTP_USER or SMTP_PASS environment variables.')
  }

  return { host, port, secure, user, pass }
}

function getFromAddress() {
  const configured = process.env.SMTP_FROM?.trim()
  if (configured) return configured

  const user = process.env.SMTP_USER?.trim()
  if (!user) throw new Error('Missing SMTP_USER environment variable.')

  return `"Homes.ph Drive" <${user}>`
}

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!transporter) {
    const config = getSmtpConfig()
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    })
  }

  return transporter
}

export async function sendEmail(params: {
  to: string
  subject: string
  text: string
  html: string
  branded?: boolean
}) {
  const mailer = getTransporter()

  await mailer.sendMail({
    from: getFromAddress(),
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
    attachments: params.branded ? [getEmailLogoAttachment()] : undefined,
  })
}

export async function sendMediaVerificationCodeEmail(params: {
  to: string
  firstName: string
  code: string
}) {
  const greeting = escapeHtml(params.firstName.trim() || 'there')
  const code = params.code.trim()

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">
      Hi ${greeting},
    </p>
    <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#334155;">
      Use the code below to verify your email and continue your Homes.ph Media registration.
    </p>
    ${renderCodeBlock(code)}
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#64748b;">
      This code expires in <strong>15 minutes</strong>.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">
      If you did not request media registration, you can safely ignore this email.
    </p>
  `

  await sendEmail({
    to: params.to,
    subject: 'Your Homes.ph Media verification code',
    text: [
      `Hi ${params.firstName.trim() || 'there'},`,
      '',
      `Your verification code is: ${code}`,
      '',
      'This code expires in 15 minutes.',
      '',
      'If you did not request media registration, you can ignore this email.',
      '',
      '— Homes.ph Drive',
    ].join('\n'),
    html: renderBrandedEmailHtml({
      title: 'Verify your email',
      previewText: `Your Homes.ph Media verification code is ${code}`,
      bodyHtml,
    }),
    branded: true,
  })
}

export async function sendMediaWelcomeEmail(params: {
  to: string
  firstName: string
  password: string
  dashboardUrl: string
  loginUrl: string
  userCode: string
}) {
  const greeting = escapeHtml(params.firstName.trim() || 'there')

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">
      Hi ${greeting},
    </p>
    <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#334155;">
      Your Homes.ph Media account is ready. Save these login details for future access.
    </p>
    ${renderDetailsTable([
      { label: 'Dashboard', value: 'Open your workspace', href: params.dashboardUrl },
      { label: 'Login page', value: params.loginUrl, href: params.loginUrl },
      { label: 'Email', value: params.to },
      { label: 'Password', value: params.password },
      { label: 'Account code', value: params.userCode },
    ])}
    ${renderEmailButton({ href: params.dashboardUrl, label: 'Open your dashboard' })}
    <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">
      For security, consider updating your password after your first sign-in.
    </p>
  `

  await sendEmail({
    to: params.to,
    subject: 'Your Homes.ph Media account is ready',
    text: [
      `Hi ${params.firstName.trim() || 'there'},`,
      '',
      'Your media account has been created. Here are your login details:',
      '',
      `Dashboard link: ${params.dashboardUrl}`,
      `Login page: ${params.loginUrl}`,
      `Email: ${params.to}`,
      `Password: ${params.password}`,
      `Account code: ${params.userCode}`,
      '',
      'Please sign in and change your password after your first login.',
      '',
      '— Homes.ph Drive',
    ].join('\n'),
    html: renderBrandedEmailHtml({
      title: 'Welcome to Homes.ph Media',
      previewText: 'Your media account is ready. Open your dashboard to get started.',
      bodyHtml,
    }),
    branded: true,
  })
}
