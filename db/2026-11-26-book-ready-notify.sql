-- Applied to Supabase as migration "book_ready_notify" (Nov 26 2026). Kept here for the record.
-- town_books: one row per finished book. book_interest: notified_at + unsub_token. Two public RPCs (counts only / unsubscribe by token).
create table if not exists public.town_books (slug text primary key references public.towns(slug) on delete cascade, pages integer not null check (pages between 24 and 800), title text, ready_at timestamptz not null default now());
alter table public.town_books enable row level security;
create policy town_books_read on public.town_books for select using (true);
grant select on public.town_books to anon, authenticated;
alter table public.book_interest add column if not exists notified_at timestamptz;
alter table public.book_interest add column if not exists unsub_token uuid not null default gen_random_uuid();
create unique index if not exists book_interest_unsub_token_key on public.book_interest(unsub_token);
-- functions book_request_counts() and book_unsubscribe(uuid): see the migration in Supabase (security definer, granted to anon).
