-- Profile: avatar URL for album_users (media / customer self-service in dashboard)
-- Run in Supabase SQL Editor. Safe to run multiple times.

alter table public.album_users
  add column if not exists avatar_url text;

comment on column public.album_users.avatar_url is 'Public URL for user profile avatar image (S3 or compatible).';

