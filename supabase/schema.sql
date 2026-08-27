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
  add column if not exists language_preference text;

alter table public.profiles
  drop constraint if exists profiles_language_preference_check;

alter table public.profiles
  add constraint profiles_language_preference_check
  check (language_preference is null or language_preference in ('zh-CN', 'en'));

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
alter table public.trips add column if not exists itinerary_days jsonb not null default '{}'::jsonb;
alter table public.trips add column if not exists itinerary_day_hashes jsonb not null default '{}'::jsonb;
alter table public.trips add column if not exists days_rev integer not null default 0;

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

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trip_sync_state_v2'
  ) then
    alter publication supabase_realtime add table public.trip_sync_state_v2;
  end if;
end $$;

-- DEFAULT keeps UPDATE old-record payloads compact. Clients treat every event
-- only as an invalidation and fetch the authoritative row over REST; they never
-- trust large/TOASTed JSONB fields from the WebSocket payload.
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

drop function if exists public.pull_trip_artifacts(uuid, jsonb);
drop function if exists public.pull_trip_artifacts(uuid, jsonb, integer);

create or replace function public.pull_trip_artifacts(
  p_trip_id uuid,
  p_known jsonb default '{}'::jsonb,
  p_known_rev integer default null
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

  if p_known_rev is not null and p_known_rev is not distinct from coalesce(current_rev, 0) then
    return jsonb_build_object(
      'rev', coalesce(current_rev, 0),
      'upserts', '{}'::jsonb,
      'deletes', '[]'::jsonb
    );
  end if;

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

revoke execute on function public.pull_trip_artifacts(uuid, jsonb, integer) from public;
revoke execute on function public.pull_trip_artifacts(uuid, jsonb, integer) from anon;
grant execute on function public.pull_trip_artifacts(uuid, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Incremental itinerary-day patch / pull (one day at a time)
-- ---------------------------------------------------------------------------
drop function if exists public.patch_trip_days(uuid, jsonb, jsonb, text[]);

create or replace function public.patch_trip_days(
  p_trip_id uuid,
  p_upserts jsonb default '{}'::jsonb,
  p_hashes jsonb default '{}'::jsonb,
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
  hashes jsonb := coalesce(p_hashes, '{}'::jsonb);
  deletes text[] := coalesce(p_deletes, '{}'::text[]);
  filtered jsonb := '{}'::jsonb;
  filtered_hashes jsonb := '{}'::jsonb;
  k text;
begin
  if jsonb_typeof(upserts) <> 'object' or jsonb_typeof(hashes) <> 'object' then
    raise exception 'p_upserts and p_hashes must be JSON objects'
      using errcode = '22023';
  end if;

  if not public.user_can_edit_trip(p_trip_id) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  for k in select jsonb_object_keys(upserts)
  loop
    if k ~ '^[0-9]+$' then
      filtered := filtered || jsonb_build_object(k, upserts -> k);
      if hashes ? k then
        filtered_hashes := filtered_hashes || jsonb_build_object(k, hashes -> k);
      end if;
    end if;
  end loop;

  update public.trips
  set itinerary_days =
        (coalesce(itinerary_days, '{}'::jsonb) - deletes) || filtered,
      itinerary_day_hashes =
        (coalesce(itinerary_day_hashes, '{}'::jsonb) - deletes) || filtered_hashes,
      days_rev = coalesce(days_rev, 0) + 1
  where id = p_trip_id
  returning updated_at, days_rev into new_updated_at, new_rev;

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

revoke execute on function public.patch_trip_days(uuid, jsonb, jsonb, text[]) from public;
revoke execute on function public.patch_trip_days(uuid, jsonb, jsonb, text[]) from anon;
grant execute on function public.patch_trip_days(uuid, jsonb, jsonb, text[]) to authenticated;

create or replace function public.pull_trip_days(
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
  current_days jsonb;
  current_hashes jsonb;
  current_rev integer;
  known jsonb := coalesce(p_known, '{}'::jsonb);
  upserts jsonb := '{}'::jsonb;
  delete_keys text[] := '{}'::text[];
  k text;
begin
  if jsonb_typeof(known) <> 'object' then
    raise exception 'p_known must be a JSON object'
      using errcode = '22023';
  end if;

  if not public.user_can_read_trip(p_trip_id) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  select t.itinerary_days, t.itinerary_day_hashes, t.days_rev
    into current_days, current_hashes, current_rev
  from public.trips t
  where t.id = p_trip_id;

  if not found then
    raise exception 'trip not found'
      using errcode = 'P0002';
  end if;

  current_days := coalesce(current_days, '{}'::jsonb);
  current_hashes := coalesce(current_hashes, '{}'::jsonb);

  for k in select jsonb_object_keys(current_days)
  loop
    if not (current_hashes ? k)
       or known ->> k is distinct from current_hashes ->> k then
      upserts := upserts || jsonb_build_object(k, current_days -> k);
    end if;
  end loop;

  for k in select jsonb_object_keys(known)
  loop
    if not (current_days ? k) then
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

revoke execute on function public.pull_trip_days(uuid, jsonb) from public;
revoke execute on function public.pull_trip_days(uuid, jsonb) from anon;
grant execute on function public.pull_trip_days(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Sync protocol V2: durable operation log + normalized itinerary entities
-- ---------------------------------------------------------------------------
create table if not exists public.trip_sync_state_v2 (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  snapshot_revision bigint not null default 0 check (snapshot_revision >= 0),
  min_retained_revision bigint not null default 0 check (min_retained_revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.itinerary_days_v2 (
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_number integer not null check (day_number > 0),
  plan jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (trip_id, day_number),
  constraint itinerary_days_v2_plan_object check (jsonb_typeof(plan) = 'object')
);

create table if not exists public.itinerary_stops_v2 (
  trip_id uuid not null references public.trips (id) on delete cascade,
  stop_id text not null,
  day_number integer not null check (day_number > 0),
  sort_rank bigint not null,
  stop jsonb not null,
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (trip_id, stop_id),
  foreign key (trip_id, day_number)
    references public.itinerary_days_v2 (trip_id, day_number) on delete cascade,
  constraint itinerary_stops_v2_stop_object check (jsonb_typeof(stop) = 'object')
);

create index if not exists itinerary_stops_v2_day_rank_idx
  on public.itinerary_stops_v2 (trip_id, day_number, sort_rank, stop_id)
  where deleted_at is null;

create table if not exists public.trip_custom_places_v2 (
  trip_id uuid not null references public.trips (id) on delete cascade,
  place_id text not null,
  place jsonb not null,
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (trip_id, place_id),
  constraint trip_custom_places_v2_place_object check (jsonb_typeof(place) = 'object')
);

create table if not exists public.trip_mutations_v2 (
  trip_id uuid not null references public.trips (id) on delete cascade,
  revision bigint not null check (revision > 0),
  mutation_id text not null,
  device_id text not null,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  mutation_type text not null,
  entity_id text,
  base_revision bigint not null default 0 check (base_revision >= 0),
  payload jsonb not null default '{}'::jsonb,
  committed_at timestamptz not null default now(),
  primary key (trip_id, revision),
  unique (trip_id, mutation_id),
  constraint trip_mutations_v2_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists trip_mutations_v2_committed_idx
  on public.trip_mutations_v2 (trip_id, committed_at desc);

alter table public.trip_sync_state_v2 enable row level security;
alter table public.itinerary_days_v2 enable row level security;
alter table public.itinerary_stops_v2 enable row level security;
alter table public.trip_custom_places_v2 enable row level security;
alter table public.trip_mutations_v2 enable row level security;

drop policy if exists trip_sync_state_v2_read on public.trip_sync_state_v2;
create policy trip_sync_state_v2_read on public.trip_sync_state_v2
  for select using (public.user_can_read_trip(trip_id));

drop policy if exists itinerary_days_v2_read on public.itinerary_days_v2;
create policy itinerary_days_v2_read on public.itinerary_days_v2
  for select using (public.user_can_read_trip(trip_id));

drop policy if exists itinerary_stops_v2_read on public.itinerary_stops_v2;
create policy itinerary_stops_v2_read on public.itinerary_stops_v2
  for select using (public.user_can_read_trip(trip_id));

drop policy if exists trip_custom_places_v2_read on public.trip_custom_places_v2;
create policy trip_custom_places_v2_read on public.trip_custom_places_v2
  for select using (public.user_can_read_trip(trip_id));

drop policy if exists trip_mutations_v2_read on public.trip_mutations_v2;
create policy trip_mutations_v2_read on public.trip_mutations_v2
  for select using (public.user_can_read_trip(trip_id));

revoke all on public.trip_sync_state_v2 from anon, authenticated;
revoke all on public.itinerary_days_v2 from anon, authenticated;
revoke all on public.itinerary_stops_v2 from anon, authenticated;
revoke all on public.trip_custom_places_v2 from anon, authenticated;
revoke all on public.trip_mutations_v2 from anon, authenticated;
grant select on public.trip_sync_state_v2 to authenticated;
grant select on public.itinerary_days_v2 to authenticated;
grant select on public.itinerary_stops_v2 to authenticated;
grant select on public.trip_custom_places_v2 to authenticated;
grant select on public.trip_mutations_v2 to authenticated;

/* Bootstrap normalized V2 rows once from the legacy itinerary_days JSON map. */
create or replace function public.bootstrap_trip_sync_v2(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_days jsonb;
  day_key text;
  day_plan jsonb;
  stop_value jsonb;
  place_key text;
  place_value jsonb;
  stop_position bigint;
  normalized_stop_id text;
begin
  if not public.user_can_edit_trip(p_trip_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.trip_sync_state_v2 (trip_id)
  values (p_trip_id)
  on conflict (trip_id) do nothing;

  if exists (
    select 1 from public.itinerary_days_v2 where trip_id = p_trip_id
  ) then
    return;
  end if;

  select coalesce(t.itinerary_days, '{}'::jsonb)
    into source_days
  from public.trips t
  where t.id = p_trip_id;

  if source_days is null then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;

  for day_key in select jsonb_object_keys(source_days)
  loop
    if day_key !~ '^[0-9]+$' then continue; end if;
    day_plan := source_days -> day_key;
    if jsonb_typeof(day_plan) <> 'object' then continue; end if;

    insert into public.itinerary_days_v2 (
      trip_id, day_number, plan, updated_by
    ) values (
      p_trip_id,
      day_key::integer,
      day_plan - 'stops',
      auth.uid()
    ) on conflict (trip_id, day_number) do nothing;

    stop_position := 0;
    for stop_value in
      select value from jsonb_array_elements(
        case when jsonb_typeof(day_plan -> 'stops') = 'array'
          then day_plan -> 'stops' else '[]'::jsonb end
      )
    loop
      stop_position := stop_position + 1;
      normalized_stop_id := coalesce(
        nullif(stop_value ->> 'id', ''),
        'd' || day_key || '-' || coalesce(nullif(stop_value ->> 'placeId', ''), 'unknown')
          || '-' || (stop_position - 1)::text
      );
      stop_value := jsonb_set(stop_value, '{id}', to_jsonb(normalized_stop_id), true);
      insert into public.itinerary_stops_v2 (
        trip_id, stop_id, day_number, sort_rank, stop, updated_by
      ) values (
        p_trip_id,
        normalized_stop_id,
        day_key::integer,
        stop_position * 1024,
        stop_value,
        auth.uid()
      ) on conflict (trip_id, stop_id) do nothing;
    end loop;
  end loop;

  for place_key, place_value in
    select key, value
    from jsonb_each(coalesce((
      select t.snapshot #> '{itinerary,customPlaces}'
      from public.trips t
      where t.id = p_trip_id
    ), '{}'::jsonb))
  loop
    if jsonb_typeof(place_value) <> 'object' then continue; end if;
    insert into public.trip_custom_places_v2 (
      trip_id, place_id, place, updated_by
    ) values (
      p_trip_id, place_key, place_value, auth.uid()
    ) on conflict (trip_id, place_id) do nothing;
  end loop;
end;
$$;

revoke execute on function public.bootstrap_trip_sync_v2(uuid) from public, anon, authenticated;

/* Map a client stop id onto the durable row, including occ / index drift. */
create or replace function public.resolve_trip_stop_id_v2(
  p_trip_id uuid,
  p_day_number integer,
  p_stop_id text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exact text;
  v_place_id text;
  v_occ integer;
  v_resolved text;
  v_match_count integer;
begin
  if coalesce(p_stop_id, '') = '' then
    return null;
  end if;

  select s.stop_id into v_exact
  from public.itinerary_stops_v2 s
  where s.trip_id = p_trip_id
    and s.day_number = p_day_number
    and s.deleted_at is null
    and s.stop_id = p_stop_id
  limit 1;
  if v_exact is not null then
    return v_exact;
  end if;

  if p_stop_id ~ ('^d' || p_day_number::text || '-.+-occ[0-9]+$') then
    v_place_id := substring(
      p_stop_id from ('^d' || p_day_number::text || '-(.+)-occ[0-9]+$')
    );
    v_occ := substring(p_stop_id from 'occ([0-9]+)$')::integer;
    select x.stop_id into v_resolved
    from (
      select
        s.stop_id,
        (row_number() over (order by s.sort_rank, s.stop_id) - 1) as occ
      from public.itinerary_stops_v2 s
      where s.trip_id = p_trip_id
        and s.day_number = p_day_number
        and s.deleted_at is null
        and coalesce(s.stop ->> 'placeId', '') = v_place_id
    ) x
    where x.occ = v_occ;
    if v_resolved is not null then
      return v_resolved;
    end if;
  end if;

  if p_stop_id ~ ('^d' || p_day_number::text || '-.+$') then
    v_place_id := substring(p_stop_id from ('^d' || p_day_number::text || '-(.+)$'));
    v_place_id := regexp_replace(v_place_id, '-occ[0-9]+$', '');
    v_place_id := regexp_replace(v_place_id, '-[0-9]+$', '');
    select count(*)::integer, min(s.stop_id)
      into v_match_count, v_resolved
    from public.itinerary_stops_v2 s
    where s.trip_id = p_trip_id
      and s.day_number = p_day_number
      and s.deleted_at is null
      and coalesce(s.stop ->> 'placeId', '') = v_place_id;
    if v_match_count = 1 then
      return v_resolved;
    end if;
  end if;

  return null;
end;
$$;

revoke execute on function public.resolve_trip_stop_id_v2(uuid, integer, text)
  from public, anon, authenticated;

/* Resolve a stable rank between optional neighboring stop ids, rebalancing if needed. */
create or replace function public.trip_stop_rank_v2(
  p_trip_id uuid,
  p_day_number integer,
  p_after_stop_id text,
  p_before_stop_id text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  after_id text;
  before_id text;
  after_rank bigint;
  before_rank bigint;
  next_rank bigint;
  previous_rank bigint;
begin
  after_id := public.resolve_trip_stop_id_v2(p_trip_id, p_day_number, p_after_stop_id);
  before_id := public.resolve_trip_stop_id_v2(p_trip_id, p_day_number, p_before_stop_id);

  if after_id is not null then
    select sort_rank into after_rank
    from public.itinerary_stops_v2
    where trip_id = p_trip_id and day_number = p_day_number
      and stop_id = after_id and deleted_at is null;
  end if;

  if before_id is not null then
    select sort_rank into before_rank
    from public.itinerary_stops_v2
    where trip_id = p_trip_id and day_number = p_day_number
      and stop_id = before_id and deleted_at is null;
  end if;

  -- Inverted peer order: keep the after-anchor so add still lands.
  if after_rank is not null and before_rank is not null and before_rank <= after_rank then
    before_id := null;
    before_rank := null;
  end if;

  if after_rank is null and before_rank is null then
    select coalesce(max(sort_rank), 0) + 1024 into next_rank
    from public.itinerary_stops_v2
    where trip_id = p_trip_id and day_number = p_day_number and deleted_at is null;
    return next_rank;
  end if;

  if after_rank is null then
    select max(sort_rank) into previous_rank
    from public.itinerary_stops_v2
    where trip_id = p_trip_id and day_number = p_day_number
      and deleted_at is null and sort_rank < before_rank;
    after_rank := coalesce(previous_rank, before_rank - 2048);
  elsif before_rank is null then
    select min(sort_rank) into next_rank
    from public.itinerary_stops_v2
    where trip_id = p_trip_id and day_number = p_day_number
      and deleted_at is null and sort_rank > after_rank;
    before_rank := coalesce(next_rank, after_rank + 2048);
  end if;

  if before_rank <= after_rank then return null; end if;
  if before_rank - after_rank > 1 then return after_rank + ((before_rank - after_rank) / 2); end if;

  with ranked as (
    select stop_id, row_number() over (order by sort_rank, stop_id) * 1024 as new_rank
    from public.itinerary_stops_v2
    where trip_id = p_trip_id and day_number = p_day_number and deleted_at is null
  )
  update public.itinerary_stops_v2 s
  set sort_rank = ranked.new_rank
  from ranked
  where s.trip_id = p_trip_id and s.stop_id = ranked.stop_id;

  select sort_rank into after_rank
  from public.itinerary_stops_v2
  where trip_id = p_trip_id and stop_id = after_id and deleted_at is null;
  select sort_rank into before_rank
  from public.itinerary_stops_v2
  where trip_id = p_trip_id and stop_id = before_id and deleted_at is null;
  if after_id is null then
    select max(sort_rank) into previous_rank
    from public.itinerary_stops_v2
    where trip_id = p_trip_id and day_number = p_day_number
      and deleted_at is null and sort_rank < before_rank;
    after_rank := coalesce(previous_rank, before_rank - 2048);
  end if;
  if before_id is null then
    select min(sort_rank) into next_rank
    from public.itinerary_stops_v2
    where trip_id = p_trip_id and day_number = p_day_number
      and deleted_at is null and sort_rank > after_rank;
    before_rank := coalesce(next_rank, after_rank + 2048);
  end if;
  if after_rank is null or before_rank is null or before_rank <= after_rank then
    return null;
  end if;
  return after_rank + ((before_rank - after_rank) / 2);
end;
$$;

revoke execute on function public.trip_stop_rank_v2(uuid, integer, text, text)
  from public, anon, authenticated;

/* Replace one day's plan + stops. Used by day.replace / itinerary.replace. */
create or replace function public.replace_itinerary_day_document_v2(
  p_trip_id uuid,
  p_day_number integer,
  p_day jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stop_value jsonb;
  stop_position bigint := 0;
  normalized_stop_id text;
  keep_ids text[] := '{}';
begin
  if jsonb_typeof(p_day) <> 'object' then
    raise exception 'day document must be an object' using errcode = '22023';
  end if;

  insert into public.itinerary_days_v2 (trip_id, day_number, plan, updated_by)
  values (p_trip_id, p_day_number, p_day - 'stops', auth.uid())
  on conflict (trip_id, day_number) do update set
    plan = excluded.plan,
    version = public.itinerary_days_v2.version + 1,
    updated_at = now(),
    updated_by = auth.uid();

  for stop_value in
    select value from jsonb_array_elements(
      case when jsonb_typeof(p_day -> 'stops') = 'array'
        then p_day -> 'stops' else '[]'::jsonb end
    )
  loop
    stop_position := stop_position + 1;
    normalized_stop_id := coalesce(
      nullif(stop_value ->> 'id', ''),
      'd' || p_day_number::text || '-'
        || coalesce(nullif(stop_value ->> 'placeId', ''), 'unknown')
        || '-' || (stop_position - 1)::text
    );
    keep_ids := array_append(keep_ids, normalized_stop_id);
    stop_value := jsonb_set(stop_value, '{id}', to_jsonb(normalized_stop_id), true);
    insert into public.itinerary_stops_v2 (
      trip_id, stop_id, day_number, sort_rank, stop, deleted_at, updated_by
    ) values (
      p_trip_id, normalized_stop_id, p_day_number, stop_position * 1024,
      stop_value, null, auth.uid()
    )
    on conflict (trip_id, stop_id) do update set
      day_number = excluded.day_number,
      sort_rank = excluded.sort_rank,
      stop = excluded.stop,
      deleted_at = null,
      version = public.itinerary_stops_v2.version + 1,
      updated_at = now(),
      updated_by = auth.uid();
  end loop;

  update public.itinerary_stops_v2
  set deleted_at = coalesce(deleted_at, now()),
      version = version + case when deleted_at is null then 1 else 0 end,
      updated_at = now(),
      updated_by = auth.uid()
  where trip_id = p_trip_id
    and day_number = p_day_number
    and deleted_at is null
    and not (stop_id = any (keep_ids));
end;
$$;

revoke execute on function public.replace_itinerary_day_document_v2(uuid, integer, jsonb)
  from public, anon, authenticated;

create or replace function public.replace_itinerary_document_v2(
  p_trip_id uuid,
  p_days jsonb,
  p_custom_places jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  day_value jsonb;
  v_day_number integer;
  keep_days integer[] := '{}';
  place_key text;
  place_value jsonb;
  keep_place_ids text[] := '{}';
begin
  if jsonb_typeof(p_days) <> 'array' then
    raise exception 'days must be an array' using errcode = '22023';
  end if;
  if p_custom_places is not null and jsonb_typeof(p_custom_places) <> 'object' then
    raise exception 'customPlaces must be an object' using errcode = '22023';
  end if;

  for day_value in select value from jsonb_array_elements(p_days)
  loop
    if jsonb_typeof(day_value) <> 'object' then continue; end if;
    if coalesce(day_value ->> 'day', '') !~ '^[0-9]+$' then continue; end if;
    v_day_number := (day_value ->> 'day')::integer;
    keep_days := array_append(keep_days, v_day_number);
    perform public.replace_itinerary_day_document_v2(p_trip_id, v_day_number, day_value);
  end loop;

  update public.itinerary_stops_v2 s
  set deleted_at = coalesce(s.deleted_at, now()),
      version = s.version + case when s.deleted_at is null then 1 else 0 end,
      updated_at = now(),
      updated_by = auth.uid()
  where s.trip_id = p_trip_id
    and s.deleted_at is null
    and (cardinality(keep_days) = 0 or not (s.day_number = any (keep_days)));

  delete from public.itinerary_days_v2 d
  where d.trip_id = p_trip_id
    and (cardinality(keep_days) = 0 or not (d.day_number = any (keep_days)));

  if jsonb_typeof(p_custom_places) = 'object' then
    for place_key, place_value in select key, value from jsonb_each(p_custom_places)
    loop
      if jsonb_typeof(place_value) <> 'object' then continue; end if;
      keep_place_ids := array_append(keep_place_ids, place_key);
      insert into public.trip_custom_places_v2 (trip_id, place_id, place, deleted_at, updated_by)
      values (p_trip_id, place_key, place_value, null, auth.uid())
      on conflict (trip_id, place_id) do update set
        place = excluded.place,
        deleted_at = null,
        version = public.trip_custom_places_v2.version + 1,
        updated_at = now(),
        updated_by = auth.uid();
    end loop;
  end if;

  update public.trip_custom_places_v2
  set deleted_at = coalesce(deleted_at, now()),
      version = version + case when deleted_at is null then 1 else 0 end,
      updated_at = now(),
      updated_by = auth.uid()
  where trip_id = p_trip_id
    and deleted_at is null
    and not (place_id = any (keep_place_ids));
end;
$$;

revoke execute on function public.replace_itinerary_document_v2(uuid, jsonb, jsonb)
  from public, anon, authenticated;

/*
  Compact the durable mutation log.
  The live normalized tables are the snapshot at `revision`. Only rows at or
  before snapshot_revision and outside the retention window are deleted.
  Suggested window: 7–30 days and the latest 500–20000 operations per trip
  (defaults 14 days / 4000). Call from apply when the log is large, or via
  a rare dashboard/cron job — never from a client poll loop.
*/
create or replace function public.compact_trip_mutations_v2(
  p_trip_id uuid,
  p_retain_days integer default 14,
  p_retain_count integer default 4000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retain_days integer := least(greatest(coalesce(p_retain_days, 14), 7), 30);
  v_retain_count integer := least(greatest(coalesce(p_retain_count, 4000), 500), 20000);
  v_revision bigint;
  v_snapshot_revision bigint;
  v_cutoff_time timestamptz;
  v_cutoff_revision bigint;
  v_deleted integer := 0;
  v_min_retained bigint;
begin
  update public.trip_sync_state_v2
  set snapshot_revision = revision, updated_at = now()
  where trip_id = p_trip_id
  returning revision, snapshot_revision into v_revision, v_snapshot_revision;

  if not found then
    return jsonb_build_object('deleted', 0, 'minRetainedRevision', 0, 'snapshotRevision', 0);
  end if;

  v_cutoff_time := now() - make_interval(days => v_retain_days);
  v_cutoff_revision := greatest(v_revision - v_retain_count, 0);

  delete from public.trip_mutations_v2
  where trip_id = p_trip_id
    and revision <= v_snapshot_revision
    and committed_at < v_cutoff_time
    and revision <= v_cutoff_revision;
  get diagnostics v_deleted = row_count;

  select coalesce(min(m.revision) - 1, v_snapshot_revision)
    into v_min_retained
  from public.trip_mutations_v2 m
  where m.trip_id = p_trip_id;

  update public.trip_sync_state_v2
  set min_retained_revision = greatest(v_min_retained, 0), updated_at = now()
  where trip_id = p_trip_id;

  return jsonb_build_object(
    'deleted', v_deleted,
    'minRetainedRevision', greatest(v_min_retained, 0),
    'snapshotRevision', v_snapshot_revision
  );
end;
$$;

revoke execute on function public.compact_trip_mutations_v2(uuid, integer, integer)
  from public, anon, authenticated;

create or replace function public.apply_trip_mutations_v2(
  p_trip_id uuid,
  p_device_id text,
  p_base_revision bigint,
  p_mutations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_revision bigint;
  v_mutation jsonb;
  v_mutation_id text;
  v_mutation_type text;
  v_mutation_payload jsonb;
  v_entity_id text;
  v_target_day integer;
  v_from_day integer;
  v_new_rank bigint;
  v_expected_version bigint;
  v_current_version bigint;
  v_acknowledged jsonb := '[]'::jsonb;
  v_committed jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_committed_at timestamptz;
  v_updated integer;
  v_place_id text;
  v_match_count integer;
  v_resolved_stop_id text;
begin
  if not public.user_can_edit_trip(p_trip_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(p_device_id, '') = '' then
    raise exception 'device id required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_mutations) <> 'array' or jsonb_array_length(p_mutations) > 100 then
    raise exception 'p_mutations must be an array of at most 100 operations'
      using errcode = '22023';
  end if;

  perform public.bootstrap_trip_sync_v2(p_trip_id);
  select s.revision into v_current_revision
  from public.trip_sync_state_v2 s
  where s.trip_id = p_trip_id
  for update;

  for v_mutation in select value from jsonb_array_elements(p_mutations)
  loop
    v_mutation_id := nullif(v_mutation ->> 'mutationId', '');
    v_mutation_type := nullif(v_mutation ->> 'type', '');
    v_mutation_payload := coalesce(v_mutation -> 'payload', '{}'::jsonb);
    v_entity_id := coalesce(
      v_mutation_payload ->> 'stopId',
      v_mutation_payload #>> '{stop,id}',
      v_mutation_payload ->> 'placeId'
    );

    if v_mutation_id is null or v_mutation_type is null or jsonb_typeof(v_mutation_payload) <> 'object' then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'mutationId', coalesce(v_mutation_id, ''), 'code', 'invalid_payload'
      ));
      continue;
    end if;

    if exists (
      select 1 from public.trip_mutations_v2 m
      where m.trip_id = p_trip_id and m.mutation_id = v_mutation_id
    ) then
      v_acknowledged := v_acknowledged || to_jsonb(v_mutation_id);
      continue;
    end if;

    if v_mutation_type = 'stop.add' then
      if coalesce(v_mutation_payload ->> 'dayNumber', '') !~ '^[0-9]+$'
        or jsonb_typeof(v_mutation_payload -> 'stop') <> 'object'
        or coalesce(v_entity_id, '') = '' then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      v_target_day := (v_mutation_payload ->> 'dayNumber')::integer;
      if not exists (
        select 1 from public.itinerary_days_v2
        where trip_id = p_trip_id and day_number = v_target_day
      ) then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'entity_missing', 'entityId', v_target_day::text
        ));
        continue;
      end if;
      if exists (
        select 1 from public.itinerary_stops_v2
        where trip_id = p_trip_id and stop_id = v_entity_id and deleted_at is null
      ) then
        if exists (
          select 1 from public.itinerary_stops_v2
          where trip_id = p_trip_id
            and stop_id = v_entity_id
            and deleted_at is null
            and day_number = v_target_day
            and coalesce(stop ->> 'placeId', '')
              = coalesce(v_mutation_payload #>> '{stop,placeId}', '')
        ) then
          v_acknowledged := v_acknowledged || to_jsonb(v_mutation_id);
          continue;
        end if;
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'version_conflict', 'entityId', v_entity_id
        ));
        continue;
      end if;
      v_new_rank := public.trip_stop_rank_v2(
        p_trip_id,
        v_target_day,
        nullif(v_mutation_payload ->> 'afterStopId', ''),
        nullif(v_mutation_payload ->> 'beforeStopId', '')
      );
      if v_new_rank is null then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_anchor', 'entityId', v_entity_id
        ));
        continue;
      end if;
      insert into public.itinerary_stops_v2 (
        trip_id, stop_id, day_number, sort_rank, stop, updated_by
      ) values (
        p_trip_id, v_entity_id, v_target_day, v_new_rank,
        jsonb_set(v_mutation_payload -> 'stop', '{id}', to_jsonb(v_entity_id), true),
        auth.uid()
      )
      on conflict (trip_id, stop_id) do update set
        day_number = excluded.day_number,
        sort_rank = excluded.sort_rank,
        stop = excluded.stop,
        deleted_at = null,
        version = public.itinerary_stops_v2.version + 1,
        updated_at = now(),
        updated_by = auth.uid();

      if jsonb_typeof(v_mutation_payload -> 'place') = 'object'
        and coalesce(v_mutation_payload #>> '{place,id}', '') <> '' then
        insert into public.trip_custom_places_v2 (
          trip_id, place_id, place, updated_by
        ) values (
          p_trip_id,
          v_mutation_payload #>> '{place,id}',
          v_mutation_payload -> 'place',
          auth.uid()
        ) on conflict (trip_id, place_id) do update set
          place = excluded.place,
          deleted_at = null,
          version = public.trip_custom_places_v2.version + 1,
          updated_at = now(),
          updated_by = auth.uid();
      end if;

    elsif v_mutation_type = 'stop.delete' then
      if coalesce(v_entity_id, '') = '' then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      if not exists (
        select 1 from public.itinerary_stops_v2
        where trip_id = p_trip_id and stop_id = v_entity_id
      ) then
        -- Default itinerary stops often carry index-suffixed ids that drift after
        -- peer edits. Fall back to a unique placeId on the given day.
        v_place_id := nullif(v_mutation_payload ->> 'placeId', '');
        v_resolved_stop_id := null;
        v_match_count := 0;
        if v_place_id is not null
          and coalesce(v_mutation_payload ->> 'dayNumber', '') ~ '^[0-9]+$' then
          v_target_day := (v_mutation_payload ->> 'dayNumber')::integer;
          select count(*)::integer, min(stop_id)
            into v_match_count, v_resolved_stop_id
          from public.itinerary_stops_v2
          where trip_id = p_trip_id
            and day_number = v_target_day
            and deleted_at is null
            and coalesce(stop ->> 'placeId', '') = v_place_id;
          if v_match_count = 1 and v_resolved_stop_id is not null then
            v_entity_id := v_resolved_stop_id;
          end if;
        end if;
      end if;
      if not exists (
        select 1 from public.itinerary_stops_v2
        where trip_id = p_trip_id and stop_id = v_entity_id
      ) then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'entity_missing', 'entityId', v_entity_id
        ));
        continue;
      end if;
      update public.itinerary_stops_v2
      set deleted_at = coalesce(deleted_at, now()),
          version = version + case when deleted_at is null then 1 else 0 end,
          updated_at = now(), updated_by = auth.uid()
      where trip_id = p_trip_id and stop_id = v_entity_id and deleted_at is null;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        v_acknowledged := v_acknowledged || to_jsonb(v_mutation_id);
        continue;
      end if;

    elsif v_mutation_type = 'stop.move' then
      if coalesce(v_mutation_payload ->> 'targetDayNumber', '') !~ '^[0-9]+$'
        or coalesce(v_entity_id, '') = ''
        or v_entity_id in (
          coalesce(v_mutation_payload ->> 'afterStopId', ''),
          coalesce(v_mutation_payload ->> 'beforeStopId', '')
        ) then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      v_target_day := (v_mutation_payload ->> 'targetDayNumber')::integer;
      select day_number into v_from_day
      from public.itinerary_stops_v2
      where trip_id = p_trip_id and stop_id = v_entity_id and deleted_at is null;
      if v_from_day is null then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'entity_deleted', 'entityId', v_entity_id
        ));
        continue;
      end if;
      if not exists (
        select 1 from public.itinerary_days_v2
        where trip_id = p_trip_id and day_number = v_target_day
      ) then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'entity_missing', 'entityId', v_target_day::text
        ));
        continue;
      end if;
      v_new_rank := public.trip_stop_rank_v2(
        p_trip_id,
        v_target_day,
        nullif(v_mutation_payload ->> 'afterStopId', ''),
        nullif(v_mutation_payload ->> 'beforeStopId', '')
      );
      if v_new_rank is null then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_anchor', 'entityId', v_entity_id
        ));
        continue;
      end if;
      update public.itinerary_stops_v2
      set day_number = v_target_day, sort_rank = v_new_rank, version = version + 1,
          updated_at = now(), updated_by = auth.uid()
      where trip_id = p_trip_id and stop_id = v_entity_id and deleted_at is null;

    elsif v_mutation_type = 'stop.replace' then
      if coalesce(v_entity_id, '') = ''
        or jsonb_typeof(v_mutation_payload -> 'place') <> 'object'
        or coalesce(v_mutation_payload #>> '{place,id}', '') = '' then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      if not exists (
        select 1 from public.itinerary_stops_v2
        where trip_id = p_trip_id and stop_id = v_entity_id and deleted_at is null
      ) then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'entity_deleted', 'entityId', v_entity_id
        ));
        continue;
      end if;
      update public.itinerary_stops_v2
      set stop = jsonb_set(
            (stop || coalesce(v_mutation_payload -> 'patch', '{}'::jsonb)),
            '{placeId}',
            to_jsonb(v_mutation_payload #>> '{place,id}'),
            true
          ),
          version = version + 1, updated_at = now(), updated_by = auth.uid()
      where trip_id = p_trip_id and stop_id = v_entity_id;
      insert into public.trip_custom_places_v2 (trip_id, place_id, place, updated_by)
      values (
        p_trip_id, v_mutation_payload #>> '{place,id}', v_mutation_payload -> 'place', auth.uid()
      ) on conflict (trip_id, place_id) do update set
        place = excluded.place, deleted_at = null,
        version = public.trip_custom_places_v2.version + 1,
        updated_at = now(), updated_by = auth.uid();

    elsif v_mutation_type = 'stop.patch' then
      if coalesce(v_entity_id, '') = ''
        or jsonb_typeof(v_mutation_payload -> 'fields') <> 'object'
        or (
          v_mutation_payload ? 'expectedVersion'
          and coalesce(v_mutation_payload ->> 'expectedVersion', '') !~ '^[0-9]+$'
        ) then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      v_expected_version := nullif(v_mutation_payload ->> 'expectedVersion', '')::bigint;
      select version into v_current_version
      from public.itinerary_stops_v2
      where trip_id = p_trip_id and stop_id = v_entity_id and deleted_at is null;
      if v_current_version is null then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'entity_deleted', 'entityId', v_entity_id
        ));
        continue;
      end if;
      if v_expected_version is not null and v_expected_version <> v_current_version then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'version_conflict',
          'entityId', v_entity_id, 'serverVersion', v_current_version
        ));
        continue;
      end if;
      update public.itinerary_stops_v2
      set stop = stop || coalesce(v_mutation_payload -> 'fields', '{}'::jsonb),
          version = version + 1, updated_at = now(), updated_by = auth.uid()
      where trip_id = p_trip_id and stop_id = v_entity_id;

    elsif v_mutation_type = 'day.patch' then
      if coalesce(v_mutation_payload ->> 'dayNumber', '') !~ '^[0-9]+$'
        or jsonb_typeof(v_mutation_payload -> 'fields') <> 'object'
        or (
          v_mutation_payload ? 'expectedVersion'
          and coalesce(v_mutation_payload ->> 'expectedVersion', '') !~ '^[0-9]+$'
        ) then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      v_target_day := (v_mutation_payload ->> 'dayNumber')::integer;
      v_expected_version := nullif(v_mutation_payload ->> 'expectedVersion', '')::bigint;
      select version into v_current_version
      from public.itinerary_days_v2
      where trip_id = p_trip_id and day_number = v_target_day;
      if v_current_version is null then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'entity_missing', 'entityId', v_target_day::text
        ));
        continue;
      end if;
      if v_expected_version is not null and v_expected_version <> v_current_version then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'version_conflict',
          'entityId', v_target_day::text, 'serverVersion', v_current_version
        ));
        continue;
      end if;
      update public.itinerary_days_v2
      set plan = plan || coalesce(v_mutation_payload -> 'fields', '{}'::jsonb),
          version = version + 1, updated_at = now(), updated_by = auth.uid()
      where trip_id = p_trip_id and day_number = v_target_day;

    elsif v_mutation_type = 'custom_place.upsert' then
      v_entity_id := v_mutation_payload #>> '{place,id}';
      if coalesce(v_entity_id, '') = '' or jsonb_typeof(v_mutation_payload -> 'place') <> 'object' then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      insert into public.trip_custom_places_v2 (trip_id, place_id, place, updated_by)
      values (p_trip_id, v_entity_id, v_mutation_payload -> 'place', auth.uid())
      on conflict (trip_id, place_id) do update set
        place = excluded.place, deleted_at = null,
        version = public.trip_custom_places_v2.version + 1,
        updated_at = now(), updated_by = auth.uid();

    elsif v_mutation_type = 'custom_place.delete' then
      if coalesce(v_entity_id, '') = '' then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      if not exists (
        select 1 from public.trip_custom_places_v2
        where trip_id = p_trip_id and place_id = v_entity_id
      ) then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'entity_missing', 'entityId', v_entity_id
        ));
        continue;
      end if;
      update public.trip_custom_places_v2
      set deleted_at = coalesce(deleted_at, now()),
          version = version + case when deleted_at is null then 1 else 0 end,
          updated_at = now(), updated_by = auth.uid()
      where trip_id = p_trip_id and place_id = v_entity_id and deleted_at is null;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        v_acknowledged := v_acknowledged || to_jsonb(v_mutation_id);
        continue;
      end if;

    elsif v_mutation_type = 'day.replace' then
      if coalesce(v_mutation_payload ->> 'dayNumber', '') !~ '^[0-9]+$'
        or jsonb_typeof(v_mutation_payload -> 'day') <> 'object' then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      v_target_day := (v_mutation_payload ->> 'dayNumber')::integer;
      v_entity_id := v_target_day::text;
      perform public.replace_itinerary_day_document_v2(
        p_trip_id, v_target_day, v_mutation_payload -> 'day'
      );
      if jsonb_typeof(v_mutation_payload -> 'places') = 'object' then
        insert into public.trip_custom_places_v2 (trip_id, place_id, place, updated_by)
        select p_trip_id, key, value, auth.uid()
        from jsonb_each(v_mutation_payload -> 'places')
        where jsonb_typeof(value) = 'object'
        on conflict (trip_id, place_id) do update set
          place = excluded.place, deleted_at = null,
          version = public.trip_custom_places_v2.version + 1,
          updated_at = now(), updated_by = auth.uid();
      end if;

    elsif v_mutation_type = 'itinerary.replace' then
      if jsonb_typeof(v_mutation_payload -> 'days') <> 'array' then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'mutationId', v_mutation_id, 'code', 'invalid_payload'
        ));
        continue;
      end if;
      v_entity_id := p_trip_id::text;
      perform public.replace_itinerary_document_v2(
        p_trip_id,
        v_mutation_payload -> 'days',
        coalesce(v_mutation_payload -> 'customPlaces', '{}'::jsonb)
      );

    else
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'mutationId', v_mutation_id, 'code', 'invalid_payload'
      ));
      continue;
    end if;

    v_current_revision := v_current_revision + 1;
    v_committed_at := clock_timestamp();
    insert into public.trip_mutations_v2 (
      trip_id, revision, mutation_id, device_id, actor_id,
      mutation_type, entity_id, base_revision, payload, committed_at
    ) values (
      p_trip_id, v_current_revision, v_mutation_id, p_device_id, auth.uid(),
      v_mutation_type, v_entity_id, greatest(coalesce(p_base_revision, 0), 0),
      v_mutation_payload, v_committed_at
    );
    v_acknowledged := v_acknowledged || to_jsonb(v_mutation_id);
    v_committed := v_committed || jsonb_build_array(jsonb_build_object(
      'protocol', 2,
      'tripId', p_trip_id,
      'deviceId', p_device_id,
      'mutationId', v_mutation_id,
      'baseRevision', greatest(coalesce(p_base_revision, 0), 0),
      'createdAt', coalesce(v_mutation ->> 'createdAt', v_committed_at::text),
      'type', v_mutation_type,
      'payload', v_mutation_payload,
      'revision', v_current_revision,
      'committedAt', v_committed_at,
      'actorId', auth.uid()
    ));
  end loop;

  update public.trip_sync_state_v2
  set revision = v_current_revision, updated_at = now()
  where trip_id = p_trip_id;

  if jsonb_array_length(v_committed) > 0
    and (
      select count(*) from public.trip_mutations_v2 m where m.trip_id = p_trip_id
    ) > 4500 then
    perform public.compact_trip_mutations_v2(p_trip_id);
  end if;

  return jsonb_build_object(
    'revision', v_current_revision,
    'acknowledged', v_acknowledged,
    'committed', v_committed,
    'conflicts', v_conflicts
  );
end;
$$;

revoke execute on function public.apply_trip_mutations_v2(uuid, text, bigint, jsonb)
  from public, anon;
grant execute on function public.apply_trip_mutations_v2(uuid, text, bigint, jsonb)
  to authenticated;

create or replace function public.pull_trip_changes_v2(
  p_trip_id uuid,
  p_after_revision bigint default 0,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  current_revision bigint;
  minimum_revision bigint;
  safe_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  changes jsonb;
begin
  if not public.user_can_read_trip(p_trip_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select revision, min_retained_revision
    into current_revision, minimum_revision
  from public.trip_sync_state_v2
  where trip_id = p_trip_id;

  if not found then
    return jsonb_build_object(
      'fromRevision', greatest(coalesce(p_after_revision, 0), 0),
      'toRevision', 0,
      'mutations', '[]'::jsonb,
      'hasMore', false,
      'snapshotRequired', false
    );
  end if;

  if p_after_revision < minimum_revision then
    return jsonb_build_object(
      'fromRevision', p_after_revision,
      'toRevision', current_revision,
      'mutations', '[]'::jsonb,
      'hasMore', false,
      'snapshotRequired', true
    );
  end if;

  select coalesce(jsonb_agg(item order by (item ->> 'revision')::bigint), '[]'::jsonb)
    into changes
  from (
    select jsonb_build_object(
      'protocol', 2,
      'tripId', m.trip_id,
      'deviceId', m.device_id,
      'mutationId', m.mutation_id,
      'baseRevision', m.base_revision,
      'createdAt', m.committed_at,
      'type', m.mutation_type,
      'payload', m.payload,
      'revision', m.revision,
      'committedAt', m.committed_at,
      'actorId', m.actor_id
    ) as item
    from public.trip_mutations_v2 m
    where m.trip_id = p_trip_id and m.revision > greatest(coalesce(p_after_revision, 0), 0)
    order by m.revision
    limit safe_limit
  ) q;

  return jsonb_build_object(
    'fromRevision', greatest(coalesce(p_after_revision, 0), 0),
    'toRevision', current_revision,
    'mutations', changes,
    'hasMore', jsonb_array_length(changes) = safe_limit
      and p_after_revision + safe_limit < current_revision,
    'snapshotRequired', false
  );
end;
$$;

revoke execute on function public.pull_trip_changes_v2(uuid, bigint, integer)
  from public, anon;
grant execute on function public.pull_trip_changes_v2(uuid, bigint, integer)
  to authenticated;

create or replace function public.load_trip_snapshot_v2(p_trip_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_revision bigint;
  v_days jsonb;
  v_custom_places jsonb;
begin
  if not public.user_can_read_trip(p_trip_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.revision into v_revision
  from public.trip_sync_state_v2 s
  where s.trip_id = p_trip_id;

  if not found then
    return jsonb_build_object(
      'revision', 0,
      'days', '[]'::jsonb,
      'customPlaces', '{}'::jsonb,
      'initialized', false
    );
  end if;

  select coalesce(jsonb_agg(day_document order by day_number), '[]'::jsonb)
    into v_days
  from (
    select
      d.day_number,
      d.plan || jsonb_build_object(
        'day', d.day_number,
        'stops', coalesce((
          select jsonb_agg(s.stop order by s.sort_rank, s.stop_id)
          from public.itinerary_stops_v2 s
          where s.trip_id = d.trip_id
            and s.day_number = d.day_number
            and s.deleted_at is null
        ), '[]'::jsonb)
      ) as day_document
    from public.itinerary_days_v2 d
    where d.trip_id = p_trip_id
  ) snapshot_days;

  select coalesce(jsonb_object_agg(p.place_id, p.place), '{}'::jsonb)
    into v_custom_places
  from public.trip_custom_places_v2 p
  where p.trip_id = p_trip_id and p.deleted_at is null;

  return jsonb_build_object(
    'revision', v_revision,
    'days', v_days,
    'customPlaces', v_custom_places,
    'initialized', true
  );
end;
$$;

revoke execute on function public.load_trip_snapshot_v2(uuid) from public, anon;
grant execute on function public.load_trip_snapshot_v2(uuid) to authenticated;

/* Broadcast the full committed operation; revision gaps request durable replay. */
create or replace function public.broadcast_trip_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'protocol', 2,
      'tripId', new.trip_id::text,
      'revision', new.revision,
      'mutationId', new.mutation_id,
      'deviceId', new.device_id,
      'actorId', new.actor_id::text,
      'baseRevision', new.base_revision,
      'createdAt', new.committed_at,
      'type', new.mutation_type,
      'payload', new.payload,
      'committedAt', new.committed_at
    ),
    'mutation',
    'trip:' || new.trip_id::text || ':mutations',
    true
  );
  return new;
end;
$$;

drop trigger if exists trip_mutations_v2_broadcast on public.trip_mutations_v2;
create trigger trip_mutations_v2_broadcast
  after insert on public.trip_mutations_v2
  for each row execute function public.broadcast_trip_mutation_v2();

create or replace function public.user_can_read_trip_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trip_id_text text;
begin
  if p_topic !~ '^trip:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:mutations$' then
    return false;
  end if;
  v_trip_id_text := split_part(p_topic, ':', 2);
  return public.user_can_read_trip(v_trip_id_text::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

revoke execute on function public.user_can_read_trip_realtime_topic(text)
  from public, anon;
grant execute on function public.user_can_read_trip_realtime_topic(text)
  to authenticated;

drop policy if exists trip_mutations_v2_broadcast_read on realtime.messages;
create policy trip_mutations_v2_broadcast_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.user_can_read_trip_realtime_topic(realtime.topic())
  );

-- ---------------------------------------------------------------------------
-- Bootstrap: add your email(s) to the allowlist, then sign up.
-- Example:
--   insert into public.allowlist_emails (email) values ('you@example.com');
-- Dev test account: run `npm run seed:test-user` (see supabase/seed-test-user.sql).
-- Sharing also auto-allowlists invitees.
-- ---------------------------------------------------------------------------
