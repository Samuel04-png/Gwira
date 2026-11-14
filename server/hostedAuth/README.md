# Hosted invitation acceptance · deployable, not deployed

This server wraps the existing Phase 2.2 InvitationService and Supabase/Resend adapter. It does not introduce a second invitation table or email provider. Auth OTP emails use the founder's Supabase SMTP settings; application invitations use the existing server-only Resend transport. The latter still requires its own authorized server credential and sending identity.

Build: `node scripts/build-hosted-auth.mjs`

Run the output with deployment secrets in the environment: `node dist-server/server/hostedAuth/server.js`. Bind a trusted TLS reverse proxy to the server's private 127.0.0.1:8080 listener. Provide the public HTTPS origin through GWIRA_AUTH_API_URL and the exact HTTPS /accept page through GWIRA_INVITATION_ACCEPTANCE_URL. No hostname has been invented and nothing is published by the build script.

Configure environment names from .env.example through a secret store, never a client bundle. The service_role credential remains on this server. Its legacy service-role JWT compatibility with the chosen project must be verified before deployment; the existing gateway's credential contract has not been silently replaced. Leave external sending false until staging delivery and all permissions pass. Reverse-proxy body/header/time limits and distributed rate limiting are mandatory before production; the process adds a 16KB JSON limit, 20s request timeout and bounded-duration in-memory rate counters.

`/accept#token=…` removes its fragment before making requests. No third-party assets or persistent browser Auth token storage are used. HTTPS/CSP/no-referrer/no-store protections, strict same-origin browser requests, bearer verification and fixed endpoints apply. Phone users verify email and accept server-side. The resulting `gwira://organization/<uuid>` link is only a desktop navigation hint; Gwira revalidates identity and membership before selecting it. It never carries access/refresh tokens and cannot grant membership. If Gwira is absent, the page explains opening it after installation; no fictitious download URL is supplied. Lost/reloaded in-memory browser state requires reopening the original invitation.

The browser page intentionally has no general business CRUD. Session recovery after page reload requires a fresh OTP; passwords and recovery emails are not implemented. Desktop and hosted OTP resend have a one-minute client cooldown and remain subject to authoritative Supabase rate limits. No complete production signup claim is made without real delivery and acceptance verification.

Before deployment: reconcile the approved project's schema/migration history, apply only reviewed additive SQL after backup, expose gwira through PostgREST only with its grants/RLS verified, configure SMTP and templates with `{{ .Token }}`, test the actual recipient inbox, set hosted origin/acceptance URL, verify service credentials, and test membership isolation with separate real accounts. Do not use the local Auth fixture as deployment evidence.

The server also contains an undeployed AI generation endpoint. Set
`DEEPSEEK_API_KEY` through the server secret store to enable it; without a key
the endpoint reports AI as unavailable. `GWIRA_AI_MODEL` is optional and
defaults to `deepseek-flash`. `GWIRA_AI_DAILY_LIMIT`
defaults to 20 per user per rolling 24 hours (allowed range 1–100). The
desktop needs the trusted HTTPS `GWIRA_AUTH_API_URL`; never place the provider
key or service-role key in the desktop configuration. See
`docs/gwira/architecture/LIVE_AI_CONVERSATIONS.md` for limits, tests and
blocking deployment risks. Do not enable this endpoint in production until
the migrations, credentials, provider policy and infrastructure are reviewed
and tested with an approved provider account. Only bounded authorized
conversation history and the authorized linked plan are sent to DeepSeek;
review its data handling and terms before enabling it.
