# Organization invitation foundation — disabled, not deployed

This is a server-only foundation, not a running HTTP service or a finished account system. The user confirmed there is no hosted onboarding page and instructed external sending to remain disabled. Production Electron still uses local mode. Do not turn a local Person into a login member or upload local records.

## What is implemented and tested

- Additive migration `supabase/migrations/20261102090000_organization_access.sql` creates an isolated `gwira` cloud schema. It has organizations, organization_memberships, organization_invitations, employees, teams, team_memberships, invitation_teams and access_audit. It uses Supabase `auth.users`; no custom password table. Organization/user and tenant-reference constraints prevent duplicate memberships and cross-tenant assignment.
- Organization creation and owner creation are one transaction. Membership mutation goes through permission-checked functions, with no client direct writes. Only owners can change membership roles; final-owner demotion is prevented under a serialized organization lock. No remove/suspend member endpoint is offered.
- Owners may invite admin/member; admins may invite member only; ordinary members cannot invite. Owner is not an invite role. Team assignment grants no organization role. Existing employee records are distinct, and nullable employee-account links require an explicit same-organization membership, never a name match.
- Trusted service generates a 32-byte cryptographic token and stores SHA-256 only. Invitations default to seven days. Creation checks existing membership, pending duplicates, same-organization teams and a serialized organization limit of 20 create/resend events/hour. Resend has a one-minute minimum interval, rotates the digest and increments delivery generation. Old delivery receipts cannot overwrite a newer generation.
- Acceptance checks the authoritative verified Auth email, current inviter authority, expiry and status, then creates the member, applies team assignments and consumes the invitation atomically. Repeated and concurrent acceptance cannot create a second membership. Revocation invalidates outstanding acceptance.
- RLS protects every table; authenticated organization members may read organization, member, employee and team rows, while invitation and audit reads require admin/owner. Invitation digest column and trusted creation/resend/preview/delivery functions are not accessible to client roles. Anonymous schema access is denied.
- Service calls Auth getUser with the caller bearer before using a server service-role credential. The actor ID is obtained from that verified response, never from an HTTP request body. User acceptance/revocation RPCs use the user bearer. Service-role credentials are never returned or passed to renderer/preload. Supabase composite RPC results are normalized and the internal digest stripped from service results.
- One mail adapter, Resend, uses server fetch and generation-specific idempotency keys. Provider bodies are not surfaced. Templates contain real organization/expiry, escaped HTML, plain text and the configured HTTPS acceptance URL. The raw token is in the fragment, not the URL query. No external email has been sent or verified. `sent` means provider request accepted, not independently verified inbox delivery.

## Configuration and safe boundary

`.env.example` lists configuration names only. Use an ignored server-side `.env` or a deployed secret store. Never use `VITE_` variables for server/provider keys. No secrets have been installed or read for this feature. `invitationConfiguration` performs no networking and fails closed unless explicitly enabled with all required values; defaults remain false. The production shared `ORGANIZATION_ACCOUNTS_ENABLED` flag remains false.

The supplied project URL is `https://xapycvxlrdcwzlzkxgbc.supabase.co`. A read-only CLI metadata check identified it as Gwira and reported RESTORING during the audit. Its existing remote database schema was not inspected. No project settings, Auth settings, remote tables, accounts, migrations or emails were changed. Before deployment, inspect the restored database and reconcile existing tables/contracts with this proposed isolated schema. No local IDs or organizations are automatically bound to this cloud project.

Missing infrastructure:

1. A real HTTPS browser onboarding/acceptance application and approved URL. The Supabase project URL is not an acceptance page.
2. Hosted Supabase Auth signup, verification, signin, signout, refresh/recovery and existing-account journeys; verified sender/domain/SMTP for Auth messages. These were not implemented or tested here.
3. A deployed trusted API/Edge Function around the service, with strict origins, request limits, safe error mapping, CSRF protection if cookies are used, and a server-only service-role credential. Do not expose a general RPC/administration proxy or an actor-ID parameter. The current adapter expects a legacy service_role JWT for backend RPC Authorization; verify against the chosen project credential configuration before deployment.
4. Approved API exposure of the custom `gwira` schema and verified PostgREST response contracts. No project API schema configuration was changed. Do not assume the schema is exposed because a migration exists.
5. A secure Electron account bridge/session vault and browser callback. No session tokens go in renderer localStorage. Implement state/PKCE, exact callback origin/path validation and replay prevention before registration. Prefer main-process one-time exchange and encrypted platform storage; no insecure storage fallback.
6. A cloud organization/workspace repository and account organization selector. Switching must dispose old tenant data/queries/selections before loading the next tenant. Do not feed the existing local workspace blob into a newly joined organization or represent SQL membership creation as successful desktop onboarding.

The hosted acceptance application must strip token fragments from the address bar before loading third-party resources, use no-referrer/no-store protections, preserve the pending invitation safely across signup/verification, explain email mismatch and offer account switching. It must call server preview/acceptance and handle invalid/expired/revoked/accepted/deleted states. This application and callback are not present, so no acceptance/signup/login/join screenshots were fabricated.

## UI foundation

`src/renderer/gwira/workforce/OrganizationAccess.tsx` is a reusable, unmounted foundation using existing Field, Button and DirectoryDialog. It requires a server-verified cloud organization context and capability-limited API. It includes Invite Member, supported role/team fields, inline errors/draft retention, pending/history rows, details, resend and confirmed revoke. The local Teams page and Add Person action are unchanged. The development preview uses simulated API calls, explicit fixture labels and fictional `.test` addresses; it is not an account or delivery test. Production does not instantiate this UI or a cloud API while account infrastructure is absent.

## Reproduce checks

```
# Docker must be running. Runs a disposable, network-isolated Postgres 17 container.
node scripts/run-organization-db-tests.mjs
npm run typecheck
npm test
npm run build
node scripts/run-organization-invitations-qa.mjs
```

The DB runner creates a minimal, explicitly labelled Auth schema fixture, applies the migration to the disposable database, tests real Postgres RLS/functions/constraints and races, then stops/removes its container. It never connects to the supplied hosted project. This does not test Supabase Auth/Gotrue, signed JWT issuance, SMTP, PostgREST schema exposure, or live RLS deployment. The API/provider unit tests mock transport, and the Electron UI preview simulates its API.

Deployment is a separate explicit approval step after missing Auth/hosted/desktop/data boundaries exist and a real Supabase integration test passes. Do not run remote db push/reset or send external invitations based on these local results.
