-- One counter per account, shared across serverless instances. No user data is changed.
create schema if not exists private;
create table if not exists private.ai_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null
);
alter table private.ai_request_limits enable row level security;
revoke all on private.ai_request_limits from public, anon, authenticated;

create or replace function private.consume_ai_request()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_window timestamptz := date_trunc('minute', clock_timestamp());
  consumed integer;
begin
  if caller is null then return false; end if;
  insert into private.ai_request_limits as limits (user_id, window_start, request_count)
  values (caller, current_window, 1)
  on conflict (user_id) do update set
    window_start = excluded.window_start,
    request_count = case when limits.window_start = excluded.window_start
      then limits.request_count + 1 else 1 end
  where limits.window_start <> excluded.window_start or limits.request_count < 120
  returning request_count into consumed;
  return consumed is not null;
end;
$$;
revoke all on function private.consume_ai_request() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.consume_ai_request() to authenticated;

create or replace function public.consume_ai_request()
returns boolean language sql security invoker set search_path = '' as $$
  select private.consume_ai_request();
$$;
revoke all on function public.consume_ai_request() from public, anon;
grant execute on function public.consume_ai_request() to authenticated;
