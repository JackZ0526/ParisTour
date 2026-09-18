-- Read-only assertions against actual RLS, run as the database administrator.
begin;
do $$
declare account record; expected_count integer; actual_count integer;
begin
  for account in select id, email from public.profiles loop
    select count(*) into expected_count from public.profiles p
    where p.id = account.id
      or exists (select 1 from public.trips t join public.trip_shares s on s.trip_id=t.id
        where t.owner_id=p.id and s.invitee_email=lower(account.email))
      or exists (select 1 from public.trip_shares s join public.trips t on t.id=s.trip_id
        where t.owner_id=account.id and s.invitee_email=lower(p.email));
    perform set_config('request.jwt.claims', json_build_object('sub',account.id,'email',account.email,'role','authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into actual_count from public.profiles;
    execute 'reset role';
    if actual_count <> expected_count then raise exception 'Profile visibility mismatch'; end if;
  end loop;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","email":"rls-outsider@example.invalid","role":"authenticated"}', true);
  execute 'set local role authenticated';
  select count(*) into actual_count from public.profiles;
  execute 'reset role';
  if actual_count <> 0 then raise exception 'Unrelated account can read profiles'; end if;
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into actual_count from public.profiles;
  execute 'reset role';
  if actual_count <> 0 then raise exception 'Anonymous account can read profiles'; end if;
end;
$$;
rollback;
