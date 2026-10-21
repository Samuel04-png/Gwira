# Background execution

The job contract defines organization-scoped IDs, idempotency keys, bounded safe retry, cancellation requested/acknowledged states, status transitions, and explicit dispatch/cancel provider commands. It does not persist or execute jobs.

Deployment requirement: use a durable backend queue and a separate worker runtime. Never use Electron timers for cloud schedules. Cloud coding must run in isolated workspaces with resource/time/network limits, repository authorization, secret isolation, approval checks, and audit events. A task surviving desktop shutdown is untested until a deployed worker is authorized and verified.

