-- Nov 21, 2026 — Honour Pages (paid upgrade to a remembrance record)
-- Free: every name, dates, cemetery (unchanged).
-- Paid, one-time: photos, a life story, "Placed by …", and a printable certificate on the person's permanent page.
-- Flow: family fills the form → draft row 'awaiting_payment' → Stripe Payment Link (client_reference_id = honour id)
--       → Stripe webhook marks it 'paid' → Travis reviews in #admin → 'published'.
-- Additive only: nothing existing changes.
begin;

create table if not exists public.honour_pages (
  id text primary key,                                   -- 'hp_' + 24 hex; also the Stripe client_reference_id
  memorial_id text not null references public.memorials(id) on delete cascade,
  town text not null references public.towns(slug),
  story text,                                            -- life story, plain text, paragraphs split on blank lines
  photos jsonb not null default '[]',                    -- [{"url": "...honour/...", "caption": "..."}], max 6
  placed_by text,                                        -- shown as "Placed by …"
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','paid','published','declined')),
  comped boolean not null default false,                 -- published free by admin (no payment)
  paid_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists honour_pages_memorial_idx on public.honour_pages (memorial_id);
create index if not exists honour_pages_town_idx on public.honour_pages (town);
create index if not exists honour_pages_status_idx on public.honour_pages (status);
-- One live Honour Page per person.
create unique index if not exists honour_pages_one_published on public.honour_pages (memorial_id) where status = 'published';

-- Purchaser details + payment record: NO public access (no policies).
create table if not exists public.honour_orders (
  honour_id text primary key references public.honour_pages(id) on delete cascade,
  purchaser_name text not null,
  purchaser_email text not null,
  relationship text,
  stripe_session_id text,
  amount_cents integer,
  currency text,
  created_at timestamptz not null default now()
);

alter table public.honour_pages enable row level security;
alter table public.honour_orders enable row level security;
grant select on public.honour_pages to anon, authenticated;
revoke all on public.honour_orders from anon, authenticated;
drop policy if exists "public read published" on public.honour_pages;
create policy "public read published" on public.honour_pages for select using (status = 'published');

-- Who is this form for? Lets the form page work right after a family submits someone (still 'pending').
-- Returns only the name/town/status of a pending or published record, by its random id.
create or replace function public.honour_target(p_id text)
returns json language sql stable security definer set search_path = public as $$
  select coalesce((
    select json_build_object('id', m.id, 'town', m.town, 'name', m.name, 'maiden_name', m.maiden_name,
      'birth_date_label', m.birth_date_label, 'death_date_label', m.death_date_label, 'status', m.status,
      'honoured', exists (select 1 from honour_pages h where h.memorial_id = m.id and h.status = 'published'))
    from memorials m where m.id = p_id and m.status in ('pending','published')
  ), json_build_object('id', null));
$$;

create or replace function public.submit_honour(
  p_memorial_id text, p_story text, p_photos jsonb, p_placed_by text,
  p_purchaser_name text, p_purchaser_email text, p_relationship text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_town text;
  v_id text;
  v_photos jsonb := '[]';
  p jsonb;
begin
  select town into v_town from memorials where id = p_memorial_id and status in ('pending','published');
  if v_town is null then
    return json_build_object('ok', false, 'error', 'We couldn''t find that person. Please go back and try again.');
  end if;
  if exists (select 1 from honour_pages where memorial_id = p_memorial_id and status = 'published') then
    return json_build_object('ok', false, 'error', 'This person already has an Honour Page.');
  end if;
  if coalesce(trim(p_purchaser_name),'') = ''
     or coalesce(trim(p_purchaser_email),'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('ok', false, 'error', 'Please enter your name and a working email address.');
  end if;
  if coalesce(trim(p_story),'') = '' and coalesce(jsonb_array_length(case when jsonb_typeof(p_photos) = 'array' then p_photos end), 0) = 0 then
    return json_build_object('ok', false, 'error', 'Please add their story or at least one photo.');
  end if;
  -- Only photos uploaded to our own honour bucket; max 6.
  if jsonb_typeof(p_photos) = 'array' then
    for p in select value from jsonb_array_elements(p_photos) limit 6 loop
      if coalesce(p->>'url','') ~ '^https://zpqwrzsgpwwjrlbnfynn\.supabase\.co/storage/v1/object/public/honour/' then
        v_photos := v_photos || jsonb_build_array(jsonb_build_object(
          'url', left(p->>'url', 500), 'caption', nullif(left(trim(coalesce(p->>'caption','')), 200), '')));
      end if;
    end loop;
  end if;

  v_id := 'hp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);
  insert into honour_pages (id, memorial_id, town, story, photos, placed_by)
  values (v_id, p_memorial_id, v_town, nullif(left(trim(p_story), 6000), ''), v_photos,
          nullif(left(trim(p_placed_by), 200), ''));
  insert into honour_orders (honour_id, purchaser_name, purchaser_email, relationship)
  values (v_id, left(trim(p_purchaser_name), 120), lower(left(trim(p_purchaser_email), 200)),
          nullif(left(trim(p_relationship), 80), ''));
  return json_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.honour_target(text) from public;
revoke all on function public.submit_honour(text,text,jsonb,text,text,text,text) from public;
grant execute on function public.honour_target(text) to anon, authenticated;
grant execute on function public.submit_honour(text,text,jsonb,text,text,text,text) to anon, authenticated;

-- Photo bucket (images only, 15 MB max, public read by URL, upload-only for the public)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('honour', 'honour', true, 15728640, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set
  public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "honour upload" on storage.objects;
create policy "honour upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'honour');

commit;
