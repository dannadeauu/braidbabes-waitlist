-- ---------------------------------------------------------------------------
-- braidbabes waitlist — Supabase schema
-- Paste this whole file into the Supabase SQL editor and run it once.
-- ---------------------------------------------------------------------------

create table if not exists waitlist_settings (
  id             int primary key default 1,
  event_name     text        not null default '',
  braiders       int,                                  -- null / blank means 1
  services       jsonb       not null default '[]'::jsonb,
  allow_multiple boolean     not null default false,
  show_time      boolean     not null default true,
  show_place     boolean     not null default false,
  status         text        not null default 'open',
  constraint waitlist_settings_singleton check (id = 1)
);

create table if not exists waitlist_entries (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  phone       text        not null default '',
  service_ids jsonb       not null default '[]'::jsonb,
  joined_at   timestamptz not null default now(),
  notified_at timestamptz
);

create index if not exists waitlist_entries_joined_at_idx
  on waitlist_entries (joined_at);

-- Seed the single settings row with the two services from the mockup.
insert into waitlist_settings (id, services)
values (
  1,
  '[{"id":"braid","name":"braid service","minutes":15,"visible":true},
    {"id":"tinsel","name":"tinsel service","minutes":15,"visible":true}]'::jsonb
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security.
--
-- Both apps talk to Supabase with the public anon key, so these policies are
-- what actually decides who can do what. As written, anyone with the URL can
-- read the queue and add themselves — which is the point of a QR-code waitlist.
--
-- Note the tradeoff: the anon key also permits delete and settings updates, so
-- the "braidbabes" password is a convenience lock on the UI, not a real
-- boundary. Fine for a one-day event; see the README for how to tighten it.
-- ---------------------------------------------------------------------------

alter table waitlist_settings enable row level security;
alter table waitlist_entries  enable row level security;

drop policy if exists "settings readable"  on waitlist_settings;
drop policy if exists "settings writable"  on waitlist_settings;
drop policy if exists "entries readable"   on waitlist_entries;
drop policy if exists "entries insertable" on waitlist_entries;
drop policy if exists "entries updatable"  on waitlist_entries;
drop policy if exists "entries deletable"  on waitlist_entries;

create policy "settings readable"  on waitlist_settings for select using (true);
create policy "settings writable"  on waitlist_settings for all    using (true) with check (true);

create policy "entries readable"   on waitlist_entries for select using (true);
create policy "entries insertable" on waitlist_entries for insert with check (true);
create policy "entries updatable"  on waitlist_entries for update using (true) with check (true);
create policy "entries deletable"  on waitlist_entries for delete using (true);

-- Live updates, so the admin queue moves without waiting for the poll.
-- Guarded so this whole file stays safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'waitlist_entries'
  ) then
    alter publication supabase_realtime add table waitlist_entries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'waitlist_settings'
  ) then
    alter publication supabase_realtime add table waitlist_settings;
  end if;
end $$;
