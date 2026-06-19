-- Media email verification on existing album_users table.
-- Run once in Supabase SQL Editor (safe to re-run).

alter table public.album_users
  add column if not exists email_verification_code text;

alter table public.album_users
  add column if not exists email_verification_expires_at timestamptz;

create index if not exists album_users_email_verification_expires_idx
  on public.album_users (email_verification_expires_at)
  where email_verification_expires_at is not null;
