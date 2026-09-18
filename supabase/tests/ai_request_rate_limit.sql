-- The counter changes below are rolled back and do not consume the account's quota.
begin;
do $$
declare caller uuid; allowed boolean;
begin
  select id into caller from auth.users limit 1;
  if caller is null then raise exception 'Create a test account before running this test'; end if;
  update private.ai_request_limits set window_start=now()-interval '2 minutes', request_count=120 where user_id=caller;
  perform set_config('request.jwt.claims', json_build_object('sub',caller,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..120 loop
    select public.consume_ai_request() into allowed;
    if allowed is not true then raise exception 'Request % incorrectly denied', i; end if;
  end loop;
  select public.consume_ai_request() into allowed;
  if allowed then raise exception 'Request 121 incorrectly allowed'; end if;
  execute 'reset role';
  if has_table_privilege('authenticated','private.ai_request_limits','UPDATE') then raise exception 'Counter writable by client'; end if;
  if has_function_privilege('anon','public.consume_ai_request()','EXECUTE') then raise exception 'Anonymous RPC allowed'; end if;
end;
$$;
rollback;
