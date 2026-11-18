-- Log of web pages the AI has read for facts. Used for the daily cap and to skip pages already read.
-- Service role only (RLS on, no policies).
create table if not exists public.link_reads (
  id bigint generated always as identity primary key,
  town text not null references public.towns(slug) on delete cascade,
  url text not null,
  item_id uuid,                -- the visitor's "link" item, when it came from the Share form
  status text not null default 'done' check (status in ('done','failed','skipped')),
  facts int not null default 0,
  note text not null default '',
  at timestamptz not null default now()
);
create index if not exists link_reads_at on public.link_reads (at);
create index if not exists link_reads_town_url on public.link_reads (town, url);
alter table public.link_reads enable row level security;
