create table if not exists public.album_users (
  id bigint generated always as identity primary key,
  first_name text not null,
  last_name text not null,
  full_name text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  area_focused text not null,
  email text not null unique,
  phone_number text not null,
  password text not null,
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists album_users_status_idx
  on public.album_users (status);

create index if not exists album_users_area_focused_idx
  on public.album_users (area_focused);

create unique index if not exists album_users_code_idx
  on public.album_users (code);

create or replace function public.set_album_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_album_users_set_updated_at on public.album_users;

create trigger trg_album_users_set_updated_at
before update on public.album_users
for each row
execute function public.set_album_users_updated_at();

insert into public.album_users (
  first_name,
  last_name,
  full_name,
  status,
  area_focused,
  email,
  phone_number,
  password,
  code
)
values
  ('Frank', 'Gomez', 'Frank Gomez', 'active', 'Cebu', 'frank.gomez@homesalbums.local', '+639171001001', 'Pass@1234', 'ALB-FRANK-GOMEZ-7K2M'),
  ('Jaevie', 'Bayona', 'Jaevie Bayona', 'active', 'Cebu', 'jaevie.bayona@homesalbums.local', '+639171001002', 'Pass@1234', 'ALB-JAEVIE-BAYONA-4P8T'),
  ('Jomari', 'Marson', 'Jomari Marson', 'active', 'Cebu', 'jomari.marson@homesalbums.local', '+639171001003', 'Pass@1234', 'ALB-JOMARI-MARSON-9D3Q'),
  ('Hernan', 'Malubay', 'Hernan Malubay', 'active', 'Cebu', 'hernan.malubay@homesalbums.local', '+639171001004', 'Pass@1234', 'ALB-HERNAN-MALUBAY-2V6L'),
  ('Michaela', 'Lagdamen', 'Michaela Lagdamen', 'active', 'Cebu', 'michaela.lagdamen@homesalbums.local', '+639171001005', 'Pass@1234', 'ALB-MICHAELA-LAGDAMEN-5N1R'),
  ('Johnry', 'Fibra', 'Johnry Fibra', 'active', 'Cebu', 'johnry.fibra@homesalbums.local', '+639171001006', 'Pass@1234', 'ALB-JOHNRY-FIBRA-8X4C'),
  ('Marcelo Cagara', 'Jr', 'Marcelo Cagara Jr', 'active', 'Cebu', 'marcelo.cagara.jr@homesalbums.local', '+639171001007', 'Pass@1234', 'ALB-MARCELO-CAGARA-JR-3H7W')
on conflict (email) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  full_name = excluded.full_name,
  status = excluded.status,
  area_focused = excluded.area_focused,
  phone_number = excluded.phone_number,
  password = excluded.password,
  code = excluded.code,
  updated_at = now();