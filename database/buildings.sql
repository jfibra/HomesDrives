-- Building recognition testing dataset
-- Requires: pgvector extension (see database/people-faces.sql)
-- Safe to re-run in Supabase SQL Editor

create extension if not exists vector;

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  full_address text,
  latitude double precision,
  longitude double precision,
  listings jsonb not null default '[]'::jsonb,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.building_embeddings (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  embedding vector(512),
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists buildings_created_at_idx
  on public.buildings (created_at desc);

create index if not exists building_embeddings_building_id_idx
  on public.building_embeddings (building_id);

do $$
begin
  if not exists (
    select 1 from pg_indexes where indexname = 'building_embeddings_embedding_hnsw_idx'
  ) then
    create index building_embeddings_embedding_hnsw_idx
      on public.building_embeddings
      using hnsw (embedding vector_cosine_ops);
  end if;
exception
  when others then
    raise notice 'HNSW index skipped: %', sqlerrm;
end
$$;

create or replace function public.set_buildings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_buildings_set_updated_at on public.buildings;

create trigger trg_buildings_set_updated_at
before update on public.buildings
for each row
execute function public.set_buildings_updated_at();

-- Drop legacy 3-arg overload (causes "could not choose the best candidate function" with PostgREST)
drop function if exists public.match_buildings(vector, double precision, integer);

create or replace function public.match_buildings(
  query_embedding vector(512),
  match_threshold float default 0.65,
  match_count integer default 12,
  scan_latitude double precision default null,
  scan_longitude double precision default null,
  scan_radius_km double precision default null
)
returns table (
  building_id uuid,
  embedding_id uuid,
  similarity float
)
language sql
stable
as $$
  with ranked as (
    select
      be.building_id,
      be.id as embedding_id,
      1 - (be.embedding <=> query_embedding) as similarity,
      row_number() over (
        partition by be.building_id
        order by be.embedding <=> query_embedding
      ) as rn
    from public.building_embeddings be
    inner join public.buildings b on b.id = be.building_id
    where be.embedding is not null
      and (
        scan_latitude is null
        or scan_longitude is null
        or scan_radius_km is null
        or (
          b.latitude is not null
          and b.longitude is not null
          and (
            6371 * acos(
              least(
                1.0,
                greatest(
                  -1.0,
                  cos(radians(scan_latitude)) * cos(radians(b.latitude))
                  * cos(radians(b.longitude) - radians(scan_longitude))
                  + sin(radians(scan_latitude)) * sin(radians(b.latitude))
                )
              )
            )
          ) <= scan_radius_km
        )
      )
  )
  select ranked.building_id, ranked.embedding_id, ranked.similarity
  from ranked
  where ranked.rn = 1
    and ranked.similarity >= match_threshold
  order by ranked.similarity desc
  limit match_count;
$$;

create index if not exists buildings_lat_lng_idx
  on public.buildings (latitude, longitude)
  where latitude is not null and longitude is not null;

