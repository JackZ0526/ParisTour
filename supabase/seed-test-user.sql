-- Dev-only test account for local / staging.
-- Prefer: npm run seed:test-user  (uses service role; creates auth user reliably)
--
-- Manual fallback (SQL Editor, service-role context):
--   insert into public.allowlist_emails (email)
--   values ('test@paristour.dev')
--   on conflict (email) do nothing;
-- Then sign up in the app with test@paristour.dev / test, or create the auth user via Dashboard.

insert into public.allowlist_emails (email)
values ('test@paristour.dev')
on conflict (email) do nothing;
