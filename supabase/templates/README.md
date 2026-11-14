# Desktop email verification

These are source templates for the existing hosted Supabase project. They are not deployed automatically. In Authentication → Emails, copy each HTML file into its corresponding template and save:

- confirmation.html → Confirm signup
- magic-link.html → Magic Link
- recovery.html → Reset password

Keep `{{ .Token }}` literally intact. Configure email OTP length to 6 to match the desktop validation. Do not replace it with `{{ .TokenHash }}` or require `{{ .ConfirmationURL }}`. No deployed website or browser redirect is needed for entering these codes inside Electron. Preserve email confirmation and configured OTP expiration/rate limits. SMTP sender verification is separate from template configuration.

Google sign-in uses the existing system browser PKCE flow, not these templates. Enable the Google provider in Supabase with a Google OAuth Web client. In Google's authorized redirect URIs, register `https://xapycvxlrdcwzlzkxgbc.supabase.co/auth/v1/callback`. In Supabase's allowed redirect URLs, register `http://127.0.0.1:43821/auth/callback/*` (the last segment is a cryptographically random one-use nonce). Keep the Google client secret in Supabase. After these settings are actually configured, enable both GWIRA_GOOGLE_AUTH_ENABLED and GWIRA_GOOGLE_CALLBACK_CONFIGURED in the ignored main-process runtime configuration and restart Electron. Do not enable these flags to imply setup is complete. A real browser round trip still needs verification.

Password signup and sign-in use Supabase's signup and password grant APIs. Password recovery requests a recovery code, verifies with type=recovery, holds the temporary session only in main-process memory, and updates the password before persisting a session. The renderer never receives access/refresh tokens. Passwords are transient inputs; they are not written to preferences or logs. Creating an account does not provision missing remote organization tables or imply business data synchronization.

Official references:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google

Phase 2.3A: source templates now use a responsive white layout, neutral typography, a prominent code, security copy and expiry guidance without inventing the provider’s configured expiry. Branding uses the Gwira wordmark: no approved public logo asset URL exists, and email clients do not reliably display inline SVG/data images. Add the existing PNG only after an approved publicly hosted asset destination exists. Templates have NOT been applied to Supabase. SMTP credentials were not read. Actual inbox delivery remains unverified after the earlier HTTP 500. No magic link is included: cross-device desktop authentication uses the code, avoiding an unimplemented magic-link callback.
