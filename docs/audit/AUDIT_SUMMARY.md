# Codex Desktop audit — executive summary

## Decision

Codex Desktop is a useful local coding-agent client to preserve and harden. It is not yet a foundation for a multi-user business operating system: it has no server, identity, tenancy, durable business records, workflow runtime, approval model or cloud background execution. Reuse the desktop Codex executor and selected UI patterns; build Gwira Core alongside it behind clear boundaries.

## What was verified

- The app is Electron + React + TypeScript. React uses a typed preload bridge; Electron main process owns filesystem, dialogs, Git and local `codex` child processes.
- Codex runs are real local `codex exec --json` / `exec resume` processes. Output is parsed and streamed to a transient in-memory session store.
- Projects are local paths in browser localStorage. History and skills are read from the user’s `~/.codex` directory.
- Automations and Settings are visible UI placeholders. Skills supports local discovery and basic management, not secure installation/execution.
- Typecheck passed; 27 test files / 114 tests passed; production build passed. These do not validate Electron UI or real CLI execution.

## Most urgent risks

1. History loading is an OOM-prone global scan: every project history query reads and splits all Codex JSONL files concurrently before filtering. Repeated project/turn refreshes amplify this. This is the strongest evidence for the reported 3.5 GB V8 crash.
2. The UI defaults to “Full access,” causing Codex to bypass approvals and sandboxing. This is unacceptable as a Gwira default.
3. Process/output/session lifecycle is unbounded and cancellation can produce duplicate terminal states.
4. Broad path-based IPC and absent tenant/security architecture are unsuitable for shared customers.
5. Current dependency audit reports three high vulnerabilities; licensing lacks a conventional root license and README requires attribution.

## Recommended path

Stabilize first: bound/index history, fix permission and stop lifecycle, surface no-op/broken UI, add Electron integration tests, support an LTS Node line and resolve reviewed dependency findings. Then create a cloud Gwira Core with organization-scoped Auth/RBAC, Postgres/RLS, tasks/runs/artifacts/audit events, queue/scheduler, policy/approvals, object storage and provider-neutral agent orchestration. Keep Electron as a registered, scoped local runtime for coding work; run durable/non-local work in cloud workers.

## Unverified items

The specific OOM was not reproduced against private real session data. No packaged app, macOS UI, live Codex account, external model, skill execution, or Git switching test was run. Assertions about those behaviors are marked partial/not verified in the inventory. No source/application behavior was changed during this audit; only these documents were added.
