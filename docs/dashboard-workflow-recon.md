# Dashboard workflow canvas — recon

## Scope note

`docs/product/dashboard-workflow-spec.md` was absent at discovery time and has
now been created with the agreed product design. The older
`docs/gwira/workflow-spec.md` is empty and is not a source of requirements.

## 1. Existing surfaces and primitives

| Concern | Path | Notes |
|---|---|---|
| Dashboard route/controller | `src/renderer/main.tsx` | `activeView: 'dashboard'` is supplied to `WorkspaceShell`; it renders `DashboardPage` after onboarding is complete. |
| Application shell | `src/renderer/components/WorkspaceShell.tsx` | Selects the content for `WorkspaceNavigation` destinations. |
| Global/two-layer sidebar | `src/renderer/components/ProjectSidebar.tsx` | Accepts the Dashboard contextual sidebar as `dashboardSidebar`. |
| Dashboard contextual sidebar | `src/renderer/gwira/dashboard/DashboardSidebar.tsx` | Supplies Dashboard, Inbox, and My Work navigation plus People & Doats. |
| Dashboard page | `src/renderer/gwira/dashboard/DashboardPage.tsx` | Current supervision workspace. |
| Existing tab primitive | `src/renderer/gwira/library/LibraryPage.tsx` (`.library-tabs`, `role="tablist"`) | The closest semantic tab implementation. It is Library-specific, not a shared primitive. |
| Existing segmented control | `src/renderer/gwira/dashboard/DashboardPage.tsx` (`.gwira-dashboard__toggle`) | Two buttons for “By worker” / “By objective”; also page-specific. |
| Existing right-side inspector | `src/renderer/gwira/dashboard/DashboardPage.tsx` (`.gwira-dashboard__inspector`) | Conditional `<aside>` for selected summary/activity records; Escape closes it. |
| Task detail side panel | `src/renderer/gwira/work/MyWorkPage.tsx` (`.gwira-task-details`) | Existing detailed task panel, separate from the Dashboard inspector. |

## 2. Record availability

All production records are local-only in `GwiraLocalState`, persisted by
`src/renderer/gwira/data/localStore.ts` under `gwira.local-prototype.v1`.

| Need | Exact model or selector | Availability / limitation |
|---|---|---|
| People | `GwiraLocalState.people: Person[]` in `src/renderer/gwira/domain/types.ts` | Available. |
| Doats | `GwiraLocalState.doats: Doat[]`; `doatToUiRecord(doat, state)` in `src/renderer/gwira/doats/doatViewModel.ts` | Available. Archived Doats are excluded by Dashboard selectors. |
| Run/execution state | `Task.agentRun?: AgentRun` (`running`, `completed`, `error`, `stopped`); `Doat.operations`; `mapTaskToDoatOperationalStatus` | Available. A run belongs to its task; it is not an independent persisted run collection. |
| Steps | `WorkflowTaskDefinition` in `src/renderer/gwira/organization/domain/workflowTypes.ts` | NOT AVAILABLE as persisted Dashboard data. These are pure planning records and are not part of `GwiraLocalState`. |
| Tasks | `GwiraLocalState.tasks: Task[]` | Available, including status, assignee, project, description, and optional `agentRun`. |
| Task dependency | `WorkflowTaskDefinition.dependsOn` | NOT AVAILABLE in persisted local tasks. The planning-only type is not loaded, saved, or selected by Dashboard. |
| Blocked-by | `Task.status === 'blocked'` | NOT AVAILABLE as a relationship. Status identifies a blocked task but not its blocking record. |
| Parent/contains | — | NOT AVAILABLE. `Task` has `projectId`, but no parent task or objective identifier. |
| Created-from | — | NOT AVAILABLE. |
| Approval gate | `Approval.taskId`, `Approval.resultId`, `Approval.status` | Available as an explicit link to a task/result identifier. |
| Activity history | `GwiraLocalState.activity: ActivityEvent[]` | Available, but timestamps/events must not be used to infer graph edges. |

The new `src/renderer/gwira/graph/graphModel.ts` has independent input shapes
for explicit edges, including `dependsOnTaskIds`; it does not mean the current
persisted `Task` provides those fields.

## 3. Handoff-edge proposal

There is no stored handoff event or task-link table today. A Doat assignment is
available from `Task.assignee`, but an assignee change would not prove a
handoff, so the canvas must not infer an edge from it or from timestamps.

Smallest local model proposal (not implemented):

```ts
interface TaskRelationship {
  id: string;
  workspaceId: string;
  kind: 'dependsOn' | 'blockedBy' | 'parent' | 'createdFrom' | 'handoff';
  sourceTaskId: string;
  targetTaskId: string;
  fromAssignee?: Assignee;
  toAssignee?: Assignee;
  createdAt: string;
}
```

Canvas handoff edges would use only `kind: 'handoff'` records, drawn from
`sourceTaskId` to `targetTaskId`; participant labels would use the explicitly
recorded `fromAssignee` and `toAssignee`. Dependencies, blockers, parentage,
and origin would likewise use only their matching explicit kind. This avoids
any status- or timestamp-based inference and gives the graph model a direct
adapter.

The local-only change would add `taskRelationships` to `GwiraLocalState`, bump
and migrate `GWIRA_SCHEMA_VERSION`, validate referenced task/worker IDs in
`localStore.ts`, and add reducer commands/activity entries to create records.
It does not require a cloud service, execution-engine change, or UI change.

## 4. Graph dependencies

| Package | Installed | Version | License |
|---|---:|---:|---|
| `@xyflow/react` | Yes | 12.12.0 | MIT |
| `@dagrejs/dagre` | No | — | — |
| `dagre` | Yes | 0.8.5 | MIT |

The existing graph model currently imports `dagre`, not `@dagrejs/dagre`.

## 5. Sending a message to a Doat with context

NOT AVAILABLE as a dedicated interaction. The available execution path is
`startCodingTask` in `src/renderer/main.tsx`: it validates an explicitly
assigned coding-agent task, starts a local Codex session, then sends only the
task title and optional description through
`createCodingTaskSendInputRequest` / `codingTaskPrompt` in
`src/renderer/gwira/agents/codingTaskBridge.ts`.

The generic Home composer can send a prompt to a selected Codex session, but
has no Doat target or Dashboard-context contract. The Dashboard Ask bar merely
navigates to My Work; it does not submit the instruction or attach context.

## 6. Baselines

- `artifacts/canvas/baseline/home-1280x800.png`
- `artifacts/canvas/baseline/dashboard-1280x800.png`

Both were captured from Electron at 1280×800. “Home” is the existing Home
composer surface (not the unused `HomePage` component); Dashboard is the
complete empty-data supervision workspace.

## M0 addendum: verified implementation and integration paths

### Graph implementation status

`graphModel.ts` supports all six required node types and five explicit edge
types. Nodes use `${type}:${recordId}` IDs; edges use a stable
type/source/target ID; only source-record links are added; and unmatched nodes
are returned in `unlinked`. `layoutGraph` applies deterministic left-to-right
Dagre layout without React imports.

`GraphNode.tsx` covers default, hover, focus, selected, blocked, waiting,
working, completed, failed, and loading visual states. `DevNodeGallery.tsx`
renders every type/state combination and is reachable only at `/dev/node-gallery`
when `import.meta.env.DEV` is true. The Dashboard currently does **not** mount
this model, any custom edge, or an XYFlow canvas. `tests/gwira/graphModel.test.ts`
passed all 8 graph-model assertions on this review.

### Additional data discovery

| Capability | Source | Status |
|---|---|---|
| Organizations/workspaces | `GwiraLocalState.organization`, `.workspace` | AVAILABLE |
| Employees | `GwiraLocalState.people: Person[]` | AVAILABLE |
| Doats | `GwiraLocalState.doats: Doat[]`; `doatToUiRecord` | AVAILABLE |
| Tasks | `GwiraLocalState.tasks: Task[]` | AVAILABLE |
| Agent runs | `Task.agentRun?: AgentRun`; execution bridge in `codingTaskBridge.ts` | AVAILABLE |
| Execution steps | Planning-only `WorkflowTaskDefinition` | NOT AVAILABLE as persisted data |
| Approvals | `GwiraLocalState.approvals: Approval[]` | AVAILABLE |
| Activity events | `GwiraLocalState.activity: ActivityEvent[]` | AVAILABLE |
| Objectives | `organizationStructure.departments[].objectives: string[]` | PARTIAL; strings are not standalone business records |
| Dependencies | `WorkflowTaskDefinition.dependsOn` | NOT AVAILABLE in persisted task data |
| Worker conversations | Codex sessions/history | PARTIAL; not associated with people/Doats |

### Inspector and Ask Gwira

The existing Dashboard inspector is conditional local state in `DashboardPage`.
Task/activity selection sets title/detail state; its close button and a
document-level Escape listener clear it. It exposes activity summary only;
Doat details navigate to `DoatProfile`, and messaging is unavailable. The
smallest safe extension is a persistent inspector that retains the same
selection/close/Escape pattern but accepts typed record IDs and renders a
default Team/Activity view from existing records.

Home submission is `sendPrompt` in `src/renderer/main.tsx`: it starts or
continues a Codex session for the active project, sends text plus supported
file/skill attachments, and returns streamed session output. It cannot attach
selected-worker or workflow context, query task/run data as structured context,
or message a Doat. The Dashboard Ask bar currently opens My Work and discards
its text.

### Dependencies, risks, and next steps

`@xyflow/react` 12.12.0 (MIT) and `dagre` 0.8.5 (MIT) are installed.
`@dagrejs/dagre` is not installed; the existing model already uses `dagre`.

The primary P1 risk is missing persisted task relationships and execution
steps. The smallest safe fix is the proposed local `TaskRelationship` record
(explicit dependency/blocker/parent/origin/handoff fields), accompanied by
schema migration, local-store validation, and reducer commands. Until then,
production graph adapters must show unlinked records and only the existing
approval/task/run links. Next, mount an XYFlow canvas behind the production
empty-state guard, add isolated dev fixtures, then extend the current inspector.

### Verified baselines

- `artifacts/canvas/baseline/home-1280x800.png` — Home composer route.
- `artifacts/canvas/baseline/dashboard-1280x800.png` — `.gwira-dashboard` route.
- `artifacts/canvas/baseline/node-gallery-1280x800.png` — `/dev/node-gallery`.

Each is a 1280×800 logical Electron capture (2560×1600 display-scale pixels).
