# Gwira — Codex handoff (read this first)

Last updated: 2026-10-21. Branch: `m1-safe-planproposals`. Written so a new Codex session can continue without the prior chat history.

## 1. What Gwira is

Gwira is a local-first Electron + React desktop app for running a business with people and **Doats** (AI workers). It is built on top of the Codex Desktop coding-agent shell. It coordinates tasks, approvals, workflow handoffs, knowledge and integrations.

- Business state is **local prototype storage** (renderer localStorage, `gwira.local-prototype.v1`). It is not a durable multi-tenant platform yet.
- Doat coding work is correlated to local coding-agent sessions through `AgentRun` metadata. The existing local coding-agent functionality must keep working.
- There are two surfaces: **Home** (Codex-style conversations and projects) and **Dashboard/business** (Dashboard, Inbox, My Work, Library, Views, Teams, Doats).

## 2. Hard rules (never break without explicit founder approval)

1. Work only in the isolated worktree `codex-desktop-m1-safe-planproposals`. Never modify the original `codex-desktop` folder.
2. **M1 Apply stays disabled.** Do not change the M1 authorization or persistence contracts (`src/renderer/gwira/proposals`, `tests/gwira/planProposal*.test.ts`).
3. No Supabase or other server connection. No agent execution. No automatic scheduling.
4. No database migrations.
5. Do not begin M2, T3, T4 or the List view until the founder approves its plan.
6. Do not redesign the **global top bar, Home sidebar or Dashboard sidebar**. There are intentionally TWO contextual sidebars inside ONE shared shell. Do not unify them again (this was a past mistake).
7. **Never invent data**: no invented task dates, durations, owners, dependencies, or agent activity in real workspaces. Dev fixtures and demos are dev-only (`import.meta.env.DEV`) and must never be written to a real workspace.
8. Do not copy OpenProject (GPL-3.0) code. Do not import PRO-only SVAR functionality. Study behaviour only.
9. Do not remove existing features. Do not touch provider credentials. Do not silently replace a user's selected model.
10. Do not merge, reset, stash, clean or delete anything unless told to.

## 3. How we work (every task)

1. **Investigate first.** Read the existing code, trace the real cause, and distinguish *verified* facts from assumptions. Do not trust earlier reports; verify them.
2. **Reuse.** Read existing shell, sidebar, tokens, icons and persistence before writing code. No parallel systems or second state models (see `AGENTS.md`).
3. **Minimal, surgical changes.** Fix confirmed defects only. No redesign of unrelated pages.
4. **Test everything new.** Vitest runs in node (no jsdom), so UI behaviour is verified through the Electron capture harness; wording and wiring through source-text tests.
5. **Verify in the real Electron app** from the worktree being modified, at 1440×900, 1280×800 and a narrow size (900×700 or 780×640). Screenshots are saved under `artifacts/workflow/<suite>/`.
6. **Report honestly:** what passed, what failed, what remains. Never claim a check passed without evidence. Record measurements separately from relaxed regression thresholds.
7. **Stop for founder approval** at the end of each milestone. Frontend work is built page by page (Workflow, Timeline, then List, Calendar, Board); visual refinement comes after all views exist.

### Commands
```
npm run typecheck
npm test                     # vitest run
npm run build
npm run capture:timeline     # Electron harness, ~2 min; ELECTRON_WORKFLOW_CAPTURE_TIMEOUT_MS=90000
npm run capture:shell
node scripts/electron-smoke.mjs   # silent on success
ELECTRON_WORKFLOW_CAPTURE_ONLY=<scenario> npm run capture:timeline   # one scenario
```
Do not run `npm install` unless dependencies change. The Node version in use is a v26 alpha, so npm prints warnings that can be ignored.

Last known state: typecheck, build, 303 tests, `capture:timeline`, `capture:shell` and smoke all passing.

## 4. What has been done (in order)

1. **M1 Safe PlanProposals** (typed proposals, validation, ownership, expiry, idempotent apply, version-aware undo, audit). Independently reviewed, then fixed. Apply remains disabled until server-side authorization and persistence exist. See `REVIEW-M1.md` (section 7).
2. **F1** workflow canvas redesign on the existing React Flow (`@xyflow/react`) implementation.
3. **F3/F4.1 global shell:** one top bar with tabs (Back/Forward, sidebar toggle, tabs, new tab, search, notifications, inspector toggle) and one workspace shell. The sidebars were briefly merged into one and then **restored to two contextual sidebars** (Home and Business) at the founder's request.
4. **F2 Timeline** as a sibling of Workflow, List, Calendar and Board inside Dashboard (not a separate route).
5. **Timeline research** (`docs/gwira/research/timeline/TIMELINE-RESEARCH.md`): SVAR React Gantt, Frappe Gantt, React Calendar Timeline (local zips) and OpenProject (remote files only, pinned SHA).
6. **T1** (usability: resizable sticky name column, sticky headers, tooltips, container-query responsiveness, return-to-tasks) and **T2** (planned vs actual dates, owner grouping and occupancy, verified dependency links, dependency inspection strip, row windowing above 150 rows).
7. **Timeline closing fixes:** dependency conflict warning only when both anchors are firm, named "Possible scheduling overlap"; the legend reports undrawn dependencies; measured performance saved in `artifacts/workflow/timeline/timeline-large-measurements.json`, separate from the relaxed test limits.
8. **Manual-testing fixes:** dev dataset selector now includes the dated Timeline fixture and the 1,600-task stress fixture; filter strip with chips, "Showing N of M" and a hidden-attention warning; filter popover clamped inside the pane; "Hide details" button in narrow panes (reuses the existing inspector toggle); workspace heading wraps; unavailable-model recovery buttons in the error banner (`main.tsx`).

## 5. Product decisions already made

- Tasks have optional start/end dates. **Due dates stay separate from scheduled durations.**
- Default scheduling is **manual**. Planned forward-only dependency propagation is a *future proposal feature* (T3/T4), not built. Lag, working calendars, automatic rescheduling and production mutations are deferred.
- Date-changing drag interactions on Timeline are disabled until a shared, verified mutation path exists.
- The Morning Operations, Marketing Campaign and Problem & Recovery demos have no dates **by design**; Timeline correctly shows them as Unscheduled.
- A task with unknown dependency type gets "Possible scheduling overlap", never a hard "conflict".
- The recorded model of a conversation is immutable history. If the provider no longer offers it, the user chooses an available model explicitly.

## 6. Thought process to keep

- Gwira is a business tool. Authority comes from the server, so local UI checks are not authorization.
- Honest empty states beat convincing fake data.
- Prefer proven designs (Linear, Asana, Codex) in a restrained style: white surfaces, thin dividers, compact rows, square avatars for humans and Doats, no gradients or decorative AI icons.
- Measure before adding complexity (virtualization was added only after measurement).
- Make a change small enough that the founder can review it visually.

## 7. What to read, in order

1. This file.
2. `AGENTS.md` (UI work standards and Canvas/Graph UI standards; mandatory for UI tasks).
3. `docs/gwira/workflow-spec.md`, `docs/gwira/FEATURE_STATUS.md`, `docs/gwira/DOAT_SYSTEM_ARCHITECTURE.md`.
4. `docs/gwira/research/timeline/TIMELINE-RESEARCH.md` for Timeline and later List/Calendar/Board decisions.
5. Code map:
   - `src/renderer/main.tsx`: shell, routing, Home, tabs, model selection.
   - `src/renderer/gwira/dashboard/DashboardPage.tsx`: Dashboard view tabs, dev data selector.
   - `src/renderer/gwira/graph/`: workflow canvas, `workflowFixtures.ts`, `freshBlendDemo.ts`.
   - `src/renderer/gwira/timeline/`: `timelineModel.ts` (pure model), `TimelineView.tsx`, `timeline.css`.
   - `src/renderer/gwira/proposals/`: M1 (do not change contracts).
   - `src/main/main.ts`: Electron main; contains the embedded capture script.
   - `scripts/capture-workflow-f1.mjs`: capture scenarios and assertions.
   - `tests/gwira/timelineModel.test.ts`, `tests/contextualSidebars.test.ts`, `tests/workspaceTabs.test.ts`: regression tests.
6. **Planning documents (local only, git-ignored):** `/Users/premierpluspawn/Desktop/Gwira/codex-desktop/workflow_feature/_gwira_instructions/workflow_feature/_gwira/`
   - `STATUS.md`, `CODEX_HANDOFF_REVIEW.md`
   - `03_plan/PLAN.md`, `RISKS.md`, `SPEC_CONFLICTS.md`, `TEST_STRATEGY.md`, `ADR-001` to `ADR-008`
   - `05_review/REVIEW-M1.md`

   These are not in GitHub (`/workflow_feature/` is in `.gitignore`). Read them from the local path above.

## 8. What comes next (not started; needs founder approval of a plan first)

- **List view**: plan the design and functionality first, then build. Then Calendar and Board.
- Timeline T3/T4 (dependency propagation as proposals, mutations through a verified shared path).
- Later: Supabase and server-side authorization, enabling M1 Apply.

## 9. Known limitations

- At 900×700 with the inspector open, the Timeline pane is about 236px wide; use "Hide details".
- The model-recovery banner is covered by a source-level test only, not by an Electron interaction test.
- The M1 Apply path is modeled and tested locally only; it is not production-ready.
