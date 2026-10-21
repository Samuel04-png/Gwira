# Gwira Timeline Research

Research only. No dependencies were installed, no application code changed, nothing was copied from any reference repository, and the original `codex-desktop` was not modified.

## 0. Method, sources and limitations

### Local repositories
`/Users/premierpluspawn/Desktop/Gwira/codex-desktop/timeline_feature` contains **three zip archives, not extracted repositories**. Folder names were not assumed. The zips were extracted to `/tmp/tlref` (outside every repo) and the originals were left untouched. The archives contain no `.git`, so commit hashes come from each zip's archive comment.

| Library | Zip SHA-256 | Version | Commit (zip comment) | License |
|---|---|---|---|---|
| Frappe Gantt (`gantt-master.zip`) | `d8d8fad32f3b88f0526df92340404ad7745f2ccc745a19bdbb92e4d42c566c9f` | 1.2.2 | `5c83708d300a99d9142edea0d4d52f421e3a2e68` | MIT, Frappe Technologies 2024 |
| React Calendar Timeline (`react-calendar-timeline-main.zip`) | `feccd590b568b740ccee3630d808f590af76eef69a941eecb54d65a59bc06932` | 0.30.0-beta.19 | `5190e5e59aa7c271ce0a57f61c104a3bd8e99e8c` | MIT, Marius Andra / Namespace OÜ |
| SVAR React Gantt (`react-gantt-main.zip`) | `51970c16b000ecfecd6ef3b909fb0149f621fc1dc5ac87da93f8eac55ae2e52f` | `@svar-ui/react-gantt` 2.8.1 | `efa2181995407152190296ea1adf4c7b7b0ad881` | MIT (repo), PRO features commercial |

### OpenProject (remote only, GPL-3.0)
Not cloned. Individual files were read via `gh api repos/opf/openproject/contents/<path>?ref=<SHA>`.
**Pinned commit: `873180d41505a3b59ccbecef31c56e44df697e66`** (branch `dev`, committed 2026-10-19T17:58:16Z; latest release seen v17.9.2).
Link pattern: `https://github.com/opf/openproject/blob/873180d41505a3b59ccbecef31c56e44df697e66/<path>`.

### Limitations (reported, not guessed)
1. **SVAR's scheduling engine is not in the archive.** It lives in unbundled packages (`@svar-ui/gantt-store`, `gantt-data-provider`, `grid-store`, `lib-state`, `lib-dom`, `lib-react`). Link path geometry, cycle validation (`api.getLinkValidator()`), and auto-scheduling internals are **unverified**. Only the React UI layer was read.
2. **SVAR contains PRO files in an MIT repo** (`ConflictReport.jsx`, `SCurve.jsx`, `Constraint.jsx`; `whatsnew.md`/`readme.md` label auto-scheduling, constraints, deadlines, progress line and cross-group drag as PRO). Legal review needed before any reuse; assume PRO features are not reusable.
3. **No SVAR tests are in the archive.** Frappe has one test file (date utils). Only React Calendar Timeline has a real test suite (~35 files). Behavior claims for Frappe and SVAR come from source reading, not from running them.
4. **OpenProject: not every file was read.** Read in full: `set_schedule_service.rb`, `schedule_dependency.rb`, `schedule_dependency/dependency.rb`, `schedule_dependency/dependency_graph.rb`, `relation.rb`, `contracts/relations/base_contract.rb` (and create contract header), `contracts/work_packages/update_contract.rb` (permission section only), and `wp-timeline-cell-mouse-handler.ts`. **Listed but not read**: `update_ancestors_service.rb`, `set_attributes_service.rb`, `scheduling_rules.rb` (fetched, only skimmed), project hierarchy models, `WorkPackage.relatable` (the cycle query, referenced by the contract but not opened), and the `set_schedule_service_spec.rb` specs. Conclusions about those are inferred from call sites and marked as such. One fetch (`dependency_graph.rb`) timed out once and succeeded on retry.
5. Nothing was executed. No library was run in a browser.

## 1. Repository architecture findings

### Frappe Gantt 1.2.2
Plain JS + SVG, not React (26 files; `src/index.js` 1636 lines, `bar.js` 753, `arrow.js` 103, `date_utils.js` 307, `defaults.js` 164).
- Single `Gantt` class owns state and DOM. View modes: Hour, Quarter Day, Half Day, Day, Week, Month, Year, each with a `snap_at`.
- Dependencies are comma-separated id strings. `get_all_dependent_tasks` is a cycle-safe BFS.
- `arrow.js` computes link paths as a pure function of bar geometry.
- No ARIA or keyboard support. Only `tests/date_utils.test.js`.
- `setup_tasks` **silently drops** tasks without a start/end, with start after end, or longer than 10 years (`console.error`, `return false`). This contradicts Gwira's Unscheduled-section honesty rule.

### React Calendar Timeline 0.30.0-beta.19
React/TS with interactjs and dayjs peers. Well-factored pure logic in `utility/calendar.tsx` (798 lines): `getMinUnit`, `getVisibleItems` (time-window virtualization), `collision`/`groupStack`/`stackAll`/`stackGroup` (lane stacking), `calculateScrollCanvas`, `getItemDimensions`, `calculateTimeForXPosition`. `Timeline.tsx` (1092 lines) hosts state; `items/Item.tsx` (715) handles pointer interaction.
- Controlled model: drag/resize preview is local state; host callbacks `onItemMove`, `onItemResize`, `onItemDrag` commit.
- `moveResizeValidator(action, item, time, edge)` clamps a time during drag **and** at commit.
- Flags: `canMove`, `canResize`, `canChangeGroup`, `dragSnap` (15 min default), `minResizeWidth` 20.
- Zero ARIA/role/keyboard code. Gwira's Timeline is ahead on accessibility.

### SVAR React Gantt 2.8.1
React UI layer only (`Bars.jsx` 1024, `Chart.jsx` 377, `Gantt.jsx` 386, `Links.jsx` 87; 70+ demos in `demos/cases`).
- Single action bus: `api.exec('update-task' | 'drag-task' | 'add-link' | 'delete-link' | 'select-task' | 'show-editor' | 'zoom-scale' | 'scroll-chart' …)`, with `api.intercept(action, fn)` that can **veto** by returning false (`demos/cases/GanttPreventActions.jsx`).
- Links render in one SVG layer with invisible hitbox polylines.
- Hotkey helper (`helpers/hotkey.js`) is a scoped chain that ignores INPUT/TEXTAREA targets.

### OpenProject (GPL-3.0)
Rails backend, Angular frontend.
- Domain: `WorkPackage` with `start_date`, `due_date`, `duration`, `schedule_manually`, parent/child, and `Relation` (`from`, `to`, `relation_type`, `lag`).
- Scheduling is server-side in `WorkPackages::SetScheduleService` + `ScheduleDependency`; the frontend timeline only renders and proposes date changes.
- Authorization is enforced in contracts (`Relations::BaseContract`, `WorkPackages::UpdateContract`), not in the UI.

## 2. Source-level interaction traces

### 2.1 Bar drag
| Step | Frappe Gantt | React Calendar Timeline | SVAR React Gantt | OpenProject frontend |
|---|---|---|---|---|
| Start | `bar.js`/`index.js` mousedown stores `ox`, `owidth`, `parent_bar_id` | `Item.tsx` interactjs pointer start | `Bars.jsx` `down` finds node and mode (move/start/end) | `wp-timeline-cell-mouse-handler.ts` `workPackageMouseDownFn` (listens for Escape) |
| Threshold | 10 px before counted as a drag | interactjs defaults, `dragSnap` | 20 px dead zone | cursor day computed by `getCursorOffsetInDaysFromLeft` (floor of px / pixelPerDay) |
| Preview | Snapped by `get_snap_position`, skipping `ignored_positions` (weekends/holidays); dependents move by same dx if `move_dependencies` | Local state, `moveResizeValidator` clamps | `drag-task` with `inProgress:true`; clamps min width and 0..`totalWidth` | `applyRendererMoveChanges` updates the bar and labels from the changeset |
| Commit | mouseup → `bar.date_changed()` → `date_change` event; **no validation** | `onItemMove`/`onItemResize` callback, validator applied again | `update-task` with `diff = round(dx / lengthUnitWidth)` (day delta, not pixels) | `deactivate()` → `saveWorkPackage` (server round trip) |
| Cancel | none | none documented | diff 0 → `drag-task inProgress:false`; `ignoreNextClickRef` suppresses click-after-drag | Escape, empty change, or non-working dates → `cancelChange()` |
| After | host persists | host persists | store applies (PRO: auto-schedule) | server `SetScheduleService` reschedules followers; client refetches `filterUpdatedSince` |

OpenProject extras visible in `deactivate`: dates falling on non-working days cancel the change; moving a whole bar with a duration set sends `duration` and clears `dueDate` so the server recomputes; empty cells allow creating dates only if `(wp.isLeaf || wp.scheduleManually) && renderer.canMoveDates(wp)` and the cursor day is working, otherwise cursor `not-allowed`. Parents that are automatically scheduled are not draggable.

### 2.2 Link creation (SVAR)
Click a link handle, then the target handle. Self-links and duplicate (source, target, type) tuples are blocked in the UI; the store validator is applied only when `schedule.auto`. Link type is derived from which handles (start/end) were used. A selected link exposes delete.

### 2.3 Zoom and scroll
- Frappe: upper-tier label follows scroll (`current-upper`); a ←/→ "adjust" button appears when scrolled >100 px past all tasks; `infinite_padding` extends the range on wheel.
- RCT: ctrl/meta/alt + wheel zooms at the pointer; shift scrolls horizontally; `calculateScrollCanvas` rebuilds a buffered canvas only when the visible window nears an edge.
- SVAR: ctrl/meta + wheel, clamped exponential rate (`MAX_ZOOM_RATE`), anchored at pointer, applied in `requestAnimationFrame`.

### 2.4 OpenProject: rescheduling on a date change
1. Client PATCHes the work package (dates or duration).
2. `UpdateContract` checks `edit_work_packages` (or other listed permissions) for the user; attribute-level permissions apply (`default_attribute_permission :edit_work_packages`, `project_id` needs `move_work_packages`).
3. `SetScheduleService` runs only if `start_date`, `due_date`, `parent`/`parent_id` or `schedule_manually` changed.
4. `ScheduleDependency` bulk-loads descendants, predecessors and `follows` relations (avoiding N+1), classifies work packages as moved / moving / unmoving, and builds one `Dependency` per automatically scheduled work package.
5. `DependencyGraph#schedule_order` inserts each dependency after the last one it depends on (predecessors before successors, children before parents). `full_dependencies_of` uses an iterative DFS with a visited set.
6. Followers move **later only as far as needed**: new start = `soonest_start_date` = max over `follows` relations of `successor_soonest_start` (predecessor `due_date || start_date` plus `lag`, in working days), then `soonest_working_day`. Moving earlier does not pull followers back.
7. Parents derive `start_date` = min and `due_date` = max of living descendants (`Dependency#start_date/due_date`).
8. Due date is recomputed from duration in working days and never falls before start.
9. Each automatic change is journaled with `Journal::CausedByWorkPackageRelatedChange` naming the initiating work package.
10. Result lists the altered work packages; the client refetches them.

### 2.5 OpenProject: creating a relation
`Relations::BaseContract` validates: both work packages exist **and are visible to the user**; user holds `manage_work_package_relations` on **both** ends; `relation_type` is in the known set; and, when from/to changed, no circular dependency (`WorkPackage.relatable(...)` returns empty for the target). `Relation` additionally enforces `lag` in ±2000, uniqueness per (`from`, `to`), and normalizes reverse types (e.g. `follows` stored as `precedes` with swapped ends) in `before_validation :reverse_if_needed`. (`relatable` itself was not opened; its cycle semantics are inferred from the call site.)

## 3. Feature comparison

| Capability | Frappe | RCT | SVAR (MIT part) | OpenProject | Gwira Timeline today |
|---|---|---|---|---|---|
| Day/Week/Month zoom | Yes (+ more) | Yes, wheel zoom | Yes | Yes | Yes (day 40 / week 14 / month 4.5 px per day) |
| Sticky left task column | No | Yes (sidebar) | Grid | Table | Yes |
| Sticky upper date label | Yes | Partial | Unverified | Yes | **No** (known limitation) |
| Jump back to tasks | Yes | No | Scroll API | Today only | Today button |
| Task without dates | **Dropped** | n/a | Unverified | Placeholder row | **Unscheduled section** (better) |
| Deadline/milestone markers | No | Custom markers | Milestones | Milestone renderer | Yes |
| Today line | No (highlight) | TodayMarker | Markers | Yes | Yes |
| Lane stacking for parallel work | No | **Yes** | No | No | No (one row per task) |
| Dependency arrows | Yes | No | Yes (SVG layer) | Yes | **No** (tooltip text only) |
| Cycle prevention | BFS for traversal only | n/a | Validator in unbundled store (unverified) | **Contract-level** | Dependency data exists; not enforced in Timeline |
| Drag/resize | Yes, unvalidated | Yes, validator hook | Yes, intercept/veto | Yes, server validated | **Intentionally disabled** |
| Auto-scheduling | Move dependents by dx | No | PRO only | **Server, forward-only, buffered** | No |
| Working-day awareness | Ignored positions | No | PRO calendars | Yes | No |
| Virtualization | No | Time-window | Unverified | Table virtualization | No |
| Keyboard access | None | None | Hotkey chain | Escape cancel | **Row navigation + keyboard** |
| ARIA | None | None | Unverified | Partial | Yes |
| Authorization | None | None | None | **Server contracts** | None (local only; M1 Apply disabled) |
| Audit of changes | None | None | None | **Journals with cause** | None for dates |

## 4. Reusable components and license checks

| Candidate | License | Reuse verdict |
|---|---|---|
| Frappe Gantt (entire) | MIT | Not recommended: vanilla DOM, drops undated tasks, no a11y, would fight Gwira's React/CSS. Ideas only. |
| RCT `utility/calendar.tsx` stacking and visible-window logic | MIT | Concept reuse is safe. Code reuse is permitted with attribution (keep the MIT notice), but Gwira already has its own `timelineModel`; re-implementing the small pure functions with tests is preferable. |
| RCT whole component | MIT | Not recommended: no a11y, own scroll model, interactjs dependency. |
| SVAR MIT core UI | MIT, with PRO caveat | Not recommended as a dependency: the engine is external, PRO files sit in the tree, and it would replace Gwira's honest-data model. Patterns (action bus + intercept) are reusable as concepts. |
| OpenProject | **GPL-3.0** | Concepts and behavior only. Copying code or close translation would impose GPL obligations on Gwira. Write independently from the behavioral description. |

Any adopted MIT code needs its license text retained. No dependency should be added without explicit approval.

## 5. OpenProject business-logic analysis (with reasoning)

| Rule | Where | Why it exists | Gwira application |
|---|---|---|---|
| Followers move later only as needed | [`set_schedule_service.rb`](https://github.com/opf/openproject/blob/873180d41505a3b59ccbecef31c56e44df697e66/app/services/work_packages/set_schedule_service.rb) | Preserves buffers people planned; moving earlier would silently pull in commitments | Forward-only propagation; never auto-pull earlier |
| Soonest start = max(predecessor end + lag) | [`relation.rb`](https://github.com/opf/openproject/blob/873180d41505a3b59ccbecef31c56e44df697e66/app/models/relation.rb) `successor_soonest_start` | A task with several predecessors cannot start before the latest | Needed once Gwira has start dates |
| Lag bounded ±2000 | `Relation::MAX_LAG` | Prevents absurd values | Bound any lag field |
| Topological order, visited sets | [`schedule_dependency/dependency_graph.rb`](https://github.com/opf/openproject/blob/873180d41505a3b59ccbecef31c56e44df697e66/app/services/work_packages/schedule_dependency/dependency_graph.rb) | Deterministic result and cycle safety | Reuse the idea in `timelineModel` (pure, tested) |
| Bulk preloading | [`schedule_dependency.rb`](https://github.com/opf/openproject/blob/873180d41505a3b59ccbecef31c56e44df697e66/app/services/work_packages/schedule_dependency.rb) | Avoids N+1 queries | Load task graph once per mutation |
| Parent dates derived from children | [`schedule_dependency/dependency.rb`](https://github.com/opf/openproject/blob/873180d41505a3b59ccbecef31c56e44df697e66/app/services/work_packages/schedule_dependency/dependency.rb) | One source of truth for rollups | Objective/project ranges derived, not stored |
| Manual vs automatic scheduling | `schedule_manually` | Lets people opt out of automation; leaf with no predecessors is manual | Add an explicit manual flag before any automation |
| Duration in working days | `WorkPackages::Shared::Days` | Business calendars | Needed only if Gwira adds working calendars |
| Journal cause for automatic changes | `Journal::CausedByWorkPackageRelatedChange` | Explains why a date moved | Aligns with Gwira's audit requirement from M1 |
| Cycle check at relation creation, both ends visible and manageable | [`contracts/relations/base_contract.rb`](https://github.com/opf/openproject/blob/873180d41505a3b59ccbecef31c56e44df697e66/app/contracts/relations/base_contract.rb) | Prevents data corruption and information leaks | Matches M1 org/owner validation: enforce server-side |
| Authorization in contracts, per attribute | [`contracts/work_packages/update_contract.rb`](https://github.com/opf/openproject/blob/873180d41505a3b59ccbecef31c56e44df697e66/app/contracts/work_packages/update_contract.rb) | UI cannot be trusted | Same model as M1 Gwira Core apply |
| Client cancels invalid drags (non-working days, Escape) | [`wp-timeline-cell-mouse-handler.ts`](https://github.com/opf/openproject/blob/873180d41505a3b59ccbecef31c56e44df697e66/frontend/src/app/features/work-packages/components/wp-table/timeline/cells/wp-timeline-cell-mouse-handler.ts) | Fast feedback; server remains authority | Keep client validation advisory only |

Not verified: the exact `WorkPackage.relatable` cycle query, project-hierarchy permission inheritance, `update_ancestors_service`, and the spec files (see Section 0).

## 6. Recommended Gwira Timeline improvements

Ordered by value versus risk. Items 1 to 5 need no new data and no mutation.

1. **Sticky month/year label** that follows horizontal scroll (Frappe pattern). Fixes the known limitation.
2. **"Back to tasks" affordance** when scrolled far from any task (Frappe pattern), alongside Today.
3. **Owner-grouped lane stacking** so parallel agent runs for one owner do not require one row each (RCT `groupStack` idea); pure, tested helper in `timelineModel`.
4. **Dependency link layer** (SVG, with hit areas), drawn only for recorded `dependsOnTaskIds` (SVAR/Frappe approach; arrow path as a pure function of bar positions). Show cycles or missing targets as a warning, never fabricate links.
5. **Time-window virtualization** for large workspaces (RCT `getVisibleItems`).
6. **Keyboard and a11y parity for new features** (already stronger than all three libraries; keep it).
7. **Drag with dead zone, day-delta snapping, `ignoreNextClick`, Escape-cancel** (SVAR/OpenProject patterns), emitting through **one mutation action with an intercept** (SVAR idea). Remains disabled until the founder decisions below.
8. **Forward-only propagation, topological order, cycle rejection** as a pure model function that returns a *proposal* (list of date changes plus reasons), which fits M1's PlanProposal model. Not applied automatically.

Do not adopt: Frappe's silent dropping of undated tasks; any auto-scheduling that writes without authorization and audit; PRO-only SVAR features.

## 7. Step-by-step implementation plan

**Gate A, founder decisions (blocking for steps 7 and 8):**
- Add a task `startDate` (and optionally `schedule_manually`)? Without it, human tasks can only be deadline markers and bars come only from agent runs.
- Date mutations must go through a shared mutation path with server-side authorization, versioning, and audit (M1 contracts). Confirm that path before drag is enabled.
- Working-day calendars: in scope or not.

**Phase T1, pure model (no UI change, no mutation)**
1. Add tested helpers to `timelineModel`: lane stacking, visible-window, link geometry, topological order with visited sets, cycle detection.
2. Unit tests for edge cases: self-dependency, missing targets, cycles, duplicate links, tasks without dates.

**Phase T2, read-only UI**
3. Sticky upper label and back-to-tasks button.
4. Owner lane stacking.
5. Dependency link layer with accessible description and selection.
6. Virtualization behind a size threshold.
7. Re-run the Timeline capture suite, typecheck, tests, build, smoke at 1280×800 and 1440×900.

**Phase T3, propagation proposals (after Gate A)**
8. Forward-only propagation function returning a proposal with reasons.
9. Preview UI showing affected tasks; Apply stays disabled.

**Phase T4, mutation (after Gate A and server contracts)**
10. Single `timeline.updateDates` action with intercept hook, version check, authorization, audit entry carrying the initiating task (journal cause).
11. Drag/resize with dead zone, snapping, Escape cancel; client validation advisory only; server authority.

## 8. Lessons for List, Calendar and Board

- **One shared date/range/ownership model.** Timeline, Calendar and List all need the same answer to "when does this task occur"; keep it in a single pure module and never let a view invent dates.
- **One mutation action bus with intercept**: Board status drops, Calendar date drags and Timeline resizes should call the same authorized action (SVAR's `exec`/`intercept`; OpenProject's contract).
- **Board:** reuse the rule "client cancels, server decides"; status transitions are validated like OpenProject's workflow/status checks (not read in detail).
- **Calendar:** reuse day-delta commits and Escape cancel; reuse the Unscheduled tray pattern from Timeline.
- **List:** reuse derived rollups (parent/objective dates from children) and the same filter/group preferences model.
- **Cross-view:** shared hotkey scoping (ignore inputs), shared selection through the existing inspector request path.

## 9. Open questions for the founder
1. Add `startDate` / `schedule_manually` to the task domain?
2. Is forward-only propagation the desired policy (OpenProject's behavior)?
3. Should lag and working-day calendars be modeled?
4. Approve phases T1 and T2 (read-only, no new dependencies) now, and defer T3/T4 until server contracts are ready?

Stopped here, awaiting approval.
