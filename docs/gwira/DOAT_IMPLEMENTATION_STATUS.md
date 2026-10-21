# Doat implementation status

## Current milestone

Milestone 1 — **complete (local prototype)**. The architecture, persisted local records, procedural visual system, and execution truth boundary are integrated. No paid image/model provider is configured or invoked.

| Capability | Status | Notes |
|---|---|---|
| Layered Doat identity/configuration | Complete | Persisted as an independent, schema-v2 local record. |
| Deterministic SVG visual identity | Complete | Local procedural fallback only; no AI-image claim. |
| Creation wizard/directory/profile | Complete | Uses persisted local state, never fixtures. |
| `codex-local` execution adapter | Complete | Wraps the existing coding path only, after its own checks pass. |
| Non-Codex providers | Blocked | No configured provider/credentials/execution environment. |
| Appearance regeneration/history | Domain complete | Candidate acceptance/rejection is tested; editing UI is deferred. |
| Doat task assignment | Complete | A configured Codex Doat shares an ID with its underlying coding Agent, so existing task assignment and execution remain intact. |
| Pause/approval/governance | Partial | Pause prevents new launches; approval and concurrency gates are local configuration, not server authorization. |
| Orchestration/schedules/multi-Doat runs | Blocked | Requires durable backend, dependency model, budgets, and safe orchestration. |
| Cloud business memory | Blocked | Requires access controls, source retention and real shared storage. |
| Organization modeling | Complete (local prototype) | Schema-v3 structure supports flat, functional, and divisional models; custom departments are data-backed. |
| Organization chart / department workspace | Complete (local prototype) | Uses real persisted local records and truthful empty states. |
| Workflow dependency and assignment planner | Domain complete | Deterministic, test-backed recommendations only; no automatic dispatch or external action. |
| Durable orchestration / cross-department handoffs | Blocked | Requires persisted workflow state, authorization, idempotency, scheduler, and audit retention. |

## Persistent constraints

- Existing Codex CLI, project history, workspace-write default, output bounds, and Full Access controls remain unchanged.
- No real multi-user security, remote execution, external connectors, financial actions, or commercial distribution claim.
- Existing Phase 4 Electron hardening and licensing blockers remain open.
- Schema v1 local workspace records migrate additively to schema v2 with an empty `doats` list; Codex project preferences and histories are never read or changed.

## Verification — 2026-10-14

- Focused domain, persistence, execution-planner, renderer-adapter, and UI tests pass.
- Full suite: **42 files, 171 tests passed**.
- Typecheck and production build pass.
- The isolated Electron smoke test verifies navigation to Doats alongside project switching, threads, Skills, and all existing business surfaces.
- The isolated mocked Codex lifecycle test passes with workspace-write default, Full Access confirmation, streamed output, persistence/resume, stop, and error paths. No paid model, credentials, user history, or user preferences were used.
