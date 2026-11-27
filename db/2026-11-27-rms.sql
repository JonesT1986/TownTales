-- Nov 27 2026: Rural Municipalities (RMs) on TownTales.
-- History only: what the RM was, the towns, hamlets, ghost towns, school districts and cemeteries in it,
-- and history that covers the whole district. Nothing about how the RM runs today.
--
-- Run this in the Supabase SQL editor BEFORE deploying the rm-pages branch. Safe to run twice.
-- Until RMs are loaded, every new piece hides itself (no RM pages, no "Part of the RM" links).

-- 1. The RMs themselves. Loaded by Travis's assistant (CSV import, see rm-data/README.md).
create table if not exists public.rms (
  slug text primary key check (slug ~ '^[a-z0-9-]+-(sk|mb|ab|bc|on|qc|nb|ns|pe|nl|yt|nt|nu)$'),
  name text not null,                       -- "Martin"
  number integer,                           -- 122 (Saskatchewan RMs are numbered); empty elsewhere
  prov text not null check (prov in ('SK','MB','AB','BC','ON','QC','NB','NS','PE','NL','YT','NT','NU')),
  kind_label text not null default 'Rural Municipality', -- or 'County', 'Municipal District', 'Township' …
  full_name text,                           -- optional override for how the name reads, e.g. "County of Vermilion River"
  office_town text references public.towns(slug) on delete set null, -- where the RM office was / is
  est text,                                 -- 4-digit year it was formed, e.g. "1913"
  est_label text,                           -- how the date reads, e.g. "January 13, 1913"
  intro text,                               -- short history of the RM; only shown when intro_source is filled
  intro_source text,
  intro_source_url text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.rms enable row level security;
drop policy if exists "rms public read" on public.rms;
create policy "rms public read" on public.rms for select using (not hidden);
grant select on public.rms to anon, authenticated;

-- 2. Which RM each town is in. Only the assistant / admin sets this.
alter table public.towns add column if not exists rm text references public.rms(slug) on delete set null;
create index if not exists towns_rm_idx on public.towns (rm);
-- towns uses column-level SELECT grants: without this, the public can't read the new column.
grant select (rm) on public.towns to anon, authenticated;
-- The public can add towns, but must not be able to put a town into an RM.
create or replace function public.towns_rm_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then new.rm := null;
    elsif new.rm is distinct from old.rm then new.rm := old.rm;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists towns_rm_guard on public.towns;
create trigger towns_rm_guard before insert or update on public.towns for each row execute function public.towns_rm_guard();

-- 3. Places inside an RM that don't have (or don't need) their own town page:
--    hamlets, ghost towns, country school districts, rural cemeteries, churches, post offices.
create table if not exists public.rm_places (
  id uuid primary key default gen_random_uuid(),
  rm text not null references public.rms(slug) on delete cascade,
  kind text not null check (kind in ('hamlet','ghost_town','school','cemetery','church','post_office','other')),
  name text not null,
  years_label text,                         -- e.g. "1905–1962"
  location_desc text,                       -- e.g. "8 km north of Wapella"
  note text,
  town text references public.towns(slug) on delete set null, -- when it also has its own TownTales page
  tier text not null default 'documented' check (tier in ('documented','community')),
  source text not null,
  source_url text,
  status text not null default 'published' check (status in ('published','hidden')),
  sort integer not null default 0,
  external_id text unique,                  -- the assistant's own id, so re-imports update instead of duplicating
  created_at timestamptz not null default now()
);
create index if not exists rm_places_rm_idx on public.rm_places (rm, kind, sort, name);
alter table public.rm_places enable row level security;
drop policy if exists "rm_places public read" on public.rm_places;
create policy "rm_places public read" on public.rm_places for select using (status = 'published');
grant select on public.rm_places to anon, authenticated;

-- 4. Uploads that cover the whole RM / district, not just the one town picked on the form.
--    They still live in that town's archive (and timeline); the RM page gathers them up.
alter table public.items add column if not exists scope text not null default 'town';
do $$ begin
  alter table public.items add constraint items_scope_chk check (scope in ('town','rm'));
exception when duplicate_object then null; end $$;
-- items uses column-level grants: the public may read scope and set it on a new upload.
grant select (scope), insert (scope) on public.items to anon, authenticated;
create index if not exists items_scope_idx on public.items (scope) where scope = 'rm';

-- 5. "Request the RM book" sign-ups. Separate from book_interest (that one must point at a town).
create table if not exists public.rm_book_interest (
  id uuid primary key default gen_random_uuid(),
  rm text not null references public.rms(slug) on delete cascade,
  name text not null,
  email text not null,
  format text not null default 'unsure' check (format in ('digital','print','both','unsure')),
  copies integer not null default 1 check (copies between 1 and 20),
  updates_ok boolean not null default true,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unsub_token uuid not null default gen_random_uuid()
);
alter table public.rm_book_interest enable row level security;
drop policy if exists "rm_book_interest add" on public.rm_book_interest;
create policy "rm_book_interest add" on public.rm_book_interest for insert to anon, authenticated
  with check (exists (select 1 from public.rms r where r.slug = rm and not r.hidden) and length(name) <= 120 and length(email) <= 200);
grant insert (rm, name, email, format, copies, updates_ok) on public.rm_book_interest to anon, authenticated;
-- No public read: emails stay private. The admin waitlist reads it with the service key.

-- 6. Loading helper: import a CSV (town, rm) into rm_town_links and each town's rm is set automatically.
--    Re-importing a row with a different rm moves the town. Deleting a row takes the town out of the RM.
create table if not exists public.rm_town_links (
  town text primary key references public.towns(slug) on delete cascade,
  rm text not null references public.rms(slug) on delete cascade
);
alter table public.rm_town_links enable row level security; -- no policies: not readable or writable by the public
create or replace function public.rm_town_links_apply() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    update public.towns set rm = null where slug = old.town and rm = old.rm;
    return old;
  end if;
  update public.towns set rm = new.rm where slug = new.town;
  return new;
end $$;
drop trigger if exists rm_town_links_apply on public.rm_town_links;
create trigger rm_town_links_apply after insert or update or delete on public.rm_town_links
  for each row execute function public.rm_town_links_apply();
