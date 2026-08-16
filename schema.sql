-- ---------------------------------------------------------------------------
-- braidbabes waitlist — Supabase schema
--
-- Paste this whole file into the Supabase SQL editor and run it. It is safe to
-- re-run, and safe to run over the earlier open-access version of this schema.
--
-- Security model:
--   * guests are anonymous. They can join and leave, and can see how long the
--     queue is — but they can NOT read anyone's name or phone number.
--   * admins sign in with Google. Only addresses listed in `admin_emails` count
--     as admins, and that is enforced here in the database, not in the app.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Tables
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

-- Who is allowed into the admin app.
create table if not exists admin_emails (
  email    text primary key,
  added_at timestamptz not null default now(),
  added_by text
);

-- Seed the settings row with the two services from the mockup.
insert into waitlist_settings (id, services)
values (
  1,
  '[{"id":"braid","name":"braid service","minutes":15,"visible":true},
    {"id":"tinsel","name":"tinsel service","minutes":15,"visible":true}]'::jsonb
)
on conflict (id) do nothing;

-- The first admin. Everyone else gets added from the settings screen.
insert into admin_emails (email) values ('daniellenadeau42@gmail.com')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- is_admin()
--
-- SECURITY DEFINER matters here: it lets this function read admin_emails
-- without going through that table's own RLS policy, which would otherwise
-- recurse infinitely (policy calls is_admin, is_admin reads the table, ...).
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_emails
    where lower(email) = lower(coalesce(nullif(auth.jwt() ->> 'email', ''), '~none~'))
  );
$$;

-- ---------------------------------------------------------------------------
-- Guest-facing functions
--
-- Guests never touch waitlist_entries directly. These three functions are the
-- only way in, and none of them return a name or a phone number.
-- ---------------------------------------------------------------------------

-- Enough to compute wait times and place in line. No personal data.
create or replace function public.queue_summary()
returns table (id uuid, service_ids jsonb, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.service_ids, e.joined_at
  from public.waitlist_entries e
  order by e.joined_at asc;
$$;

create or replace function public.join_waitlist(
  p_name       text,
  p_phone      text,
  p_service_ids jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id  uuid;
  is_open boolean;
begin
  select (status = 'open') into is_open from public.waitlist_settings where id = 1;
  if not coalesce(is_open, true) then
    raise exception 'the waitlist is closed';
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'name is required';
  end if;

  insert into public.waitlist_entries (name, phone, service_ids)
  values (
    left(btrim(p_name), 60),
    left(coalesce(btrim(p_phone), ''), 20),
    coalesce(p_service_ids, '[]'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- A guest can remove themselves. They only ever know their own row's uuid,
-- and queue_summary is the only way to see ids at all.
create or replace function public.leave_waitlist(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.waitlist_entries where id = p_id;
$$;

grant execute on function public.is_admin()                        to anon, authenticated;
grant execute on function public.queue_summary()                   to anon, authenticated;
grant execute on function public.join_waitlist(text, text, jsonb)  to anon, authenticated;
grant execute on function public.leave_waitlist(uuid)              to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Don't let the last admin lock themselves out.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.admin_emails) <= 1 then
    raise exception 'cannot remove the last admin';
  end if;
  return old;
end;
$$;

drop trigger if exists admin_emails_keep_one on admin_emails;
create trigger admin_emails_keep_one
  before delete on admin_emails
  for each row execute function public.prevent_last_admin_removal();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table waitlist_settings enable row level security;
alter table waitlist_entries  enable row level security;
alter table admin_emails      enable row level security;

-- Old wide-open policies from the first version of this file.
drop policy if exists "settings readable"  on waitlist_settings;
drop policy if exists "settings writable"  on waitlist_settings;
drop policy if exists "entries readable"   on waitlist_entries;
drop policy if exists "entries insertable" on waitlist_entries;
drop policy if exists "entries updatable"  on waitlist_entries;
drop policy if exists "entries deletable"  on waitlist_entries;

drop policy if exists "settings public read"  on waitlist_settings;
drop policy if exists "settings admin write"  on waitlist_settings;
drop policy if exists "entries admin read"    on waitlist_entries;
drop policy if exists "entries admin update"  on waitlist_entries;
drop policy if exists "entries admin delete"  on waitlist_entries;
drop policy if exists "admin emails read"     on admin_emails;
drop policy if exists "admin emails write"    on admin_emails;

-- Settings hold no personal data and the join page needs them before anyone
-- signs in, so they stay world-readable. Only admins can change them.
create policy "settings public read" on waitlist_settings
  for select using (true);
create policy "settings admin write" on waitlist_settings
  for all using (is_admin()) with check (is_admin());

-- Entries are admin-only. Guests reach them exclusively through the functions
-- above, so names and phone numbers never leave the database.
create policy "entries admin read" on waitlist_entries
  for select using (is_admin());
create policy "entries admin update" on waitlist_entries
  for update using (is_admin()) with check (is_admin());
create policy "entries admin delete" on waitlist_entries
  for delete using (is_admin());

-- The allowlist itself is visible and editable only to people already on it.
create policy "admin emails read" on admin_emails
  for select using (is_admin());
create policy "admin emails write" on admin_emails
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Live updates, so the admin queue moves without waiting for the poll.
-- Guarded so this file stays safe to re-run.
-- ---------------------------------------------------------------------------

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
