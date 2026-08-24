-- ParisTour: invite-only auth, primary trip archive, email sharing
-- Run in Supabase SQL Editor (or `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Allowlist (invite-only)
-- ---------------------------------------------------------------------------
create table if not exists public.allowlist_emails (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint allowlist_emails_lower check (email = lower(email))
);

alter table public.allowlist_emails enable row level security;

-- Authenticated users may only see whether *their* email is allowlisted.
create policy "allowlist_select_own"
  on public.allowlist_emails
  for select
  to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  allowlisted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists theme_preference text not null default 'system';

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  drop constraint if exists profiles_theme_preference_check;

alter table public.profiles
  add constraint profiles_theme_preference_check
  check (theme_preference in ('light', 'dark', 'system'));

create index if not exists profiles_email_idx on public.profiles (lower(email));

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Trips (is_primary reserves multi-trip upgrade path)
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  is_primary boolean not null default true,
  title text not null default '我的巴黎行程',
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists trips_one_primary_per_owner
  on public.trips (owner_id)
  where (is_primary);

create index if not exists trips_owner_id_idx on public.trips (owner_id);

alter table public.trips add column if not exists hotel jsonb;
alter table public.trips add column if not exists artifacts jsonb not null default '{}'::jsonb;
alter table public.trips add column if not exists artifacts_rev integer not null default 0;

alter table public.trips enable row level security;

-- ---------------------------------------------------------------------------
-- Shares (by invitee email; works before they register)
-- ---------------------------------------------------------------------------
create table if not exists public.trip_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  invitee_email text not null,
  role text not null check (role in ('viewer', 'editor')),
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint trip_shares_email_lower check (invitee_email = lower(invitee_email)),
  constraint trip_shares_unique_invitee unique (trip_id, invitee_email)
);

create index if not exists trip_shares_invitee_email_idx
  on public.trip_shares (invitee_email);

create index if not exists trip_shares_trip_id_idx on public.trip_shares (trip_id);

alter table public.trip_shares enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_allowlisted_email(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowlist_emails a
    where a.email = lower(check_email)
  );
$$;

create or replace function public.user_can_read_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (
        t.owner_id = auth.uid()
        or exists (
          select 1 from public.trip_shares s
          where s.trip_id = t.id
            and s.invitee_email = public.current_user_email()
        )
      )
  );
$$;

create or replace function public.user_can_edit_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (
        t.owner_id = auth.uid()
        or exists (
          select 1 from public.trip_shares s
          where s.trip_id = t.id
            and s.invitee_email = public.current_user_email()
            and s.role = 'editor'
        )
      )
  );
$$;

-- Anon may check a single email (invite gate) without listing the table.
grant execute on function public.is_allowlisted_email(text) to anon, authenticated, service_role;
grant execute on function public.current_user_email() to authenticated;
grant execute on function public.user_can_read_trip(uuid) to authenticated;
grant execute on function public.user_can_edit_trip(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auth signup → profile + allowlisted flag
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text := lower(coalesce(new.email, ''));
  listed boolean;
begin
  listed := public.is_allowlisted_email(user_email);
  insert into public.profiles (id, email, allowlisted)
  values (new.id, user_email, listed)
  on conflict (id) do update
    set email = excluded.email,
        allowlisted = excluded.allowlisted;

  -- Link any pending shares addressed to this email
  update public.trip_shares
  set accepted_by = new.id
  where invitee_email = user_email
    and accepted_by is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep allowlisted in sync if allowlist changes (optional helper)
create or replace function public.refresh_profile_allowlisted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles
    set allowlisted = true
    where lower(email) = new.email;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles
    set allowlisted = false
    where lower(email) = old.email;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_allowlist_changed on public.allowlist_emails;
create trigger on_allowlist_changed
  after insert or delete on public.allowlist_emails
  for each row execute function public.refresh_profile_allowlisted();

-- Touch updated_at on trip writes
create or replace function public.touch_trip_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function public.touch_trip_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer) — avoid trips <-> trip_shares policy recursion
-- ---------------------------------------------------------------------------
create or replace function public.user_owns_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id and t.owner_id = auth.uid()
  );
$$;

create or replace function public.user_has_trip_share(p_trip_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_shares s
    where s.trip_id = p_trip_id
      and s.invitee_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (p_roles is null or s.role = any (p_roles))
  );
$$;

grant execute on function public.user_owns_trip(uuid) to authenticated;
grant execute on function public.user_has_trip_share(uuid, text[]) to authenticated;

create or replace function public.trip_owner_email(p_trip_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.email
  from public.trips t
  join public.profiles p on p.id = t.owner_id
  where t.id = p_trip_id
    and (
      t.owner_id = auth.uid()
      or public.user_has_trip_share(p_trip_id)
    )
  limit 1;
$$;

grant execute on function public.trip_owner_email(uuid) to authenticated;

create or replace function public.email_is_registered(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(trim(check_email))
  );
$$;

revoke all on function public.email_is_registered(text) from public;
grant execute on function public.email_is_registered(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: trips
-- Owner check is direct; share check goes through security definer helper.
-- ---------------------------------------------------------------------------
create policy "trips_select_owner_or_share"
  on public.trips
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.user_has_trip_share(id)
  );

create policy "trips_insert_own"
  on public.trips
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "trips_update_owner_or_editor"
  on public.trips
  for update
  to authenticated
  using (
    owner_id = auth.uid()
    or public.user_has_trip_share(id, array['editor']::text[])
  )
  with check (
    owner_id = auth.uid()
    or public.user_has_trip_share(id, array['editor']::text[])
  );

create policy "trips_delete_owner"
  on public.trips
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: trip_shares
-- ---------------------------------------------------------------------------
create policy "shares_select_owner_or_invitee"
  on public.trip_shares
  for select
  to authenticated
  using (
    invitee_email = public.current_user_email()
    or public.user_owns_trip(trip_id)
  );

create policy "shares_insert_owner"
  on public.trip_shares
  for insert
  to authenticated
  with check (public.user_owns_trip(trip_id));

create policy "shares_update_owner"
  on public.trip_shares
  for update
  to authenticated
  using (public.user_owns_trip(trip_id))
  with check (public.user_owns_trip(trip_id));

create policy "shares_delete_owner"
  on public.trip_shares
  for delete
  to authenticated
  using (public.user_owns_trip(trip_id));

-- ---------------------------------------------------------------------------
-- Share → allowlist sync
-- Inserting/updating a share allowlists the invitee email.
-- Deleting the last share for an email removes them from the allowlist
-- (unless they own a trip).
-- ---------------------------------------------------------------------------
create or replace function public.trip_share_sync_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    target_email := lower(new.invitee_email);
    insert into public.allowlist_emails (email)
    values (target_email)
    on conflict (email) do nothing;
    return new;
  elsif tg_op = 'DELETE' then
    target_email := lower(old.invitee_email);

    if exists (
      select 1 from public.trip_shares s
      where s.invitee_email = target_email
    ) then
      return old;
    end if;

    if exists (
      select 1
      from public.profiles p
      join public.trips t on t.owner_id = p.id
      where lower(p.email) = target_email
    ) then
      return old;
    end if;

    delete from public.allowlist_emails
    where email = target_email;

    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_trip_share_allowlist on public.trip_shares;
create trigger on_trip_share_allowlist
  after insert or update or delete on public.trip_shares
  for each row execute function public.trip_share_sync_allowlist();

-- Realtime: collaborators receive trip snapshot updates live.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table public.trips;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- Use DEFAULT replica identity: Realtime WebSocket only sends primary key & metadata (id, updated_at).
-- This prevents broadcasting massive JSONB snapshots over WebSocket egress.
alter table public.trips replica identity default;

-- ---------------------------------------------------------------------------
-- Trip backups (server-side history — last N kept by app after each full save)
-- ---------------------------------------------------------------------------
create table if not exists public.trip_backups (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists trip_backups_trip_id_created_at_idx
  on public.trip_backups (trip_id, created_at desc);

alter table public.trip_backups enable row level security;

create policy "trip_backups_select"
  on public.trip_backups
  for select
  to authenticated
  using (public.user_can_read_trip(trip_id));

create policy "trip_backups_insert"
  on public.trip_backups
  for insert
  to authenticated
  with check (public.user_can_edit_trip(trip_id));

create policy "trip_backups_delete"
  on public.trip_backups
  for delete
  to authenticated
  using (public.user_can_edit_trip(trip_id));

-- ---------------------------------------------------------------------------
-- Incremental artifacts patch / pull (avoid transferring the full JSONB blob)
-- ---------------------------------------------------------------------------
create or replace function public.artifact_key_is_cloud(p_key text)
returns boolean
language sql
immutable
as $$
  -- Keep in sync with src/shared/services/llm/artifactCloudPolicy.ts
  select p_key like 'place-detail:%'
      or p_key like 'hotel-detail:%'
      or p_key like 'recommend:%'
      or p_key like 'translations:%'
      or p_key like 'place-names:%'
      or p_key like 'itinerary:locale-copy:%';
$$;

grant execute on function public.artifact_key_is_cloud(text) to authenticated;

drop function if exists public.patch_trip_artifacts(uuid, jsonb, text[]);

create or replace function public.patch_trip_artifacts(
  p_trip_id uuid,
  p_upserts jsonb default '{}'::jsonb,
  p_deletes text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_updated_at timestamptz;
  new_rev integer;
  upserts jsonb := coalesce(p_upserts, '{}'::jsonb);
  deletes text[] := coalesce(p_deletes, '{}'::text[]);
  filtered jsonb := '{}'::jsonb;
  k text;
begin
  if jsonb_typeof(upserts) <> 'object' then
    raise exception 'p_upserts must be a JSON object'
      using errcode = '22023';
  end if;

  if not public.user_can_edit_trip(p_trip_id) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  for k in select jsonb_object_keys(upserts)
  loop
    if public.artifact_key_is_cloud(k) then
      filtered := filtered || jsonb_build_object(k, upserts -> k);
    end if;
  end loop;

  update public.trips
  set artifacts =
        (coalesce(artifacts, '{}'::jsonb) - deletes) || filtered,
      artifacts_rev = coalesce(artifacts_rev, 0) + 1
  where id = p_trip_id
  returning updated_at, artifacts_rev into new_updated_at, new_rev;

  if new_updated_at is null then
    raise exception 'trip not found'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'updated_at', new_updated_at,
    'rev', coalesce(new_rev, 0)
  );
end;
$$;

revoke execute on function public.patch_trip_artifacts(uuid, jsonb, text[]) from public;
revoke execute on function public.patch_trip_artifacts(uuid, jsonb, text[]) from anon;
grant execute on function public.patch_trip_artifacts(uuid, jsonb, text[]) to authenticated;

create or replace function public.pull_trip_artifacts(
  p_trip_id uuid,
  p_known jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  current_artifacts jsonb;
  current_rev integer;
  known jsonb := coalesce(p_known, '{}'::jsonb);
  upserts jsonb := '{}'::jsonb;
  delete_keys text[] := '{}'::text[];
  k text;
  server_entry jsonb;
  known_ts numeric;
  server_ts numeric;
begin
  if jsonb_typeof(known) <> 'object' then
    raise exception 'p_known must be a JSON object'
      using errcode = '22023';
  end if;

  if not public.user_can_read_trip(p_trip_id) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  select t.artifacts, t.artifacts_rev
    into current_artifacts, current_rev
  from public.trips t
  where t.id = p_trip_id;

  if not found then
    raise exception 'trip not found'
      using errcode = 'P0002';
  end if;

  current_artifacts := coalesce(current_artifacts, '{}'::jsonb);

  for k in select jsonb_object_keys(current_artifacts)
  loop
    if not public.artifact_key_is_cloud(k) then
      continue;
    end if;
    server_entry := current_artifacts -> k;
    begin
      known_ts := nullif(known ->> k, '')::numeric;
    exception
      when invalid_text_representation then
        known_ts := null;
    end;
    server_ts := coalesce((server_entry ->> 'generatedAt')::numeric, 0);
    if known_ts is null or known_ts is distinct from server_ts then
      upserts := upserts || jsonb_build_object(k, server_entry);
    end if;
  end loop;

  for k in select jsonb_object_keys(known)
  loop
    if public.artifact_key_is_cloud(k) and not (current_artifacts ? k) then
      delete_keys := array_append(delete_keys, k);
    end if;
  end loop;

  return jsonb_build_object(
    'rev', coalesce(current_rev, 0),
    'upserts', upserts,
    'deletes', to_jsonb(delete_keys)
  );
end;
$$;

revoke execute on function public.pull_trip_artifacts(uuid, jsonb) from public;
revoke execute on function public.pull_trip_artifacts(uuid, jsonb) from anon;
grant execute on function public.pull_trip_artifacts(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap: add your email(s) to the allowlist, then sign up.
-- Example:
--   insert into public.allowlist_emails (email) values ('you@example.com');
-- Dev test account: run `npm run seed:test-user` (see supabase/seed-test-user.sql).
-- Sharing also auto-allowlists invitees.
-- ---------------------------------------------------------------------------
