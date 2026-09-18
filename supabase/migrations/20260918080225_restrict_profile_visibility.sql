-- Preserve own settings and owner/invitee avatars while preventing account enumeration.
-- Subqueries use the existing trips / trip_shares RLS (no new privileged function).
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_collaborators" on public.profiles;
create policy "profiles_select_collaborators"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.trips t
      where t.owner_id = profiles.id
        and (t.owner_id = (select auth.uid()) or public.user_has_trip_share(t.id))
    )
    or exists (
      select 1 from public.trip_shares s
      where s.invitee_email = lower(profiles.email)
        and (public.user_owns_trip(s.trip_id) or s.invitee_email = public.current_user_email())
    )
  );
