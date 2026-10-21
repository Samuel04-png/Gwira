# Development roadmap

## Stage 1 — Stabilization (first priority)

1. Replace unbounded history loading with bounded/cached indexed metadata; regression-test memory and repeat refreshes.
2. Make `workspace-write` the default, add clear consent for escalation, fix stop/exit race and cap output buffers.
3. Resolve/defer no-op navigation and context-menu actions, add user-visible IPC errors, and add Electron smoke tests.
4. Establish supported Node/Electron matrix and lock dependencies to reviewed versions.

Acceptance: large synthetic history stays within an agreed memory/time budget; no duplicate terminal event; no interactive control silently does nothing; build/typecheck/test pass on supported LTS Node.

## Stage 2 — Foundation

Define Gwira domain contracts and a migration boundary: organization, user/membership, role, workspace, project, task, run, artifact, tool grant, approval and audit event. Introduce backend API, authentication, tenant RLS tests, secrets management, object storage and a provider/runtime interface. Extract renderer components from Electron services.

Acceptance: two test organizations cannot read/write each other; one task/run can be created/read durably; desktop Codex runs register events through a scoped local-runtime channel.

## Stage 3 — Core business management

Implement organizations, invites, teams, projects, task lifecycle/dependencies/assignments, comments/files, shared work views and basic reporting. Use Gwira internally: founders assign human/agent coding work, review artifacts and track status.

Acceptance: founder workflow is complete from creation through assignment, review and audit, without reliance on localStorage.

## Stage 4 — Agentic workflows

Build orchestration, queues, schedules, run state machine, provider adapters, tool registry, budgets, approval gates, retries/idempotency and human-in-the-loop handoffs. Keep Codex desktop executor as an approved coding adapter.

Acceptance: multi-step workflow survives browser/desktop closure, respects grants/budgets and records every decision/output.

## Stage 5 — Communication and integrations

Add inbox/notifications, email/WhatsApp only through consented connectors, webhooks/MCP-style tool adapters, document processing and integration credential lifecycle.

Acceptance: all outbound messages have organization policy, approval/audit trace and opt-out/retention behavior where applicable.

## Stage 6 — Internal Gwira beta

Dogfood with both founders: shared organization, task queues, agent reviews/approvals, coding projects and operational dashboards. Instrument reliability, cost, latency and security events.

## Stage 7 — Customer beta

Before external access: tenant penetration/RLS testing, backups/restore drills, monitoring/on-call, incident process, data retention/deletion, terms/privacy, onboarding, billing boundaries, rate limits and least-privilege integration model.

## First five approved implementation tasks

1. Design and implement bounded, indexed Codex history retrieval with performance tests.
2. Change permission escalation to explicit consent and repair process stop lifecycle.
3. Add Electron IPC/UI smoke coverage and error telemetry that excludes prompts/secrets.
4. Write the Gwira domain/API/RLS specification and threat model.
5. Prototype a durable task/run/audit vertical slice plus a scoped desktop Codex executor adapter.
