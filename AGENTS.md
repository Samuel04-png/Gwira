## START HERE

Before any task, read [docs/gwira/CODEX_HANDOFF.md](docs/gwira/CODEX_HANDOFF.md). It explains what Gwira is, what has been built, the hard safety rules (Apply disabled, no Supabase, two sidebars, no invented data, work only in this worktree), how we work on each task, and which documents to read for full context.

## UI work standards (apply to every UI task)

### Before you write code

- Read the existing shell, sidebar, token and icon files first. Reuse components, tokens, icons, menu primitives and persistence utilities. Do not create parallel systems.
- Post a short plan: files you will touch, components you will reuse, anything ambiguous. If an ambiguity changes the design, stop and ask. Otherwise pick the simplest option and record the decision in the final report.

### Definition of done

A UI task is not done until all of these are true:

1. Every visible control works or is not rendered. No dead buttons, no placeholder text, no TODO comments, no lorem ipsum, and no new console errors or warnings.
2. A feature that depends on something unbuilt is rendered disabled with a tooltip that says exactly what is missing, or it is not rendered. "Coming soon" alone is not acceptable.
3. Every interactive element has default, hover, focus-visible, pressed, selected and disabled states. Every list also has loading, empty, error and overflow states (long text, 50+ items).
4. Everything is reachable by keyboard: Tab / Shift+Tab to move, Enter / Space to activate, Esc to close popovers, arrow keys inside menus and lists. Focus returns to the trigger after a menu or dialog closes.
5. You have taken screenshots from the running app at 1280x800, 1440x900 and the minimum window size, covering default, hover, focus, selected, empty and overflow states. Look at them and fix what is wrong before reporting.
6. Typecheck, lint and existing tests pass. New tests cover logic (sorting, counts, persistence), not markup.

### Visual rules

- One type scale: 11 / 12 / 13 / 15 / 20 px. Body text is 13px. Use tabular numerals for counts and times.
- Spacing on a 4px grid, taken from tokens. If no token exists, add one. Do not inline arbitrary pixel values.
- Colour is near-monochrome. The accent is for links and selection only. Red means failed or destructive. Amber means waiting on a human. Never convey state by colour alone.
- Secondary text must have at least 7:1 contrast against its background.
- No gradients, glows, shadow cards, emoji, decorative illustrations or sparkle icons.
- Borders are 1px hairlines. Separate groups with space first and dividers second.
- Icons: the existing icon set at 16px with a 1.5px stroke. Prefer text labels for primary actions.
- Radii: reuse existing tokens. Interactive rows use 8px.
- Motion: 150ms or less, ease-out, for hover and expand. No motion for data updates. Respect prefers-reduced-motion.

### Interaction rules

- Hover reveals secondary actions, and their space is always reserved so nothing shifts.
- Lists never reorder under the pointer. Re-sort only on explicit events, and queue any other reorder until the pointer leaves the list.
- Destructive or irreversible actions need a confirmation or an undo window of at least 10 seconds.
- Every async action gives immediate feedback, then either success or a specific error with a next step.
- Write plain language: say what happened and what to do next. Never show a raw error code as the only message.

### Data rules

- Production UI renders real data only. Never hardcode names, counts, messages or states.
- For visual verification, use dev-only fixtures behind a flag that is excluded from production builds. Fixtures must cover: empty, one item, 50+ items, very long names, unread, failed, and offline.

### Final report (required)

List: files changed; every new control and its status (working / disabled with reason / not built); decisions you made on ambiguities; known gaps; screenshot paths; commands run and their results.

## Canvas and Graph UI Standards

### 1. Architecture

- Use the existing `@xyflow/react` installation for nodes, edges, viewport controls, panning, zooming, and selection.
- Reuse the installed `dagre` layout implementation. Do not install `@dagrejs/dagre` as a duplicate.
- Reuse `graphModel.ts`, `GraphNode.tsx`, and the existing graph model tests.
- Separate graph data transformation from React rendering.
- Keep business records separate from graphical presentation.
- Never infer workflow dependencies from timestamps or visual proximity.
- Every connection must represent an explicit relationship from source records.
- Nodes and edges must have stable identifiers.
- Never persist derived execution status or computed progress.

### 2. Canvas design

The Dashboard consists of:

1. Existing left navigation and sidebar.
2. Central Visual Workflow Canvas.
3. Persistent contextual right panel on desktop.
4. Compact Ask Gwira command interface at the bottom of the canvas.

The right panel has two modes:

DEFAULT:
Shows workers, their current work, and recent company activity.

SELECTED:
Shows details of the selected employee, Doat, task, workflow, approval, or connection.

Keep these areas visually consistent with Gwira's existing design system.

### 3. Visual quality

- Follow the existing light theme.
- Use restrained typography, spacing, and colors.
- Use subtle dotted canvas backgrounds.
- Prefer clean nodes and thin connectors.
- Do not add gradients, glowing effects, decorative robot icons, unnecessary statistics cards, or oversized controls.
- Use a consistent 4px spacing system.
- Use existing typography and icon primitives.
- Match Linear's visual precision and n8n's graph interaction quality.
- Every hover interaction must be intentional.
- No visual element should shift unexpectedly when hovered.
- Never place controls outside their intended parent boundaries.

### 4. Graph performance

- Memoize custom nodes and edges where appropriate.
- Avoid subscribing every node component to viewport changes.
- Keep viewport updates separate from unrelated business-state updates.
- Avoid rebuilding the entire graph during simple pan or zoom interactions.
- Use stable callbacks, selectors, and graph element identities.
- Test 5, 50, and 200 nodes.
- Record observed performance when panning and zooming a graph with 200 nodes.
- Do not invent FPS measurements.

### 5. Persistence

- Persist node positions and viewport per workflow or scope where required.
- Do not persist temporary hover or selection states unless specifically required.
- Changes to visual node positions must not mutate business task ownership or dependencies.
- Provide a reliable reset-layout or auto-arrange action.
- Handle deleted or unavailable nodes safely.

### 6. Data integrity

- Production must display real application records only.
- Development fixtures must be explicitly isolated.
- Never display fixture data as live company activity.
- If relationships are unavailable, display unlinked records without fabricated edges.
- Human employees have reported activity, not invented live status.
- Doat execution state must come from actual recorded runs.
- Never invent agent actions, explanations, approvals, or outputs.

### 7. Accessibility

- Every canvas feature must have a keyboard-accessible equivalent.
- The right panel must provide an accessible list of visible workers and workflows.
- Nodes require meaningful accessible names.
- Focus must remain visible.
- Escape must close contextual details when appropriate.
- Support reduced-motion preferences.
- Do not rely on color alone to indicate status.

### 8. Interaction safety

- Viewing and selecting nodes must never mutate business records.
- No automatic workflow editing, task reassignment, or dependency creation without explicit authorization.
- Approval actions must use existing permission checks.
- Stop and Pause controls must be connected to real execution APIs.
- Irreversible actions require appropriate confirmation.

### 9. Visual verification

Before declaring a milestone complete:

- Launch the actual Electron application.
- Verify the correct Dashboard route.
- Capture screenshots at 1280×800 and 1440×900.
- Test the minimum supported window size.
- For canvas tasks, test zoom at 25%, 100%, and 200%.
- Test long titles, disconnected nodes, branching graphs, and multiple states.
- Compare Home and the sidebar against baseline screenshots.
- Run typecheck, relevant tests, and Electron smoke tests.
- Report any skipped or unavailable checks.

### 10. Development scope

- Implement only the current milestone.
- Do not implement later milestones early.
- Do not redesign the global shell or Home.
- Do not delete conversation history.
- Do not add unnecessary dependencies.
- Do not push to GitHub.
- Do not claim a feature works unless it has been verified.

### 11. Final report

Every implementation task must report:

1. Files changed.
2. Features implemented.
3. Real data sources used.
4. Functionality not yet available.
5. Verification performed.
6. Screenshot paths.
7. Known issues and their severity.
