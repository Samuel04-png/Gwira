# Doat system architecture

## Scope and truth boundary

Doats are Gwira's local, configurable digital-worker records. Version one is a **local-only prototype**: it has no account identity, tenant isolation, cloud sync, remote worker, secret store, external integration, spending capability, scheduler, or multi-Doat autonomous orchestration.

The only executable provider is the already-installed local Codex CLI. A Doat with another role can be configured and assigned work only when its provider is available; it must never display a fabricated execution result. Coding Doats reuse the current typed renderer-to-preload session lifecycle and retain workspace-write as their hard-coded default.

## Independent layers

```text
Doat
├── identity       name, role, department, description, communication style
├── intelligence   provider/model availability, instructions, reasoning preference
├── capabilities   declared skills/tools, each constrained by provider availability
├── governance     supervisor, autonomy, approval requirements, concurrency/budget limits
├── appearance     deterministic visual spec, saved avatar revision/history
└── operations     derived task, run, approval, activity status
```

`appearance` is independent of intelligence/governance. Avatar regeneration creates a pending revision and only replaces the accepted revision after an explicit user acceptance action.

## Persistence and migration

Doat records live in the existing separate local Gwira store, not in Codex projects, session JSONL, or renderer preferences. The store migrates its own schema conservatively; existing coding-agent records remain intact. New data is validated, bounded, and fail-closed. Avatar data is deterministic SVG specification metadata rather than raster or external assets.

Future Supabase mapping is organization/workspace scoped. It must add authentication, row-level authorization, encrypted secret handling, audited provider credentials, and migrations before any collaboration claim.

## Execution/provider adapter

```text
DoatExecutionAdapter
├── providerId: 'codex-local' | future provider id
├── availability(): configured | unavailable + reason
├── start(task, doat, approvedProject): existing Codex bridge only in v1
├── stop(task run): existing guarded stop path
└── event mapping: bounded run metadata; canonical transcript remains Codex JSONL
```

No adapter may grant permissions, invoke arbitrary shell commands, create an external side effect, or read unapproved context. Non-Codex Doats expose an explicit unavailable state until a real provider is configured.

## Milestones

1. Identity: validated Doat domain, local persistence, deterministic SVG visual spec, creation/editing, directory and profile.
2. Operational integration: assign coding Doats to existing tasks and adapt existing Codex events only.
3. Supervision: current approval/status controls plus per-Doat pause and safe limits.
4. Collaboration: **planned/blocked** pending a provider registry, durable orchestration state, dependencies, budgeting, authorization, and backend.

## Organizational intelligence extension

Milestone A adds a schema-v3 local organization structure with optional flat, functional, or divisional models, custom departments, teams, and explicit reporting relationships. Standard departments are templates only, not mandatory records. Organization membership and reporting references are validated against locally persisted people and Doats; invalid/cyclic structure is rejected.

The deterministic workflow module validates dependency graphs, approval checkpoints, and transparent assignment recommendations. It is not an executor: it neither creates assignments nor starts Codex. Workflow persistence, handoffs, orchestration UI, and authorization-aware governance remain future work pending a durable backend and policy model.

## Security

- Coding Doats use only workspace-write, web search off, existing saved project paths, and existing Full Access protections.
- Approval requirements are data-backed but local-only; they are not a substitute for server authorization.
- No API keys, model credentials, or financial permissions are stored in Doat records.
- Existing Electron IPC/sandbox/CSP hardening and licensing limitations remain Phase 4 release blockers.
