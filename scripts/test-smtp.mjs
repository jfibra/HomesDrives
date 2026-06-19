import { readFileSync } from 'node:fs'

import nodemailer from 'nodemailer'

function loadEnv() {
  const env = {}
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index === -1) continue
    const key = line.slice(0, index)
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const env = loadEnv()
const to = process.argv[2] || env.SMTP_USER

if (!to) {
  console.error('Usage: node scripts/test-smtp.mjs [recipient-email]')
  process.exit(1)
}

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'smtp.hostinger.com',
  port: Number.parseInt(env.SMTP_PORT || '465', 10),
  secure: env.SMTP_SECURE !== 'false',
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
})

await transporter.sendMail({
  from: env.SMTP_FROM || `"Homes.ph Drive" <${env.SMTP_USER}>`,
  to,
  subject: 'Homes.ph Drive SMTP test',
  text: 'SMTP is configured correctly for media registration emails.',
  html: '<p>SMTP is configured correctly for <strong>media registration</strong> emails.</p>',
})

console.log('Test email sent to', to)
