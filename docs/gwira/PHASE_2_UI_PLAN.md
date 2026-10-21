# Gwira Phase 2 — UI foundation plan

## Status and decision boundary

This is a planning document only. It intentionally makes no renderer, main-process, IPC, local-preference, project, session, or Codex CLI changes. Implementation begins only after approval and after FlutterFlow reference screenshots are available.

The Phase 1 validation verdict permits careful, non-destructive UI work, but not a multi-user business product or a backend redesign. The existing application is a local Electron wrapper around Codex CLI; it is not yet a business data platform.

Before source changes, manually confirm the saved project list in the running application. A read-only check of the Electron Local Storage directory found no parseable current `codex-desktop.projects.v1` value. It did not read project paths or alter the profile. This matters because early Phase 1 harness attempts may have changed that preference, as recorded in `docs/audit/PHASE_1_FINAL_REPORT.md`.

Commercial distribution is blocked pending licensing review. The repository has no root `LICENSE` file and `package.json` has no license field. The README states commercial use requires visible Codex Desktop attribution, but that is not a standard, machine-readable grant. Obtain written clarification from the copyright holder and have counsel review attribution, dependency notices, Codex/OpenAI terms, connector terms, and platform-signing requirements before distributing Gwira. This is planning guidance, not legal advice.

## 1. Existing components and patterns to reuse

The current UI is a React renderer in `src/renderer/main.tsx`, styled by `src/renderer/styles.css`. The renderer is intentionally compact but monolithic, so Phase 2 should extract boundaries without changing behavior first.

| Existing asset | What it already does | Gwira reuse boundary |
|---|---|---|
| Application shell, sidebar, top bar, responsive CSS | Desktop layout, draggable Electron chrome, dark design tokens, scroll containment | Retain the shell and its visual language; replace navigation labels/structure only after compatibility tests exist. |
| Project state and sidebar thread tree | Local project selection, expansion, thread lists, delete flows | Keep as the initial **Projects / Coding workspace** implementation. Do not migrate or reinterpret saved local project data. |
| Coding workspace | New/resumed sessions, transcript, streamed activity, Markdown/code rendering, composer, attachments, file and skill references | Preserve as a self-contained `CodingWorkspace` surface. It remains the primary way to use coding agents. |
| Session/history helpers | Bounded history load, cached sessions, project/session association, thread rows | Treat as a compatibility boundary. No new business navigation may cause unbounded history loading or change its limits. |
| Agent controls | Model, reasoning, web-search, permission choice, stop lifecycle, Full Access confirmation | Keep unchanged in the coding workspace. Workspace write remains default; Full Access remains explicit opt-in with confirmation. |
| Skills view and detail modal | Lists, searches, enables/disables, uninstalls, opens and invokes existing local Codex skills | Keep operational. Its eventual position in Gwira navigation must not break slash-command skill use. |
| Project/Git/file integration | Directory/file selection, bounded project scan, branch list/switch, error banner | Reuse behind the coding workspace. Keep unsupported rename/worktree/branch-create controls disabled until real implementations exist. |
| Dialog and feedback patterns | Onboarding, delete confirmation, bootstrap help, Full Access confirmation, image preview, error banner | Reuse for future Gwira confirmations and unavailable-state messaging, with accessible labels and no silent actions. |
| Typed preload API and shared types | Renderer-to-main capabilities for CLI, files, skills, Git and bootstrap | Do not widen this API for UI-only work. New business data requires an approved data model and backend contract first. |

Useful renderer helpers already have focused responsibilities: `projectStateStorage`, `projects`, `projectThreads`, `sessionHistory`, `navigationState`, `projectFileSearch`, `composerAttachments`, `displayMessages`, `messageMerge`, and `permissionSelection`. Preserve their existing contracts during component extraction.

## 2. Required navigation changes

The target information architecture is:

1. Home
2. Inbox
3. My Work
4. Views
5. Teams
6. Projects
7. Agents
8. Automations
9. Settings

The present application only has functioning equivalents for a coding workspace, projects/threads, and skills. It deliberately disables Automations and Settings because neither has a backend. The new navigation must therefore distinguish three states:

| Navigation item | Phase 2 foundation position | Backing capability required before an active product page |
|---|---|---|
| Home | Planned shell destination; no dashboard content until approved data sources exist | Business/activity aggregation model. |
| Inbox | Planned, unavailable until work items/messages have a source of truth | Inbox assignment, read state, participants and permissions. |
| My Work | Planned, unavailable until personal task/work ownership exists | Identity, assignment and task lifecycle. |
| Views | Planned, unavailable until saved filters/views exist | Shared query/view model and authorization. |
| Teams | Planned, unavailable until people, roles and team data exist | Organization, membership and role model. |
| Projects | Active. Hosts the existing project list and coding workspace. | Existing local project/session APIs. |
| Agents | Planned. In the first safe increment it may provide a clearly scoped entry to existing coding agents only; it must not imply persistent business agents, delegation, or background execution. | Agent registry, ownership, permissions, runtime and audit model for broader functionality. |
| Automations | Remain visibly disabled/unavailable until a complete trigger/action, safety, execution and audit backend is approved. | Automation scheduler, credentials/secrets, lifecycle, logs and controls. |
| Settings | Remain visibly disabled/unavailable until settings have durable schemas and scoped ownership. | Settings persistence, validation, migration and access rules. |

Skills are an existing working capability rather than a proposed business-navigation item. During the first navigation pass it remains reachable from the Projects coding workspace and from the composer. Its eventual place (for example, a secondary Agents area) is a product decision, not a reason to remove it.

No navigation item may masquerade as working. An unavailable item must either remain disabled with a concise reason, as it does today, or be omitted until an approved implementation exists. The provided FlutterFlow screenshots will guide composition, spacing and interaction hierarchy; they will not be replaced by generic dashboard patterns.

## 3. Proposed component architecture

The goal is an incremental boundary around existing behavior, not a framework or backend replacement.

```text
App
├── DesktopShell
│   ├── PrimaryNavigation                 (target Gwira destinations)
│   ├── ProjectThreadSidebar              (existing project/thread behavior)
│   └── ContentRouter / view-state adapter
│       ├── ProjectsPage
│       │   └── CodingWorkspace           (existing Codex workspace intact)
│       ├── SkillsPage                    (existing functionality intact)
│       └── UnavailableFeatureNotice      (only for currently unsupported destinations)
└── Existing desktop capability boundary
    ├── typed preload API
    ├── Codex CLI process/session manager
    ├── bounded Codex history index
    ├── project scan / Git / local skills
    └── local project preference storage
```

Suggested extraction order inside the renderer:

1. Move pure presentational components and their narrowly scoped props out of `main.tsx` without changing markup or CSS behavior.
2. Extract `CodingWorkspace` around the transcript, composer, agent controls and related state. Keep existing callback contracts and preload calls intact.
3. Extract `ProjectThreadSidebar`, including project selection, history opening, deletion and disabled project-menu actions.
4. Introduce a typed app-level navigation state that wraps, rather than replaces, the current `chat` / `skills` workspace state. Route compatibility is more important than URL routing in this Electron application.
5. Add page modules only when their required data contract is approved. Do not put mock business entities into `localStorage` or overload Codex session types.

The shell should continue using the current tokenized dark palette, typography, compact sidebar, modal treatment, responsive behavior, drag regions and error treatment until the supplied references establish intentional changes. CSS should be divided by component only after the extraction has parity tests.

## 4. Pages to introduce

The following describes product destinations, not implementation authorization.

| Page | First safe deliverable | Explicitly not included yet |
|---|---|---|
| Home | Navigation destination and approved empty/unavailable state, if needed to validate the shell | Metrics, activity feeds, business reporting or synthetic tasks. |
| Inbox | None until an inbox data model exists | Fake notifications or use of Codex history as an inbox. |
| My Work | None until task ownership/lifecycle exists | Local placeholder task records. |
| Views | None until saved-view semantics exist | Static dashboard cards or unpersisted filters presented as saved. |
| Teams | None until organization/team identity is designed | Dummy employees, roles or AI-agent membership. |
| Projects | Existing local projects, sessions, thread history and coding workspace, preserved | Data migration, cloud sync, renaming semantics or worktree management. |
| Agents | A clearly labeled bridge to existing coding agents only, after review | Autonomous business agents, scheduling, delegation, credentials or agent marketplace. |
| Automations | Disabled explanatory control | Triggers, schedules, background runs or apparent automation builder. |
| Settings | Disabled explanatory control | Preferences schema, account management, organization settings or secret storage. |

Existing deliberately unsupported controls remain unchanged: worktrees, rename/path editing, branch creation, Automations and Settings. This preserves the Phase 1 rule that a disabled control is safer than fake functionality.

## 5. Features that must remain functional

- Creating, selecting, expanding and removing local projects; loading their bounded histories; creating, opening, resuming and deleting threads.
- Codex CLI discovery/bootstrap and all current coding-agent lifecycle behavior: stream output, stop, error display, conversation persistence and resume.
- The default workspace-write permission and Full Access confirmation before escalation.
- Composer text, attachments, local image preview, file references, skill references, models, reasoning levels and error feedback.
- Skills list/search/detail/enable/disable/uninstall/open-folder/create prompt, plus `/` and `@` composer behaviors.
- Git branch listing/search/switch and surfaced switch errors; branch creation remains disabled.
- Electron window drag behavior, keyboard interaction, modals, responsive sidebar behavior and visible unavailable-state explanations.
- Phase 1 memory, output, project-scan and process-stop protections. UI work must not reintroduce eager history refreshes or retain duplicate transcripts.

No existing projects, conversation histories, local Codex data, system Node.js installation, CLI integration or coding agents will be removed or reset.

## 6. Smallest safe implementation sequence

0. **Preflight and approval.** Confirm saved projects in-app; preserve the dirty Phase 1 worktree; resolve the distribution-license question; receive FlutterFlow screenshots and approval of this plan. Do not change runtime behavior in this step.
1. **Characterize the current workspace.** Add or retain smoke coverage around project creation/switching, thread resume, Skills, agent stop, permissions and unavailable controls. Capture reference screenshots only in an isolated Electron profile.
2. **Extract with visual parity.** Separate `CodingWorkspace`, `ProjectThreadSidebar`, shared dialogs and icons from `main.tsx`. Do not alter the current navigation, styles, storage key, preload API or main process. Run tests after each extraction.
3. **Introduce the shell navigation adapter.** Add typed destination state and render the existing Projects/coding workspace as the default active experience. Keep Skills fully functional. Other destinations remain clearly unavailable until their contracts are approved.
4. **Apply approved visual references.** Adjust only shell/layout/component styling supported by FlutterFlow references. Preserve coding-workspace interaction contracts and rerun Electron smoke tests at each visual milestone.
5. **Implement one backed business page at a time.** Begin only after its domain model, persistence, authorization, offline behavior, error states and tests are approved. A Home, Inbox, Teams, Agents or Automations implementation is not part of this UI-foundation authorization.
6. **Reassess architecture before multi-user work.** If Gwira requires shared organizations, people, business records or background agents, design an explicit backend and security model instead of extending local Codex preferences and IPC ad hoc.

Each step should be a small, reviewable local commit on `gwira-development`; no push is required or authorized.

## 7. Required tests and acceptance checks

Before and during every UI increment:

- Run the existing unit suite, typecheck and production build.
- Run Electron smoke tests in a temporary `--user-data-dir`; never point test automation at the user profile or `~/.codex`.
- Regression-test project creation, selection/switching, thread creation, history opening/resume/deletion, error banners and project state persistence without exposing private values.
- Regression-test agent streaming, stop/exit lifecycle, default workspace-write mode and Full Access confirmation.
- Regression-test Skills navigation plus skill search/detail/toggle and composer `/` skill and `@` file references.
- Assert Automations, Settings, worktree, rename/path edit and branch-create controls either work through a real backend or visibly explain why they are unavailable; no silent no-ops.
- Re-run the bounded-history Electron benchmark after changes that alter project/thread rendering, history refresh timing or session state ownership. Include the known unverified rapid repeated-project-selection scenario as a targeted regression before calling it validated.
- Add focused unit tests for any new route/view-state mapping and component tests for keyboard/focus/modal behavior. Add screenshot or visual-regression checks only after the FlutterFlow references define the expected visual output.

Acceptance for the UI foundation is behavioral parity for the coding workspace, no new direct renderer-to-filesystem access, no expansion of Full Access defaults, no user-profile mutation by tests, and no unsupported feature represented as active.

## 8. Risks and dependencies

| Risk or dependency | Effect | Mitigation / decision needed |
|---|---|---|
| Licensing ambiguity | Blocks commercial product distribution | Obtain written rights/attribution clarification and legal review before shipping. |
| Current renderer is a large stateful module | Visual changes can accidentally break CLI/project/session behavior | Extract behind parity tests before introducing the new shell. |
| Local-only project and session state | Cannot safely stand in for shared Gwira business records | Keep it as local coding-workspace state; define a separate business backend before shared features. |
| Current Phase 1 limits | Histories are capped; opened transcripts can still be large; rapid selection stress is not fully validated | Preserve limits, avoid duplicate caches, and add the missing rapid-switch regression before broader UI work. |
| Existing security findings | Unsandboxed Electron, broad path IPC, no CSP, untrusted skills, dependency vulnerabilities and Full Access bypass remain | Treat as release blockers for a customer-facing product; do not hide them with UI changes. |
| No approved data/identity model | Home, Inbox, My Work, Views, Teams, business Agents and Automations cannot be real | Obtain product semantics, tenancy, authorization, retention, audit and offline requirements first. |
| FlutterFlow screenshots not yet supplied | Exact hierarchy and visual acceptance criteria are unknown | Use them as the source of truth before styling the new shell; avoid generic dashboard invention. |
| Dirty Phase 1 worktree | UI work could accidentally overwrite uncommitted stabilization fixes | Preserve it exactly, work incrementally on `gwira-development`, and inspect diffs before each change. |

## Approval requested

Approve this plan and provide the FlutterFlow screenshots plus product decisions for the first real destination to implement. Until then, no Gwira interface, navigation or application-source changes should be made.
