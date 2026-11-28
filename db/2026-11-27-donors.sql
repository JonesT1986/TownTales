-- Nov 27, 2026 — Donors: "Friends of <town>" blocks and the /donors page.
-- A name is public only if the donor typed one at checkout AND the admin approved it. Amounts and emails are never public.
-- Additive only; safe to run twice.
begin;

create table if not exists public.donors (
  id uuid primary key default gen_random_uuid(),
  town text references public.towns(slug) on update cascade on delete set null,  -- null = general supporter
  display_name text,
  dedication text,
  status text not null default 'pending' check (status in ('pending','published','hidden','anonymous')),
  monthly boolean not null default false,
  monthly_active boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists donors_town_idx on public.donors (town) where status = 'published';
create index if not exists donors_status_idx on public.donors (status, created_at desc);

-- Payment details: no public access at all.
create table if not exists public.donor_payments (
  donor_id uuid primary key references public.donors(id) on delete cascade,
  stripe_session_id text unique,
  stripe_subscription_id text,
  donor_email text,
  payer_name text,
  amount_cents integer,
  currency text
);
create index if not exists donor_payments_sub_idx on public.donor_payments (stripe_subscription_id);

alter table public.donors enable row level security;
alter table public.donor_payments enable row level security;
revoke all on public.donors from anon, authenticated;
revoke all on public.donor_payments from anon, authenticated;
grant select (id, town, display_name, dedication, monthly, monthly_active, status, created_at) on public.donors to anon, authenticated;
drop policy if exists "public read published" on public.donors;
create policy "public read published" on public.donors for select using (status = 'published');

-- Records one paid checkout. Stripe may send the same event more than once, so the session id is checked first.
create or replace function public.record_donation(
  p_session text, p_subscription text, p_town text, p_name text, p_dedication text,
  p_email text, p_payer text, p_amount integer, p_currency text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_town text;
  v_name text := nullif(left(trim(coalesce(p_name,'')), 80), '');
  v_ded text := nullif(left(trim(coalesce(p_dedication,'')), 140), '');
begin
  perform pg_advisory_xact_lock(hashtext(p_session));
  select donor_id into v_id from donor_payments where stripe_session_id = p_session;
  if v_id is not null then return v_id; end if;
  select slug into v_town from towns where slug = p_town;
  insert into donors (town, display_name, dedication, status, monthly, monthly_active)
  values (v_town, v_name, v_ded,
          case when v_name is null and v_ded is null then 'anonymous' else 'pending' end,
          p_subscription is not null, p_subscription is not null)
  returning id into v_id;
  insert into donor_payments (donor_id, stripe_session_id, stripe_subscription_id, donor_email, payer_name, amount_cents, currency)
  values (v_id, p_session, p_subscription, p_email, p_payer, p_amount, p_currency);
  return v_id;
end $$;
revoke all on function public.record_donation(text,text,text,text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.record_donation(text,text,text,text,text,text,text,integer,text) to service_role;

commit;
