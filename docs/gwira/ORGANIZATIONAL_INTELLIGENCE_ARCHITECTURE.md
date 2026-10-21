# Organizational intelligence architecture

## Supported local milestone

The current implementation is a single-device, local organization model. It can record configurable divisions, departments, teams, reporting relationships, goals, assignments, dependencies, approval checkpoints, and audit events. It is not a multi-user authorization system, a scheduler, a remote worker runtime, or a cloud collaboration product.

The existing Codex CLI remains the only executable provider. Organization responsibility never increases a Doat's tools, permissions, sandbox, project scope, or Full Access eligibility.

## Core boundary

```text
Organization / workspace
├── divisions (optional; functional, divisional, or flat model)
├── departments (custom, optional; standard names are starter choices only)
├── teams
├── reporting relationships (human or Doat supervisor)
├── objectives and projects
├── work requests / workflows / task dependencies
└── governance policy / approvals / audit events
```

The existing `Person`, `Agent`, and `Doat` records remain their own source of truth. Organizational records reference a worker identity; they do not duplicate sensitive human data or Doat capabilities.

## Deterministic orchestration only

Planning and assignment use explicit task fields, dependency checks, worker capability availability, workload, risk, project scope, and approval requirements. An AI invocation is never required merely to plan, route, or update a deterministic workflow state.

Only a task that independently passes the existing coding-task bridge can launch local Codex execution. Workflow state does not invoke tools, grant permission, bypass review, or retry external actions.

## Governance boundary

Local policies can make approval requirements and escalation routes visible and can block local workflow state transitions. They cannot establish legal authority, authorization across devices, payment controls, employment controls, regulatory compliance, secret management, or organization isolation. Those require authenticated, durable server-side enforcement.

## Deferred requirements

- External tools/connectors, payments, publishing, HR actions, and remote notifications.
- Server-issued organization identity, roles, separation of duties, durable audit retention, and RLS.
- Background workflow execution, scheduled/retry jobs, idempotent external actions, and timeouts.
- Real model costs, tool-use accounting, performance scoring, shared business memory, or cloud collaboration.

## Verification standard

Every added organization feature must be local-state-backed, fail closed for invalid references/cycles, have focused regression tests, and preserve all existing Codex project/history/agent behavior.
