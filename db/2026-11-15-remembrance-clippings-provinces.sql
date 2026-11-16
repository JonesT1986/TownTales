-- TownTales: Cemetery & Remembrance, Newspaper Clippings and Province pages schema
-- Run once in Supabase > SQL Editor (project zpqwrzsgpwwjrlbnfynn). Safe to re-run.
-- Based on the 2026-11-15 brief, with fixes marked FIX.

begin;

-- ============================================================
-- 1. CEMETERIES
-- ============================================================
create table if not exists public.cemeteries (
  id text primary key,
  town text not null references public.towns(slug),        -- FIX: must be a real town slug, e.g. 'wapella-sk'
  name text not null,
  aka jsonb not null default '[]',
  location_desc text,
  affiliation text,
  status text not null default 'unknown',
  managed_by text,
  source text not null,
  source_url text,
  created_at timestamptz not null default now()
);
create index if not exists cemeteries_town_idx on public.cemeteries (town);

-- ============================================================
-- 2. MEMORIALS
-- ============================================================
create table if not exists public.memorials (
  id text primary key,
  town text not null references public.towns(slug),
  cemetery_id text references public.cemeteries(id),
  cemetery_name text,
  name text not null,
  maiden_name text,
  birth_date_label text,          -- stored and shown exactly as published ("c. 1880")
  birth_place text,
  death_date_label text,
  death_place text,
  note text,
  tier text not null default 'documented'
    check (tier in ('documented','community')),           -- FIX: documented = "Verified", community = "Community Memory"
  source text not null,
  source_url text,
  status text not null default 'published'
    check (status in ('pending','published','declined')),
  created_at timestamptz not null default now()
);
create index if not exists memorials_town_idx     on public.memorials (town);
create index if not exists memorials_cemetery_idx on public.memorials (cemetery_id);
create index if not exists memorials_name_idx     on public.memorials (name);
create index if not exists memorials_status_idx   on public.memorials (status);

-- FIX: the family form collects submitter name, email, relationship and attestation.
-- These live in a separate table with NO public read, so the email can never leak
-- through the public API (a column on memorials would be readable by anyone).
create table if not exists public.memorial_submissions (
  memorial_id text primary key references public.memorials(id) on delete cascade,
  submitter_name text not null,
  submitter_email text not null,
  relationship text,
  attestation text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. CLIPPINGS
-- ============================================================
create table if not exists public.clippings (
  id uuid primary key default gen_random_uuid(),
  town text not null references public.towns(slug),
  image_url text not null,
  paper_name text,
  date_label text,
  submitter_name text,            -- shown as credit
  description text,
  transcription text,
  transcription_status text not null default 'uploaded'
    check (transcription_status in ('uploaded','transcribed','checked','published')),
  extracted_facts jsonb not null default '{}',
  proposed_item jsonb,
  proposed_item_status text not null default 'none'
    check (proposed_item_status in ('none','pending','approved','declined')),
  moderation text not null default 'pending'
    check (moderation in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);
create index if not exists clippings_town_idx on public.clippings (town);

-- FIX: submitter email moved out of the publicly readable table.
create table if not exists public.clipping_contacts (
  clipping_id uuid primary key references public.clippings(id) on delete cascade,
  submitter_email text not null
);

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- (policies are dropped first so this file can be re-run)
-- ============================================================
alter table public.cemeteries           enable row level security;
alter table public.memorials            enable row level security;
alter table public.memorial_submissions enable row level security;   -- no policies = no public access
alter table public.clippings            enable row level security;
alter table public.clipping_contacts    enable row level security;   -- no policies = no public access

drop policy if exists "public read" on public.cemeteries;
create policy "public read" on public.cemeteries for select using (true);

drop policy if exists "public read published" on public.memorials;
create policy "public read published" on public.memorials for select using (status = 'published');

-- DECISION: the brief's policy only showed 'published' clippings, which meant the
-- "AI transcription — not yet verified" label could never appear. A clipping a moderator
-- has APPROVED is now public from 'transcribed' onward, carrying that label until 'checked'.
-- To go back to the stricter rule, change the list to ('published').
drop policy if exists "public read published" on public.clippings;
drop policy if exists "public read approved" on public.clippings;
create policy "public read approved" on public.clippings for select
  using (moderation = 'approved' and transcription_status in ('transcribed','checked','published'));

-- Public submissions go only through the two functions below (no direct insert policies),
-- so status, tier and moderation can't be forged by a visitor.

-- ============================================================
-- 5. SUBMISSION FUNCTIONS (called from the site with the public key)
-- ============================================================
create or replace function public.submit_memorial(
  p_town text, p_cemetery_id text, p_name text, p_maiden_name text,
  p_birth_date_label text, p_birth_place text, p_death_date_label text, p_death_place text,
  p_note text, p_submitter_name text, p_submitter_email text, p_relationship text,
  p_attestation text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  v_cem text := nullif(trim(p_cemetery_id), '');
  v_cem_name text;
  nz text := '';
begin
  if not exists (select 1 from towns where slug = p_town and not hidden) then
    return json_build_object('ok', false, 'error', 'Unknown town.');
  end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_submitter_name),'') = ''
     or coalesce(trim(p_submitter_email),'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(trim(p_attestation),'') = '' then
    return json_build_object('ok', false, 'error', 'Please fill in the name, your name, a valid email, and the source.');
  end if;
  if v_cem is not null then
    select name into v_cem_name from cemeteries where id = v_cem and town = p_town;
    if v_cem_name is null then v_cem := null; end if;   -- "not sure" or a bad id
  end if;

  -- Block an exact duplicate: same name + same birth and death labels in the same cemetery
  -- (checked against published AND pending entries).
  if exists (
    select 1 from memorials m
    where m.town = p_town and m.status in ('published','pending')
      and lower(trim(m.name)) = lower(trim(p_name))
      and coalesce(trim(m.birth_date_label), nz) = coalesce(trim(p_birth_date_label), nz)
      and coalesce(trim(m.death_date_label), nz) = coalesce(trim(p_death_date_label), nz)
      and coalesce(m.cemetery_id, nz) = coalesce(v_cem, nz)
  ) then
    return json_build_object('ok', false, 'duplicate', true,
      'error', 'This person is already listed (or waiting for review) with the same dates in this cemetery.');
  end if;

  v_id := 'm-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  insert into memorials (id, town, cemetery_id, cemetery_name, name, maiden_name,
    birth_date_label, birth_place, death_date_label, death_place, note,
    tier, source, status)
  values (v_id, p_town, v_cem, v_cem_name, left(trim(p_name),200), nullif(left(trim(p_maiden_name),200),''),
    nullif(left(trim(p_birth_date_label),60),''), nullif(left(trim(p_birth_place),200),''),
    nullif(left(trim(p_death_date_label),60),''), nullif(left(trim(p_death_place),200),''),
    nullif(left(trim(p_note),1500),''),
    'community',                                   -- moderator can upgrade to 'documented'
    'Submitted by ' || left(trim(p_submitter_name),120)
      || coalesce(' (' || nullif(left(trim(p_relationship),80),'') || ')', '')
      || ' — ' || left(trim(p_attestation),500),
    'pending');

  insert into memorial_submissions (memorial_id, submitter_name, submitter_email, relationship, attestation)
  values (v_id, left(trim(p_submitter_name),120), lower(left(trim(p_submitter_email),200)),
          nullif(left(trim(p_relationship),80),''), left(trim(p_attestation),500));

  return json_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.submit_clipping(
  p_town text, p_image_url text, p_paper_name text, p_date_label text,
  p_description text, p_submitter_name text, p_submitter_email text
) returns json
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from towns where slug = p_town and not hidden) then
    return json_build_object('ok', false, 'error', 'Unknown town.');
  end if;
  -- Only accept images that were uploaded to our own clippings bucket.
  if coalesce(p_image_url,'') !~ '^https://zpqwrzsgpwwjrlbnfynn\.supabase\.co/storage/v1/object/public/clippings/' then
    return json_build_object('ok', false, 'error', 'Please attach a photo or scan of the clipping.');
  end if;
  insert into clippings (town, image_url, paper_name, date_label, description, submitter_name)
  values (p_town, p_image_url,
    nullif(left(trim(p_paper_name),200),''), nullif(left(trim(p_date_label),60),''),
    nullif(left(trim(p_description),2000),''), nullif(left(trim(p_submitter_name),120),''))
  returning id into v_id;
  if coalesce(trim(p_submitter_email),'') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    insert into clipping_contacts (clipping_id, submitter_email) values (v_id, lower(trim(p_submitter_email)));
  end if;
  return json_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.submit_memorial(text,text,text,text,text,text,text,text,text,text,text,text,text) from public;
revoke all on function public.submit_clipping(text,text,text,text,text,text,text) from public;
grant execute on function public.submit_memorial(text,text,text,text,text,text,text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.submit_clipping(text,text,text,text,text,text,text) to anon, authenticated;

-- ============================================================
-- 6. STORAGE: clippings bucket (images only, 15 MB max)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clippings', 'clippings', true, 15728640,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','image/tiff'])
on conflict (id) do update set
  public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "clippings upload" on storage.objects;
create policy "clippings upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'clippings');
-- (Public bucket: images are readable by URL. No update/delete for the public.)

-- ============================================================
-- 7. PROVINCES (content for /province/<name> pages, supplied later)
-- Every topic must carry a source; topics without one are not shown.
-- topics: [{"title":"","body":"","source":"","source_url":""}]
-- ============================================================
create table if not exists public.provinces (
  code text primary key check (code in ('SK','MB','AB','BC','ON','QC','NB','NS','PE','NL','YT','NT','NU')),
  overview text,
  overview_source text,
  overview_source_url text,
  topics jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.provinces enable row level security;
drop policy if exists "public read" on public.provinces;
create policy "public read" on public.provinces for select using (true);

commit;
