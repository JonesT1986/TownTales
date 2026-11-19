-- Nov 19 2026: resolvable problem reports, admin settings (auto-approve link-reader facts),
-- debounced timeline rebuilds for auto-approved facts, and a digest that matches what it lists.
-- Safe to run more than once.

-- 1. Problem reports get a resolved date. "done" stays the open/closed flag the digest already uses.
alter table public.reports add column if not exists resolved_at timestamptz;
update public.reports set resolved_at = coalesce(resolved_at, created_at) where done and resolved_at is null;

-- 2. Admin settings (service role only: RLS on, no policies).
create table if not exists public.admin_settings (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.admin_settings enable row level security;
insert into public.admin_settings (k, v) values ('auto_approve_link_reader', 'false'::jsonb) on conflict (k) do nothing;

-- 3. Auto-approve: link-reader facts (not visitor links) that carry a real source page are published on arrival
--    when the setting is on. Covers both the admin "Read links with AI" tool and the weekly n8n link reader.
create or replace function public.items_auto_approve() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending'
     and coalesce(new.external_id, '') like 'link:%'
     and new.origin = 'muse'
     and coalesce(new.source_url, '') ~* '^https?://'
     and coalesce(new.source, '') <> ''
     and coalesce((select v from public.admin_settings where k = 'auto_approve_link_reader'), 'false'::jsonb) = 'true'::jsonb
  then
    new.status := 'published';
  end if;
  return new;
end $$;
drop trigger if exists items_auto_approve on public.items;
create trigger items_auto_approve before insert on public.items for each row execute function public.items_auto_approve();

-- 4. Rebuild a town's timeline after auto-approved facts land (debounced by the 5-minute sweep).
alter table public.towns add column if not exists rebuild_due_at timestamptz;
create or replace function public.items_mark_rebuild() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.towns set rebuild_due_at = now() where slug = new.town;
  return null;
end $$;
drop trigger if exists items_mark_rebuild on public.items;
create trigger items_mark_rebuild after insert on public.items for each row
  when (new.status = 'published' and new.external_id like 'link:%') execute function public.items_mark_rebuild();

create or replace function public.towns_research_sweep()
 returns void language plpgsql security definer set search_path to 'public', 'net' as $function$
declare r record;
begin
  update public.towns set research_status = 'queued' where research_status = 'running' and research_at < now() - interval '8 minutes';
  update public.towns set contact_status = 'queued' where contact_status = 'running' and contact_checked_at < now() - interval '8 minutes';
  for r in select slug from public.towns where research_status = 'queued' and created_at < now() - interval '2 minutes' limit 10 loop
    perform net.http_post(url := 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/functions/v1/api/research',
      body := jsonb_build_object('slug', r.slug), headers := '{"Content-Type":"application/json"}'::jsonb);
  end loop;
  for r in select slug from public.towns where contact_status = 'queued' and created_at < now() - interval '2 minutes' limit 10 loop
    perform net.http_post(url := 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/functions/v1/api/contact',
      body := jsonb_build_object('slug', r.slug), headers := '{"Content-Type":"application/json"}'::jsonb);
  end loop;
  -- Nov 19 2026: timelines waiting on auto-approved link-reader facts (quiet for 3 minutes first)
  for r in select slug from public.towns where rebuild_due_at is not null and rebuild_due_at < now() - interval '3 minutes' limit 5 loop
    perform net.http_post(url := 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/functions/v1/api/rebuild-due',
      body := jsonb_build_object('slug', r.slug), headers := '{"Content-Type":"application/json"}'::jsonb);
  end loop;
end $function$;

-- 5. Digest: ids for direct admin links, and the full waiting list (not just the last 24 hours),
--    so the email's subject count can equal what the email lists.
create or replace function public.tt_digest(p_key text, p_hours integer default 24)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare since timestamptz := now() - make_interval(hours => greatest(1, least(p_hours, 720))); out jsonb; new_big jsonb;
begin
  perform ttauto.ok(p_key);
  with c as (select town, count(*) n, sum(copies) copies from public.book_interest group by town having count(*) >= 10),
  ins as (insert into ttauto.alerts (kind, ref) select 'waitlist10', town from c on conflict do nothing returning ref)
  select coalesce(jsonb_agg(jsonb_build_object('town', c.town, 'name', t.name, 'people', c.n, 'copies', c.copies)), '[]') into new_big
  from c join ins on ins.ref = c.town left join public.towns t on t.slug = c.town;

  select jsonb_build_object(
    'since', since,
    'new_items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'town', i.town, 'kind', i.kind, 'title', i.title, 'by', i.contributor, 'origin', i.origin) order by i.created_at), '[]')
                  from public.items i where i.status = 'pending' and i.created_at >= since),
    'items_waiting', (select count(*) from public.items where status = 'pending'),
    'items_waiting_list', (select coalesce(jsonb_agg(x order by x->>'at'), '[]') from (
                  select jsonb_build_object('id', i.id, 'town', i.town, 'town_name', t.name, 'kind', i.kind, 'title', i.title, 'by', i.contributor,
                    'source', case when coalesce(i.external_id, '') like 'link:%' and i.origin = 'muse' then 'link_reader'
                                   when coalesce(i.external_id, '') like 'auto:%' then 'research'
                                   when i.origin = 'community' then 'visitor' else 'other' end,
                    'new', i.created_at >= since, 'at', i.created_at) x
                  from public.items i left join public.towns t on t.slug = i.town where i.status = 'pending' order by i.created_at limit 300) s),
    'memorials_new', (select coalesce(jsonb_agg(jsonb_build_object('town', m.town, 'name', m.name, 'by', s.submitter_name)), '[]')
                      from public.memorials m left join public.memorial_submissions s on s.memorial_id = m.id where m.status = 'pending' and m.created_at >= since),
    'memorials_waiting', (select count(*) from public.memorials where status = 'pending'),
    'clippings_waiting', (select count(*) from public.clippings where moderation = 'pending' or proposed_item_status = 'pending'),
    'book_requests_new', (select coalesce(jsonb_agg(jsonb_build_object('town', b.town, 'name', b.name, 'email', b.email, 'format', b.format, 'copies', b.copies) order by b.created_at), '[]')
                          from public.book_interest b where b.created_at >= since),
    'waitlist_totals', (select coalesce(jsonb_agg(jsonb_build_object('town', x.town, 'people', x.n) order by x.n desc), '[]')
                        from (select town, count(*) n from public.book_interest group by town) x),
    'waitlist_reached_10', new_big,
    'reports_open', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'what', r.what, 'text', r.text, 'name', r.name, 'email', r.email, 'at', r.created_at) order by r.created_at), '[]')
                     from public.reports r where not coalesce(r.done, false)),
    'visitor_links_waiting', (select count(*) from public.items i where i.kind = 'link' and i.origin = 'community' and i.status = 'pending' and coalesce(i.source_url, '') <> ''
                              and not exists (select 1 from public.link_reads l where l.item_id = i.id)),
    'towns_added', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'prov', prov, 'research', research_status)), '[]')
                    from public.towns where created_at >= since),
    'research_needs_look', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'status', research_status, 'note', research_note)), '[]')
                            from public.towns where research_status in ('needs_review', 'failed') and research_at >= since),
    'auto_approve_link_reader', coalesce((select v from public.admin_settings where k = 'auto_approve_link_reader'), 'false'::jsonb)
  ) into out;
  return out;
end $function$;
