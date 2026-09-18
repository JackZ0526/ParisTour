-- Synthetic users and trip exist only inside this transaction; no mail or real trip changes.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid(); editor_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid(); stranger_id uuid := gen_random_uuid();
  target uuid := gen_random_uuid(); actor record; n integer; visible_ids uuid[];
  owner_email text := owner_id::text || '@verification.invalid';
  editor_email text := editor_id::text || '@verification.invalid';
  viewer_email text := viewer_id::text || '@verification.invalid';
  stranger_email text := stranger_id::text || '@verification.invalid';
begin
  insert into auth.users(id,email) values (owner_id,owner_email),(editor_id,editor_email),(viewer_id,viewer_email),(stranger_id,stranger_email);
  update public.profiles set display_name='Verification fixture', avatar_url='https://example.invalid/avatar.png' where id in (owner_id,editor_id,viewer_id,stranger_id);
  insert into public.trips(id,owner_id,is_primary,title) values(target,owner_id,false,'ROLLBACK verification trip');
  insert into public.trip_shares(trip_id,invitee_email,role) values(target,editor_email,'editor'),(target,viewer_email,'viewer');
  for actor in select * from (values (owner_id,owner_email,'owner'),(editor_id,editor_email,'editor'),(viewer_id,viewer_email,'viewer'),(stranger_id,stranger_email,'stranger')) as roles(id,email,kind) loop
    perform set_config('request.jwt.claims',json_build_object('sub',actor.id,'email',actor.email,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select count(*) into n from public.trips where id=target;
    if n <> (case when actor.kind='stranger' then 0 else 1 end) then raise exception 'Trip read failed for %',actor.kind; end if;
    select array_agg(id) into visible_ids from public.profiles where id in (owner_id,editor_id,viewer_id,stranger_id) and display_name='Verification fixture' and avatar_url is not null;
    if not actor.id=any(visible_ids) then raise exception 'Own profile missing for %',actor.kind; end if;
    if actor.kind in ('editor','viewer') and not owner_id=any(visible_ids) then raise exception 'Owner profile missing for %',actor.kind; end if;
    if actor.kind='owner' and not (editor_id=any(visible_ids) and viewer_id=any(visible_ids)) then raise exception 'Invitee profiles missing'; end if;
    if actor.kind='stranger' and cardinality(visible_ids)<>1 then raise exception 'Unrelated profiles exposed'; end if;
    update public.trips set title='ROLLBACK test update' where id=target;
    get diagnostics n=row_count;
    if n <> (case when actor.kind in ('owner','editor') then 1 else 0 end) then raise exception 'Trip update failed for %',actor.kind; end if;
    begin
      perform public.apply_trip_mutations_v2(target,'verification',0,'[]'::jsonb);
      if actor.kind in ('viewer','stranger') then raise exception 'Unauthorized mutation RPC succeeded for %',actor.kind; end if;
    exception when insufficient_privilege then
      if actor.kind in ('owner','editor') then raise exception 'Authorized mutation RPC denied for %',actor.kind; end if;
    end;
    update public.profiles set display_name='Forbidden change' where id=owner_id and actor.kind<>'owner';
    get diagnostics n=row_count;
    if n<>0 then raise exception 'Other profile writable'; end if;
    execute 'reset role';
  end loop;
end $$;
select 'PASS: owner/editor/viewer/unrelated reads, writes, profile fields and mutation RPC; all fixtures rolled back' as result;
rollback;
