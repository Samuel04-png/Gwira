-- Disposable Postgres-only Auth contract fixture, NOT Supabase Auth or signup.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
insert into auth.users values
 ('11111111-1111-4111-8111-111111111111','owner@example.test',now()),
 ('22222222-2222-4222-8222-222222222222','existing@example.test',now()),
 ('33333333-3333-4333-8333-333333333333','otherowner@example.test',now()),
 ('44444444-4444-4444-8444-444444444444','new@example.test',null),
 ('55555555-5555-4555-8555-555555555555','wrong@example.test',now()),
 ('66666666-6666-4666-8666-666666666666','admin@example.test',now());
