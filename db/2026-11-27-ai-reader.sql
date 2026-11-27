-- Nov 27 2026: AI reader (OpenRouter).
--   1. Reads pictures as they arrive: shared photos, newspaper clippings, gravestone/memorial photos,
--      and every page of a whole-book upload. Copies the writing exactly, describes photos, and
--      translates what it read into English and French.
--   2. Book updates: once a day, for every town with a finished book, the AI drafts new paragraphs from
--      history added since the book's last revision. Travis approves in #admin; then the revision number goes up.
-- Run in the Supabase SQL editor BEFORE deploying the ai-reader edge function. Safe to run twice.
-- Nothing here is public: every table is private (admin reads it through the ai-reader function).

-- 1. One row per picture to read. Filled by triggers below; worked through by the ai-reader function.
create table if not exists public.ai_reads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('photo','clipping','memorial_photo','book_page')),
  ref_id text not null,                 -- items.id / clippings.id / memorial_photos.id / '<upload id>/<file>'
  town text,
  image_url text,                       -- public pictures
  storage_path text,                    -- private book pages (bucket book-pages)
  status text not null default 'queued' check (status in ('queued','running','done','failed','skipped')),
  tries integer not null default 0,
  error text,
  lang text,                            -- language of the writing: en, fr, de, uk …
  text_original text,                   -- the writing, copied exactly
  text_en text,
  text_fr text,
  description_en text,                  -- what the picture shows (photos)
  description_fr text,
  fields jsonb not null default '{}',   -- headline/paper/date (clippings), names/dates (gravestones)
  applied boolean not null default false, -- result written back into the clipping / photo / memorial photo
  model text,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  done_at timestamptz,
  unique (kind, ref_id)
);
create index if not exists ai_reads_queue_idx on public.ai_reads (status, created_at);
alter table public.ai_reads enable row level security;          -- no policies: private
revoke all on public.ai_reads from anon, authenticated;

-- 2. AI-drafted additions for the next revision of a town's book. Travis approves or rejects.
create table if not exists public.book_drafts (
  id uuid primary key default gen_random_uuid(),
  town text not null references public.towns(slug) on delete cascade,
  base_revision integer not null,
  item_ids uuid[] not null default '{}', -- the new archive items this draft covers (never drafted twice)
  memorial_count integer not null default 0,
  draft text not null,                   -- Markdown, every paragraph ends with its source
  summary text,                          -- one line: what's new
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  model text,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists book_drafts_town_idx on public.book_drafts (town, created_at desc);
alter table public.book_drafts enable row level security;       -- no policies: private
revoke all on public.book_drafts from anon, authenticated;

-- 3. Queue new pictures as they arrive.
create or replace function public.ai_enqueue() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'items' then
    if new.kind = 'photo' and coalesce(new.image_url, '') ~* '^https?://' then
      insert into ai_reads (kind, ref_id, town, image_url) values ('photo', new.id::text, new.town, new.image_url) on conflict do nothing;
    end if;
  elsif tg_table_name = 'clippings' then
    if coalesce(new.image_url, '') ~* '^https?://' then
      insert into ai_reads (kind, ref_id, town, image_url) values ('clipping', new.id::text, new.town, new.image_url) on conflict do nothing;
    end if;
  elsif tg_table_name = 'memorial_photos' then
    if coalesce(new.url, '') ~* '^https?://' and new.kind <> 'portrait' then   -- headstones (and 'other'): read the inscription
      insert into ai_reads (kind, ref_id, town, image_url) values ('memorial_photo', new.id::text, new.town, new.url) on conflict do nothing;
    end if;
  elsif tg_table_name = 'book_uploads' then
    -- a whole-book upload just finished: queue every page that was uploaded
    if new.status = 'received' and old.status is distinct from 'received' then
      insert into ai_reads (kind, ref_id, town, storage_path)
      select 'book_page', o.name, new.town, o.name from storage.objects o
      where o.bucket_id = 'book-pages' and o.name like new.id::text || '/%'
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.ai_enqueue() from public, anon, authenticated;

drop trigger if exists ai_enqueue on public.items;
create trigger ai_enqueue after insert on public.items for each row execute function public.ai_enqueue();
drop trigger if exists ai_enqueue on public.clippings;
create trigger ai_enqueue after insert on public.clippings for each row execute function public.ai_enqueue();
drop trigger if exists ai_enqueue on public.memorial_photos;
create trigger ai_enqueue after insert on public.memorial_photos for each row execute function public.ai_enqueue();
drop trigger if exists ai_enqueue on public.book_uploads;
create trigger ai_enqueue after update on public.book_uploads for each row execute function public.ai_enqueue();

-- 4. Pictures already on the site: queue the community photos, clippings and memorial photos (not Muse's).
insert into public.ai_reads (kind, ref_id, town, image_url)
select 'photo', id::text, town, image_url from public.items
where kind = 'photo' and origin = 'community' and coalesce(image_url, '') ~* '^https?://'
on conflict do nothing;
insert into public.ai_reads (kind, ref_id, town, image_url)
select 'clipping', id::text, town, image_url from public.clippings where coalesce(image_url, '') ~* '^https?://'
on conflict do nothing;
insert into public.ai_reads (kind, ref_id, town, image_url)
select 'memorial_photo', id::text, town, url from public.memorial_photos where coalesce(url, '') ~* '^https?://' and kind <> 'portrait'
on conflict do nothing;
insert into public.ai_reads (kind, ref_id, town, storage_path)
select 'book_page', o.name, u.town, o.name from public.book_uploads u
join storage.objects o on o.bucket_id = 'book-pages' and o.name like u.id::text || '/%'
where u.status in ('received','processing','done')
on conflict do nothing;

-- 5. Schedule: read pictures every 2 minutes (only when something is waiting), draft book updates daily.
create or replace function public.ai_reader_tick() returns void language plpgsql security definer set search_path = public, net as $$
begin
  update ai_reads set status = 'queued' where status = 'running' and started_at < now() - interval '10 minutes' and tries < 3;
  update ai_reads set status = 'failed', error = coalesce(error, 'Gave up after 3 tries') where status = 'running' and started_at < now() - interval '10 minutes';
  if exists (select 1 from ai_reads where status = 'queued') then
    perform net.http_post(url := 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/functions/v1/ai-reader',
      body := '{"action":"run"}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
end $$;
revoke all on function public.ai_reader_tick() from public, anon, authenticated;

create or replace function public.ai_book_drafts_tick() returns void language plpgsql security definer set search_path = public, net as $$
begin
  perform net.http_post(url := 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/functions/v1/ai-reader',
    body := '{"action":"drafts"}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb);
end $$;
revoke all on function public.ai_book_drafts_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('ai-reader', 'ai-book-drafts');
    perform cron.schedule('ai-reader', '*/2 * * * *', 'select public.ai_reader_tick()');
    perform cron.schedule('ai-book-drafts', '15 10 * * *', 'select public.ai_book_drafts_tick()');  -- 04:15 Saskatchewan time
  end if;
end $$;
