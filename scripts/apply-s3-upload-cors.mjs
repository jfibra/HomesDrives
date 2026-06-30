#!/usr/bin/env node
/**
 * Apply browser upload CORS to the S3 bucket used by HomesDrives.
 * Requires AWS CLI configured with permission to PutBucketCors.
 *
 * Usage:
 *   node scripts/apply-s3-upload-cors.mjs
 *   node scripts/apply-s3-upload-cors.mjs my-other-bucket
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bucket = process.argv[2] || process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME

if (!bucket) {
  console.error('Set AWS_S3_BUCKET or pass the bucket name as the first argument.')
  process.exit(1)
}

const corsPath = join(__dirname, 's3-browser-upload-cors.json')
const result = spawnSync(
  'aws',
  ['s3api', 'put-bucket-cors', '--bucket', bucket, '--cors-configuration', `file://${corsPath}`],
  { encoding: 'utf8', shell: true },
)

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'aws s3api put-bucket-cors failed')
  process.exit(result.status ?? 1)
}

console.log(`Applied browser upload CORS to bucket: ${bucket}`)
