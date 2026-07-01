-- People / face recognition (iPhone Photos–style grouping)
-- Requires: albums_photos table, pgvector extension
-- Safe to re-run in Supabase SQL Editor

create extension if not exists vector;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Unknown',
  cover_face_url text,
  photo_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.faces (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.albums_photos (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  embedding vector(512),
  face_thumbnail_url text,
  bounding_box jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists faces_photo_id_idx on public.faces (photo_id);
create index if not exists faces_person_id_idx on public.faces (person_id);
create index if not exists people_photo_count_idx on public.people (photo_count desc, created_at desc);

-- Tracks when face detection last ran (including photos with zero faces).
alter table public.albums_photos add column if not exists faces_scanned_at timestamptz;

create index if not exists albums_photos_pending_face_scan_idx
  on public.albums_photos (folder_id)
  where faces_scanned_at is null;

-- Cosine similarity search (HNSW preferred for scale; ivfflat works on smaller datasets)
do $$
begin
  if not exists (
    select 1 from pg_indexes where indexname = 'faces_embedding_hnsw_idx'
  ) then
    create index faces_embedding_hnsw_idx
      on public.faces
      using hnsw (embedding vector_cosine_ops);
  end if;
exception
  when others then
    raise notice 'HNSW index skipped: %', sqlerrm;
end
$$;

-- Refresh distinct photo_count per person
create or replace function public.refresh_person_photo_count(p_person_id uuid)
returns void
language sql
as $$
  update public.people
  set photo_count = (
    select count(distinct photo_id)::integer
    from public.faces
    where person_id = p_person_id
  )
  where id = p_person_id;
$$;

-- Match faces by embedding cosine similarity (1 = identical)
create or replace function public.match_faces(
  query_embedding vector(512),
  match_threshold float default 0.45,
  match_count integer default 5
)
returns table (
  face_id uuid,
  person_id uuid,
  photo_id uuid,
  similarity float
)
language sql
stable
as $$
  select
    f.id as face_id,
    f.person_id,
    f.photo_id,
    (1 - (f.embedding <=> query_embedding))::float as similarity
  from public.faces f
  where f.embedding is not null
    and (1 - (f.embedding <=> query_embedding)) >= match_threshold
  order by f.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- Distinct photos for a person (paginated)
create or replace function public.get_person_photo_ids(
  p_person_id uuid,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (photo_id uuid)
language sql
stable
as $$
  select distinct f.photo_id
  from public.faces f
  where f.person_id = p_person_id
  order by f.photo_id
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

create or replace function public.count_person_photos(p_person_id uuid)
returns bigint
language sql
stable
as $$
  select count(distinct photo_id)
  from public.faces
  where person_id = p_person_id;
$$;

-- Event-scoped people (via albums_folders.portal_event_id)
create or replace function public.list_people_for_event(
  p_event_id uuid,
  p_limit integer default 24,
  p_offset integer default 0,
  p_search text default null
)
returns table (
  id uuid,
  name text,
  cover_face_url text,
  photo_count bigint,
  created_at timestamptz
)
language sql
stable
as $$
  select
    p.id,
    p.name,
    p.cover_face_url,
    count(distinct f.photo_id) as photo_count,
    p.created_at
  from public.people p
  inner join public.faces f on f.person_id = p.id
  inner join public.albums_photos ap on ap.id = f.photo_id
  inner join public.albums_folders af on af.id = ap.folder_id
  where af.portal_event_id = p_event_id
    and (
      p_search is null
      or btrim(p_search) = ''
      or p.name ilike ('%' || btrim(p_search) || '%')
    )
  group by p.id, p.name, p.cover_face_url, p.created_at
  having count(distinct f.photo_id) > 0
  order by photo_count desc, p.created_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

create or replace function public.count_people_for_event(
  p_event_id uuid,
  p_search text default null
)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from (
    select p.id
    from public.people p
    inner join public.faces f on f.person_id = p.id
    inner join public.albums_photos ap on ap.id = f.photo_id
    inner join public.albums_folders af on af.id = ap.folder_id
    where af.portal_event_id = p_event_id
      and (
        p_search is null
        or btrim(p_search) = ''
        or p.name ilike ('%' || btrim(p_search) || '%')
      )
    group by p.id
    having count(distinct f.photo_id) > 0
  ) scoped_people;
$$;

create or replace function public.get_person_photo_ids_for_event(
  p_person_id uuid,
  p_event_id uuid,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (photo_id uuid)
language sql
stable
as $$
  select distinct f.photo_id
  from public.faces f
  inner join public.albums_photos ap on ap.id = f.photo_id
  inner join public.albums_folders af on af.id = ap.folder_id
  where f.person_id = p_person_id
    and af.portal_event_id = p_event_id
  order by f.photo_id
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

create or replace function public.count_person_photos_for_event(
  p_person_id uuid,
  p_event_id uuid
)
returns bigint
language sql
stable
as $$
  select count(distinct f.photo_id)
  from public.faces f
  inner join public.albums_photos ap on ap.id = f.photo_id
  inner join public.albums_folders af on af.id = ap.folder_id
  where f.person_id = p_person_id
    and af.portal_event_id = p_event_id;
$$;

create or replace function public.match_faces_for_event(
  query_embedding vector(512),
  p_event_id uuid,
  match_threshold float default 0.45,
  match_count integer default 5
)
returns table (
  face_id uuid,
  person_id uuid,
  photo_id uuid,
  similarity float
)
language sql
stable
as $$
  select
    f.id as face_id,
    f.person_id,
    f.photo_id,
    (1 - (f.embedding <=> query_embedding))::float as similarity
  from public.faces f
  inner join public.albums_photos ap on ap.id = f.photo_id
  inner join public.albums_folders af on af.id = ap.folder_id
  where af.portal_event_id = p_event_id
    and f.embedding is not null
    and (1 - (f.embedding <=> query_embedding)) >= match_threshold
  order by f.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
