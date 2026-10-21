# Phase 3 — multi-agent implementation

## Scope and prototype boundary

Phase 3 adds a **local-only Gwira work-management prototype** alongside the existing local Codex Desktop capabilities. It is not a collaborative, hosted, or commercially distributable product: there is no authentication, tenant isolation, cloud synchronization, remote notification delivery, background worker, credential vault, or external connector.

The existing Codex CLI executor remains the only executable agent runtime. A Gwira coding task may start a scoped, existing `workspace-write` Codex session only after a user action. It never grants Full Access, invokes a shell directly, or creates a second execution path.

## Development team

| Role | Work package | Shared-file rule |
|---|---|---|
| Lead / UX director | Domain contract, local persistence boundary, central integration, navigation, styles, security review and final validation | Owns `main.tsx`, shared contracts, global CSS and final integration. |
| Gwira Core | Pure business domain and validated local storage adapter | New isolated `src/gwira/` modules and focused tests. |
| Agent execution | Coding-task/session correlation adapter and lifecycle design | New renderer helper/tests; no change to Codex main process or IPC. |
| My Work | Isolated task board/detail presentation modules after the shared contract is available | New component modules only; no shared-state changes. |
| Home & Inbox | Local activity/approval projections | New component modules and tests only; no external communications claim. |
| Workspace surfaces | Local Teams, coding-agent directory and workspace setting modules | New component modules and tests only; no shared-state changes. |

Agents work only on independent files until the Lead integrates them. No agent may alter Codex command construction, execution permissions, main-process IPC, package manifests, global styles, or central renderer state without Lead review.

## Shared domain contract (v1)

All records below belong to the local prototype store, schema version 1. IDs are opaque UUIDs; timestamps are ISO strings. This shape is deliberately organization-scoped so it can map to a future service/SQL schema, but the local store does **not** provide authorization or collaboration.

```text
GwiraLocalState
├── organization: { id, name, createdAt }
├── workspace: { id, organizationId, name, createdAt }
├── people: Person[]
├── agents: Agent[]
├── projects: BusinessProject[]
├── tasks: Task[]
├── comments: TaskComment[]
├── approvals: Approval[]
└── activity: ActivityEvent[]
```

`BusinessProject` is distinct from existing Codex `ProjectEntry`. It can optionally reference a local project path but never takes ownership of, edits, or migrates the existing Codex project preference.

`Task` has a lifecycle of `backlog → todo → in_progress → in_review → done`, plus `blocked`. It has a priority, optional due date, actor assignment, comments and optional `agentRun` correlation. A `coding` agent is the only agent type available in this phase.

`AgentRun` holds only local correlation metadata: `{ sessionId, codexConversationId?, status, startedAt, completedAt?, error? }`. The CLI JSONL file remains the canonical transcript. The local task store must never copy unbounded CLI output.

`Approval` is bound to an exact completed task/result and supports `pending`, `approved` and `changes_requested`. An approval changes task state only through an explicit transition and creates an activity event.

`ActivityEvent` is append-only in the local reducer and bounded in persistence. Inbox entries are derived from persisted activity, task comments and approval state; no external messages are claimed.

## First end-to-end vertical slice

1. Create or rename a local workspace.
2. Create a business project linked to an existing local coding project.
3. Create a task, assign it to a local person or the existing coding agent, and set priority/status/due date.
4. Start a coding-agent task explicitly through the existing `window.codexDesktop` session lifecycle with workspace-write permission.
5. Surface running/completed/error state from actual session events; stop uses the existing guarded stop path.
6. Place a completed coding task into review, create an approval, approve or request changes, and update its task state.
7. Record activities; show the same data in My Work, Inbox and Home.

## Persistence and security decisions

- Store only business metadata in a new, independent renderer localStorage key. Existing `codex-desktop.projects.v1` and Codex history files are read neither nor rewritten by this store.
- Validate parsed local data and fall back to an empty local workspace state. Do not silently migrate arbitrary/corrupt user values.
- Bound local activity/comments and do not persist streamed model output or secrets.
- Local persistence is explicitly labeled “Local prototype only.” It is not a substitute for Supabase/Auth/RLS, server authorization, shared work claiming or durable remote execution.
- Coding-agent launch uses the pre-existing `workspace-write` default. Full Access selection remains governed exclusively by the existing explicit confirmation UI.

## Implementation stages

1. **Foundation:** domain types, reducer, validator, local store and tests.
2. **Vertical slice:** task/project/actor UI, task lifecycle, coding-run correlation, approval and activity.
3. **Connected surfaces:** Home, My Work, Inbox and Agents consume the same state; no fabricated data.
4. **Management surfaces:** local Teams/Settings preferences with honest prototype labels.
5. **Integration review:** accessibility, navigation, workflow, safety, memory and Electron regression checks.

## Completion criteria for this phase

The first vertical slice must use shared local state across task creation, agent status, approval, activity, Inbox and Home. Existing coding workflows must still pass their tests. Unavailable collaboration, automation, agent types and connectors must remain visibly unavailable rather than simulated.

## Completed implementation (2026-10-14)

- Added a strict, separately versioned `gwira.local-prototype.v1` store. It never reads, replaces, or migrates `codex-desktop.projects.v1` or Codex JSONL histories.
- Added data-backed Home, Inbox, My Work, Teams, Agents, and Settings destinations. Inbox is an explicit local work feed; it does not portray chat, email, WhatsApp, or remote notifications as connected.
- A user can add a local person and coding-agent record, explicitly link an already saved Codex project, create/assign a task, run an assigned coding task, stop it, review the completed conversation correlation, and make an approval decision. Shared task/activity data appears in Home and Inbox.
- The integration uses no new IPC or executor. Coding tasks call the existing `startSession`, `sendInput`, `onExit`, and `stopSession` bridge only. Task requests force `permissionMode: 'default'` and `webSearch: false`; Full Access remains confined to the existing confirmed chat control.
- Run metadata is bounded to IDs/status/timestamps/error text. The transcript remains in the pre-existing Codex session and history path.

## Verification completed

- Focused Gwira suite: 24 tests across domain lifecycle, local-store validation, task/approval workflow, coding-task bridge, Home/Inbox/workspace view models, and My Work view model.
- Typecheck and production build completed successfully.
- Electron UI smoke test completed against a temporary profile: project add/switch, New chat, Skills, Home, Inbox, My Work, Teams, Agents, and Settings navigation.
- Electron mock-Codex lifecycle completed: the rendered flow added a founder and coding agent, linked the temporary saved project, created/ran/approved a coding task, and reached Done. It also verified workspace-write default, Full Access confirmation, streamed output, persistence/resume, stop and error handling. No paid model was used.
