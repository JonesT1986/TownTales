-- Remembrance pages no longer load every name (Nov 23 2026). Applied as migration remembrance_sample_search_2026_11_23.
-- Read-only, security invoker: the existing "public read published" policy still decides what is visible.
create or replace function public.memorials_sample(p_town text, p_n int default 20, p_cem text default null)
returns setof jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('id', id, 'name', name, 'maiden_name', maiden_name, 'birth_date_label', birth_date_label,
    'death_date_label', death_date_label, 'cemetery_id', cemetery_id, 'cemetery_name', cemetery_name, 'tier', tier)
  from memorials
  where town = p_town and status = 'published' and (p_cem is null or p_cem = '' or cemetery_id = p_cem)
  order by random()
  limit least(greatest(coalesce(p_n, 20), 1), 50)
$$;
create or replace function public.memorials_summary(p_town text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from memorials where town = p_town and status = 'published'),
    'by_cemetery', coalesce((select jsonb_object_agg(coalesce(cemetery_id, ''), n) from (
        select cemetery_id, count(*) n from memorials where town = p_town and status = 'published' group by cemetery_id) x), '{}'::jsonb))
$$;
create or replace function public.memorials_search(p_town text, p_q text default '', p_cem text default null, p_limit int default 100)
returns jsonb language sql stable security invoker set search_path = public as $$
  with hits as (
    select id, name, maiden_name, birth_date_label, death_date_label, cemetery_id, cemetery_name, tier
    from memorials
    where town = p_town and status = 'published'
      and (p_cem is null or p_cem = '' or cemetery_id = p_cem)
      and (coalesce(trim(p_q), '') = '' or (name || ' ' || coalesce(maiden_name, '')) ilike '%' || trim(p_q) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'rows', coalesce((select jsonb_agg(to_jsonb(h)) from (select * from hits order by name limit least(greatest(coalesce(p_limit, 100), 1), 300)) h), '[]'::jsonb))
$$;
grant execute on function public.memorials_sample(text, int, text) to anon, authenticated;
grant execute on function public.memorials_summary(text) to anon, authenticated;
grant execute on function public.memorials_search(text, text, text, int) to anon, authenticated;
