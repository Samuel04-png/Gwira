# Gwira Workflow: node system, drill-down and fixes

Place at `docs/product/dashboard-workflow-nodes-spec.md`. It extends `dashboard-workflow-spec.md`. Where the two disagree, this file wins.

---

## F1 approved visual model

The Stage 1 product decision supersedes this document's older Step-only node taxonomy and the related T1-T5 implementation prompts. The Dashboard canvas presents four visual work concepts:

- **Objective:** a labeled objective context card above the graph. It summarizes a recorded objective; objective membership does not create task-to-task edges.
- **Human work:** an assigned task with the employee's identity shown as a square avatar.
- **Doat work:** an assigned task with the Doat's identity shown as a square avatar. A run is metadata for the work item, not a separate execution node.
- **Approval:** a recorded approval associated with a specific task. Its gate is connected only to that exact task.

Handoff edges are created only from recorded task dependencies. Missing references are ignored rather than inferred. Run logs, tool calls, and detailed activity belong in the selected-work inspector and are shown only when the local provider has recorded them. These are visual semantics; they do not add Apply behavior or authorize any work to run.

---

## 1. What is wrong with the current screen

| # | What I see | Why it hurts | Fix |
|---|---|---|---|
| 1 | At 45% zoom the graph is clipped on the right while the left, top and bottom are empty | The initial fit ran before nodes were measured | Fit after layout and after node measurement (`useNodesInitialized`). Padding 48px |
| 2 | The objective node sends a line to every step. Six lines leave one handle and collide | A *contains* relationship is drawn as a *handoff* | Containment is never an edge. The objective becomes a header (section 3) |
| 3 | Curved lines overlap, have no arrows, and one runs off-screen | Default bezier edges with no spacing rules | `smoothstep` edges, rounded corners, shared trunk lines (section 5) |
| 4 | Text is about 8px | The canvas only scales; it never changes representation | Semantic zoom: below 60% switch to a compact node (section 6) |
| 5 | Titles are truncated, and the state appears twice ("completed" in the subtitle and "Completed" below) | Too much text for the width, with no hierarchy | One title (2 lines), one meta line, a glyph for state |
| 6 | Doat, person and objective nodes look the same | Type is only readable from the subtitle | Identity mark: square for Doats, circle for people (section 4) |
| 7 | Completed and working nodes look identical | You can't see what's live | Completed recedes, working stands out (section 4) |
| 8 | The canvas sits in a bordered card, the title is 28px, and the scope picker is an unstyled native select | Looks like a dashboard template and wastes space | Full-bleed canvas, 15px title, styled menu |
| 9 | Right panel: 3-line rows, large type, "Others" group, "Just now" on everything | Inconsistent with the 13px scale, and the fixture's noise shows | Section 8 |
| 10 | Four disabled tabs, plus "Fit" and "Reset" doing nearly the same thing | Dead controls invite clicks | Show only built tabs. One "Fit" button |

What is already right: the Team and Activity panel structure, the Needs attention grouping, the dotted canvas, the zoom control, and the dev-fixture label.

## 2. The root problem: nobody decided what a node is

Three different ideas are mixed together: your sketch has worker nodes (Agent, Employee), Codex built task nodes, and the right panel is worker-based. A graph can't be clean until this is fixed.

| Option | Nodes | Edges | Verdict |
|---|---|---|---|
| A. Worker graph | People and Doats | handoffs | One worker does many steps, so lines multiply and sequence is lost |
| B. Task graph | Steps of work | dependencies | Clean sequence, but loses the "who" you sketched |
| **C. Steps with an owner (recommended)** | Steps, each with one owner | handoffs | Clean sequence **and** the owner is the node's visual anchor |

**Decision: C.** The "Doat node" and "Employee node" are one Step component with a different identity mark. The right panel stays worker-based and links to steps (a worker with 3 steps highlights 3 nodes).

Hierarchy (one level on the canvas at a time):
```
Company > Objective > Step > Sub-step
```
- Objective: a header above the canvas, not a node.
- Step: a node.
- Approval: a kind of step.
- Outputs (deliverables): shown as "1 output" in the node's meta and listed in the panel. Not nodes in phase 1.
- Sub-step: what is inside a step (section 7).

## 3. Objective header

Pinned top-left inside the canvas, no card or fill:
- Line 1: objective title, 15px/600.
- Line 2: "On track · 3 of 6 steps done · Due Sat" (12px, #595959), with owner avatars (20px) on the right.
- Health is plain text. "At risk" and "Blocked" use the amber and red text rules from section 4.
- Inside a step, the breadcrumb replaces this header (section 7).

## 4. Step node

Reference: Linear's restraint, n8n's handles and labels. **Not** the dark, glowing mockups (see section 9).

Size 240px wide, height from content (at least 64px). 8px radius, 1px border `#D9D6CF`, white fill, **no shadow**.

```
┌──────────────────────────────────────┐
│ [■]  Draft promotion content      ◔ │   mark 28px | title 13/500, 2 lines max | state glyph 14px
│      Marketing Doat · Step 2 of 5    │   meta 12px #595959: owner · state phrase
│                         ⧉ 5 steps    │   only when it has inner steps (11px)
└──────────────────────────────────────┘
```

- **Mark:** Doat is a rounded-square generated mark. Person is a circle (photo or monogram). Same 28px.
- **Meta line:** "{Owner} · {state phrase}". Examples: "Marketing Doat · Step 2 of 5", "Chipo Zulu · Reported 2h ago", "Sarah Mwila · Waiting for approval". State is written once, here.
- **Glyph:** one glyph, no text next to it, no pill.
- **Inner-steps count:** "5 steps" with a small stacked-layers icon. This is the cue that the node can be opened, the same idea as Airflow's "+2 tasks" count on a group.
- **Handles:** 8px rings on the left (in) and right (out). Visible on hover and selection.
- **Approval step:** same card plus a small label "Approval" (11px/500, uppercase, 0.04em) above the title. Title reads "Approve: {action}". Meta shows the reviewer and how long it has waited.

| State | Glyph | Treatment |
|---|---|---|
| Done | check | Text #595959, border `#E6E3DC`. It recedes |
| Working | slow arc | Ink border. Static under reduced motion |
| Waiting on a human | half-filled amber circle | 3px amber bar inside the left edge |
| Pending (not started) | dashed hollow circle | Dashed border `#C9C6BE`, muted title |
| Blocked | hollow circle | Meta in red: "Blocked by {step}" |
| Failed | red square | 3px red bar inside the left edge. Meta: "Failed · {short reason}" |
| Paused | hollow gray circle | Normal border |

Color is only for the two exceptions: amber (waiting on a human) and red (failed or blocked). Every state also has a glyph and text.

| Display state | Appearance |
|---|---|
| Hover | border `#B9B6AE`, handles visible |
| Selected | 2px ink border with a 3px white gap |
| Dimmed | 35% opacity |
| Focus-visible | same ring as selected, plus a 2px offset |

## 5. Edges and layout

- **Edge = handoff only.** One step's output feeds another step.
- Type: `smoothstep`, `borderRadius: 8`, `offset: 24`, so edges leaving the same step bend at the same x and share a trunk line.
- Stroke 1.5px with an 8px arrowhead at the target.
- Fan-out or fan-in above 4 edges: insert a small fork/join dot (10px, hairline ring) instead of drawing 5 lines into one handle.

| Edge state | Style |
|---|---|
| Work has passed | solid `#8F8C84` |
| Active (downstream working) | solid ink, slow moving dash |
| Next (downstream pending) | dashed `#C9C6BE` |
| Waiting on a human | amber, chip "Waiting 14m" |
| Blocked or failed | red, chip "Blocked 2 days" |

Chips are always shown for the last two. For others, the chip with the work item's name ("Campaign research summary") appears on hover and selection.

**Layout:**
- `@dagrejs/dagre`, left to right, `nodesep 24`, `ranksep 72`, using **measured** node sizes.
- Re-run layout only when the structure changes, never when a state changes.
- **Automatic layout only in phase 1.** Remove node dragging. Dragging plus auto-layout plus persisted positions is how graphs get messy, and a supervision map doesn't need it.
- React Flow's docs say only ELK offers edge routing, but it is the most complex option and a much larger bundle. Try it only if smoothstep trunks still tangle above about 30 nodes.
- Phase 2: "Group by worker" swimlanes. Y is the worker's lane and X is the dagre rank. It is a layout change only, using the same data.

## 6. Fit and semantic zoom

**Fit:** runs after layout and measurement. Padding 48px. If the graph would need less than 60%, fit to the first rank and the first problem node instead, and show "Showing 12 of 40 steps · Fit all". Remember the viewport per objective and per path.

**Zoom levels** (switch the representation, don't just scale):
| Zoom | Representation |
|---|---|
| 80% and up | Full node |
| 50% to 80% | Compact: mark, title on one line, glyph |
| Below 50% | Dot: mark only, with the objective title kept in the header |

Crossfade between levels in 150ms. Under reduced motion, switch instantly. Selected, waiting and failed nodes stay one level more detailed than the rest, so problems stay readable when zoomed out.

## 7. Drill-down: open a step

Double-click (or double-tap, or Enter on a focused node, or "Open steps" in the panel) enters the step. Single click only selects. Don't add a click delay.

**Why navigate into it, not expand in place:**
- React Flow sub flows put children inside a parent, but dagre layout breaks when sub-flow nodes connect to nodes outside, and only ELK handles it.
- Expanding in place pushes siblings around and loses the mental map.
- A nested level keeps the main graph readable, which is what Dagster says nested graphs are for.

**What you see:**
- Transition within 200ms: the node grows to fill the canvas, its inner steps fade in. Under reduced motion it is a crossfade.
- The breadcrumb replaces the objective header: `Marketing Campaign › Draft promotion content`. Every segment is clickable. Esc or Backspace goes up one level.
- Boundary markers at the left and right edge show what comes in and what goes out ("Input: Campaign research summary", "Output: Draft, 3 variants"). Dagster sub-graphs have inputs and outputs for the same reason. No edges cross the boundary.
- Inner steps use the same Step component in its compact size (220px).

**What is inside, by kind:**
| Step kind | Inside |
|---|---|
| Doat | Its plan as a flow (usually a chain of sub-steps). Tools it used hang below each sub-step as small dashed-linked nodes (the same idea as the model, memory and tools in your n8n agent screenshot). Plain-language actions and outputs, not raw reasoning |
| Person | Their subtasks or checklist, reported updates and attachments. Reported, not surveilled |
| Approval | The pre-action gate in context: Draft, Approval, Send. The proposal and its decision controls live in the right panel |

**Approval steps** (from the human-in-the-loop article I read): irreversible actions, such as sending to customers or spending money, get a gate *before* the action. The panel shows the proposed action first, then the recommended decision, then confidence and reasoning briefly, then the deadline and who is next if the reviewer is away.

**Rules:**
- Depth on the canvas is Objective, Step, Sub-step. Anything deeper is a list in the panel's Run tab.
- Only nodes with inner steps can be entered. For others, double-click opens their Run tab in the panel.
- While you are inside a step, its state shows in the panel header. If it fails, a banner appears: "This step failed at sub-step 3." Nothing moves.
- The path is part of the app state, so Back and Forward work and a restart returns to the same place.
- More than 30 sub-steps: group them into collapsed groups with counts.

**Data (adapt names to the repo):**
```ts
type Step = {
  id: string; objectiveId: string; parentStepId?: string;
  kind: "work" | "approval";
  ownerKind: "person" | "doat"; ownerId: string;
  title: string;
};
type StepEdge = { id: string; fromId: string; toId: string; label?: string };
// Derived, never stored: state, progress, edge state, inner-step count.
```

## 8. Right panel fixes
- Group order: Needs attention, Working, Idle. Rename "Others" to "Idle".
- Rows are two lines at 13px: name, then goal or current step. State is written once, capitalized, with a glyph. Drop "Just now" unless a real timestamp exists.
- A worker with several steps shows "3 steps". Hovering the row highlights all of them on the canvas. Clicking selects the first and fits the view to them.
- Selected step: header, Goal, Now, a Steps list (this is the Run tab content), Connections ("Receives from" and "Hands off to", each naming the step and its owner), Recent activity, composer. Add an "Open steps" button when it has inner steps.

## 9. Anti-patterns (give this to Codex verbatim)
Do not use: a different border color per node type; status pills or badges; icon tiles with colored backgrounds; robot or sparkle icons; glows, gradients or shadows; progress bars inside nodes; more than 2 title lines plus 1 meta line; corner radius above 8px; emoji; dark neon styling.

On your references: the two dark Gwira mockups in your last message are AI renders that contain exactly these patterns (robot avatars, a different bright border per node, status pills, glow). Take only these ideas from them: a distinct approval step, a person's photo avatar, and a left-to-right flow that wraps. The n8n screenshot is a real product. Take its handles and labelled edges, not its dark theme.

Light theme matches the rest of Gwira. A dark theme is a later token swap.

---

## 10. Codex tasks

Run in order. After each, run the review prompt from the canvas prompt file in a new task.

### T1: Fix the foundation (no restyling)

````markdown
# Task: Workflow canvas foundation fixes

Follow AGENTS.md, including the canvas rules. Read docs/product/dashboard-workflow-nodes-spec.md sections 1, 2, 3, 5 and 6. Do not restyle nodes in this task.

1. Model: nodes are Steps; edges are handoffs only; objective containment is never an edge. Change the fixture and any derived data accordingly. Report what you changed in the graph logic.
2. Objective header per section 3, replacing the objective node.
3. Edges: smoothstep with borderRadius 8, offset 24, 8px arrowheads, and the edge states in section 5. Add fork/join dots above 4 edges.
4. Layout: dagre LR with measured node sizes. Re-layout only on structural change. Remove node dragging and persisted positions.
5. Fit: after layout and node measurement. Padding 48px. One "Fit" button; remove "Reset".
6. Chrome: full-bleed canvas (no bordered card), 15px page title, styled scope menu replacing the native select, hide tabs that are not built, "Demo data" shown once as a dev-only badge.

Exit when screenshots in `artifacts/workflow/t1/` show the Marketing Campaign fixture fitted and readable at 1280x800 and 1440x900, with no crossing trunks near the objective, plus the 50 and 200 node fixtures. Typecheck, lint and tests pass.
````

### T2: Node gallery (design gate; stop afterwards)

````markdown
# Task: Step node design gallery

Follow AGENTS.md. Read sections 4 and 9 of docs/product/dashboard-workflow-nodes-spec.md.

Build only a dev-only page `/dev/nodes` (excluded from production builds) showing the Step node, built exactly to section 4, at 100% and 200% zoom: Doat step and person step in every state; approval step; with and without inner steps; long titles (2 lines and truncated); hover, selected, dimmed and focus-visible. Also show the compact (50 to 80%) and dot (below 50%) forms.

Do not wire it into the graph. Reuse existing tokens and the Doat avatar component if it exists.
Take screenshots into `artifacts/workflow/t2/` and STOP. Do not continue to other tasks. I will review the screenshots first.
````

### T3: Wire nodes and semantic zoom

````markdown
# Task: Use the Step node in the graph, with semantic zoom

Only after the T2 screenshots are approved. Follow AGENTS.md. Read sections 4 to 6.

Replace the graph's node component with the approved Step node. Implement the three zoom levels with a 150ms crossfade and the exception rule (selected, waiting and failed stay one level more detailed). Selection highlights the whole upstream and downstream path at 100% and dims the rest to 35%. Keep selected node ids outside the nodes array. Memoize nodes and edges.

Exit with screenshots at 25%, 50%, 80% and 100% on the Marketing Campaign and 200-node fixtures, and a note on pan and zoom smoothness.
````

### T4: Drill-down

````markdown
# Task: Open a step (drill-down)

Follow AGENTS.md. Read section 7.

Implement navigate-into: double-click, double-tap and Enter on a focused node enter a step that has inner steps; Esc and Backspace go up; the breadcrumb; the 200ms transition (crossfade under reduced motion); boundary markers; the path stored in app state so Back and Forward work. Inner steps use the Step node's compact size. Doat steps show their plan, with tools hanging below. For steps without inner steps, double-click opens the panel's Run tab.

Use real step records. If there is no way to get inner steps for the current data, add the smallest local model for `parentStepId` and report it. Use dev fixtures to show a Doat step, a person step and an approval step.

Exit with screenshots in `artifacts/workflow/t4/` of: the badge on a node, the entered view for each kind, the breadcrumb, the failure banner, and the entered view at a narrow window. Report the keyboard path for entering and leaving.
````

### T5: Approval steps and group by worker
Run after T4, as two separate tasks: first the approval step (sections 4 and 7, with the panel's decision controls), then "Group by worker" swimlanes (section 5, phase 2).# Gwira Workflow: nodes, colour, editing, pulse and fixes (v2)

Place at `docs/product/dashboard-workflow-nodes-spec.md`. It extends `dashboard-workflow-spec.md`. Where the two disagree, this file wins.

**Before you start:** run `wc -c docs/product/dashboard-workflow-nodes-spec.md`. It must print more than 20000. An earlier copy of this file was saved empty, which is why Codex reported "present but empty" on 17 Oct and could not build anything from it.

**What changed in v2 (17 Oct)**
- Colour added (section 4b). It replaces "colour only for amber and red".
- Node dragging added (section 5b). It replaces "remove node dragging".
- Connect, disconnect and reconnect added (section 5c). Edges are still handoffs only.
- Live pulse on connectors added (section 5d). It replaces "slow moving dash" and narrows the "no animation" rule to "no animation unless real work is live".
- New section 1b: the 17 Oct screenshots show two T1 defects (hook-shaped edges, Fit not fitting). New task T1b fixes them first.
- The Research Doat's colour moves from ochre to teal, because ochre is too close to the amber used for "waiting on a human".
- "Step 2 of 5" is removed from node meta. It clashed with the inner-steps count ("5 steps").

---

## 1. What is wrong with the current screen (original review)

| # | What I see | Why it hurts | Fix |
|---|---|---|---|
| 1 | At 45% zoom the graph is clipped on the right while the left, top and bottom are empty | The initial fit ran before nodes were measured | Fit after layout and after node measurement (`useNodesInitialized`). Padding 48px |
| 2 | The objective node sends a line to every step. Six lines leave one handle and collide | A *contains* relationship is drawn as a *handoff* | Containment is never an edge. The objective becomes a header (section 3) |
| 3 | Curved lines overlap, have no arrows, and one runs off-screen | Default bezier edges with no spacing rules | `smoothstep` edges, rounded corners, shared trunk lines (section 5) |
| 4 | Text is about 8px | The canvas only scales; it never changes representation | Semantic zoom: below 60% switch to a compact node (section 6) |
| 5 | Titles are truncated, and the state appears twice | Too much text for the width, with no hierarchy | One title (2 lines), one meta line, a glyph for state |
| 6 | Doat, person and objective nodes look the same | Type is only readable from the subtitle | Identity mark: rounded square for Doats, circle for people (section 4) |
| 7 | Completed and working nodes look identical | You can't see what's live | Completed recedes, working stands out (section 4) |
| 8 | The canvas sits in a bordered card, the title is 28px, and the scope picker is a native select | Looks like a dashboard template and wastes space | Full-bleed canvas, 15px title, styled menu |
| 9 | Right panel: 3-line rows, large type, "Others" group, "Just now" on everything | Inconsistent with the 13px scale | Section 8 |
| 10 | Four disabled tabs, plus "Fit" and "Reset" doing nearly the same thing | Dead controls invite clicks | Show only built tabs. One "Fit" button |

What is already right: the Team and Activity panel structure, the Needs attention grouping, the dotted canvas, the zoom control, and the dev-fixture label.

## 1b. What the 17 Oct screenshots show (T1 is not finished)

Two screenshots of the Marketing Campaign fixture, at 152% and 73%. I can't see the code, so the "likely cause" column is a hypothesis to confirm by measuring. T1b requires the measured numbers in its report.

| # | What I see | Likely cause | Fix |
|---|---|---|---|
| 11 | Lines between neighbouring nodes leave as a hook: out, then down or up, back, then in | The gap between columns is only about 33 flow units (about one seventh of a node's width, measured from the screenshots). A smoothstep edge with `offset: 24` at both ends needs at least 48 plus the arrowhead, so it has to double back. Section 5 asks for a larger gap | `ranksep` 96. A unit test asserts rank gap >= 2 x offset + 16. Handles sit at the vertical centre of the node |
| 12 | Fit is wrong. At 152% only one node is visible. At 73% the third node is cut by the right edge of the canvas and the rest are off-screen | Fit zooms past 100%, or runs before the canvas has its final size (the right panel mounting), or is clamped by `minZoom` | `fitView` with `maxZoom: 1`, `minZoom` low enough for the 200-node fixture, bounds of all nodes, refit on container resize until the user pans or zooms. Assert it in the smoke test (section 6) |
| 13 | The canvas is about 590px wide at this window size. Sidebar plus right panel take about two thirds of the width | A 14-step left-to-right chain cannot be readable in that space | Add "Focus canvas" (section 6) |
| 14 | Doats in the right panel are grey "D" circles, and nodes use a generic grey mark | Colour and Doat marks are not built yet | Sections 4b and 8 |

## 2. The root problem: nobody decided what a node is

Three different ideas were mixed together: your sketch has worker nodes (Agent, Employee), Codex built task nodes, and the right panel is worker-based. A graph can't be clean until this is fixed.

| Option | Nodes | Edges | Verdict |
|---|---|---|---|
| A. Worker graph | People and Doats | handoffs | One worker does many steps, so lines multiply and sequence is lost |
| B. Task graph | Steps of work | dependencies | Clean sequence, but loses the "who" you sketched |
| **C. Steps with an owner (decided)** | Steps, each with one owner | handoffs | Clean sequence **and** the owner is the node's visual anchor |

**Decision: C.** The "Doat node" and "Employee node" are one Step component with a different identity mark and the owner's colour. The right panel stays worker-based and links to steps (a worker with 3 steps highlights 3 nodes).

Hierarchy (one level on the canvas at a time):
```
Company > Objective > Step > Sub-step
```
- Objective: a header above the canvas, not a node.
- Step: a node.
- Approval: a kind of step.
- Outputs (deliverables): shown as "1 output" in the node's meta and listed in the panel. Not nodes in phase 1.
- Sub-step: what is inside a step (section 7).

## 3. Objective header

Pinned top-left inside the canvas, no card or fill:
- Line 1: objective title, 15px/600.
- Line 2: "On track · 3 of 6 steps done · Due Sat" (12px, #595959), with owner marks (20px) on the right.
- Health is plain text. "At risk" and "Blocked" use the amber and red text rules from section 4.
- Inside a step, the breadcrumb replaces this header (section 7).

## 4. Step node

Reference: Linear's restraint, n8n's handles and labels. **Not** the dark, glowing mockups (section 9).

Size 240px wide, height from content (at least 64px). 8px radius, 1px border, **no shadow**. Fill and border come from the owner's colour (section 4b).

```
┌──────────────────────────────────────┐
│ [■]  Draft promotion content      ◔ │   mark 28px | title 13/500, 2 lines max | state glyph 14px
│      Marketing Doat · Working 12m    │   meta 12px #595959: owner · state phrase
│                         ⧉ 4 steps    │   only when it has inner steps (11px)
└──────────────────────────────────────┘
```

- **Mark:** Doat is a rounded, generated shape in its colour. Person is a circle (photo, or a tinted monogram). Both 28px.
- **Meta line:** "{Owner} · {state phrase}". Examples: "Marketing Doat · Working 12m", "Chipo Zulu · Done 09:48", "Sarah Mwila · Waiting 14m". State is written once, here.
- **No position text.** Do not write "Step 2 of 5" on a node. It is ambiguous with the inner-steps count. The objective header carries "3 of 6 steps done".
- **Glyph:** one glyph, no text next to it, no pill.
- **Inner-steps count:** "4 steps" with a small stacked-layers icon. This is the cue that the node can be opened, the same idea as Airflow's "+2 tasks" count on a group.
- **Handles:** 8px rings on the left (in) and right (out). Hidden at rest. Shown on hover, selection and focus, and on valid targets while connecting (section 5c). The hit area is 16px.
- **Approval step:** same card plus a small label "Approval" (11px/500, uppercase, 0.04em) above the title. Title reads "Approve: {action}". Meta shows the reviewer and how long it has waited.

`--h` is the owner's colour (section 4b).

| State | Glyph | Treatment |
|---|---|---|
| Done | check in `--h` at 60% | White fill, border `--h` 14%, mark at 55% opacity, title #595959. It recedes |
| Working | slow arc in `--h` | Owner tint fill, border `--h` solid. Arc is static under reduced motion |
| Waiting on a human | half-filled amber circle | Owner tint fill, 3px amber bar inside the left edge, meta in dark amber |
| Pending (not started) | dashed hollow circle | White fill, dashed border `--h` 38%, muted title |
| Blocked | hollow red circle | Owner tint fill, soft red border, meta in red: "Blocked by {step}" |
| Failed | red square | Owner tint fill, soft red border, 3px red bar inside the left edge. Meta: "Failed · {short reason}" |
| Paused | hollow gray circle | Owner tint fill, normal border |

Amber and red are the only state colours. Every state also has a glyph and words, so colour is never the only signal.

| Display state | Appearance |
|---|---|
| Hover | border one step darker (`--h` 45%), handles visible |
| Selected | 2px ink ring with a 3px white gap |
| Dimmed | 35% opacity |
| Focus-visible | same ring as selected, plus a 2px offset |

## 4b. Colour: it tells you who, never what kind

Every worker (Doat or person) has one identity colour. A node uses its owner's colour. The node's *kind* (Doat, person, approval) is shown by the mark's shape and the "Approval" label, never by colour. That is the difference from the dark mockups, which used a different bright border per node type.

**Palette: 8 keys, one lightness family.** Store the key (`"coral"`), not the hex, so the palette can be tuned in one place.

| Key | Hex | Default for |
|---|---|---|
| coral | `#C4684F` | Marketing Doat |
| indigo | `#4D5FB5` | Coding Doat |
| sage | `#3F8A67` | Support Doat |
| teal | `#2F8596` | Research Doat (was ochre) |
| plum | `#8A5A9E` | people, assigned in order |
| rose | `#B24E73` | people |
| slate | `#5F7285` | people |
| olive | `#6F8A3D` | people |

Amber `#B26A00` and red `#B42318` are state colours. **They are never owner colours.** Red is only ever a 3px bar, a border at 32%, or text. It is never a fill.

**Everything else is derived from the owner colour** with `color-mix(in srgb, var(--h) N%, #fff)`. One token set, no hand-picked hex per colour.

| Use | Value |
|---|---|
| Node fill (working, waiting, blocked, failed, paused) | `--h` 6% over white |
| Border at rest | `--h` 28% over white |
| Border when working | `--h` 100%, 1px |
| Done | white fill, border `--h` 14%, mark 55% opacity |
| Pending | white fill, dashed border `--h` 38% |
| Doat mark | solid `--h` shape, ink eyes (white eyes on indigo) |
| Person mark | circle filled `--h` 16% over white, initials `--h` mixed 65% with black |

**Where the colour lives**
- Doats: from the avatar generator (the Doat's record already has its look). Map the generator's hue to the nearest palette key. If a Doat has none, derive one from its id.
- People: add `colorKey` to the person profile. Assign automatically at creation, in palette order, and let the person or an admin change it.

**Rules**
- Text stays ink. Colour never tints a title or meta line (the person monogram is the one exception).
- Flat tints only: no gradient, glow or shadow. Tint at most 8%.
- Colour is also used in the right panel, the objective header owner marks and the active edge (section 5d). Nowhere else.
- Run the eight colours through a colour-blindness simulation in the T2 gallery (protanopia, deuteranopia, tritanopia). Confirm no two colours collapse into each other at the 6% tint. Report any that do and swap one.

## 5. Edges and layout

- **Edge = handoff only.** One step's output feeds another step. Containment is never an edge.
- Type: `smoothstep`, `borderRadius: 8`, `offset: 24`, so edges leaving the same step bend at the same x and share a trunk line.
- Stroke 1.5px with an 8px arrowhead at the target.
- Fan-out or fan-in above 4 edges: insert a small fork/join dot (10px, hairline ring) instead of drawing 5 lines into one handle.

| Edge state | Style |
|---|---|
| Work has passed | solid `#8F8C84` |
| **Active** (the target is a Doat step with live work) | solid 1.5px in the **target owner's colour**, with a travelling dot (section 5d) |
| Active, person target | solid 1.5px in the target owner's colour, no dot (a person's work isn't observable live) |
| Active, no live signal | solid 1.5px in the target owner's colour, no dot, chip "Quiet 4m" |
| Next (target pending) | dashed `#C9C6BE` |
| Waiting on a human | solid amber, chip "Waiting 14m". Static |
| Blocked or failed | solid red, chip "Blocked 2 days". Static |

An amber or red edge always wins over an owner colour. Chips are always shown for waiting, blocked and failed. For other edges, a chip with the work item's name ("Campaign research summary") appears on hover and selection.

**Layout (automatic mode)**
- `@dagrejs/dagre`, left to right, `nodesep 32`, **`ranksep 96`**, using **measured** node sizes. 96 leaves room for the arrowhead and a chip; the minimum that avoids hooks is 2 x offset + 16 = 64.
- Re-run layout only when the structure changes (a step or a handoff is added or removed), never when a state changes.
- React Flow's docs say only ELK offers edge routing, but it is the most complex option and a much larger bundle. Try it only if smoothstep trunks still tangle above about 30 nodes.
- Phase 2: "Group by worker" swimlanes. Y is the worker's lane and X is the dagre rank. It is a layout change only, using the same data.

## 5b. Dragging nodes

Dragging is a **view** action: it changes where a node sits on *your* canvas, never any business data. So everyone can drag, regardless of edit permission.

- Drag from anywhere on the node body (not from a handle). Use a drag threshold of 4px, so single-click select and double-click drill-down still work.
- Snap to an 8px grid while dragging. Edges follow. Dropping a node onto another does nothing.
- On drop, save `{stepId: {x, y}}` as a **layout override**, keyed by objective (and by parent step when inside a step, section 7). Store it in per-user UI state, never on the Step record.
- Keep React Flow's keyboard nudge (arrow keys on a focused node, Shift for larger steps) and Shift+drag marquee for multi-select.

**Two modes, so the layout never fights the user**
| Mode | When | Behaviour |
|---|---|---|
| Automatic | The objective has no layout overrides | dagre owns every position and re-runs on structural change (animate 200ms, instant under reduced motion) |
| Edited | The objective has at least one override | dagre never moves anything. A new step from outside is placed one rank right of its upstream step (x = upstream.x + width + ranksep, y = upstream.y, or the first free slot below if occupied). Connecting or disconnecting does not move other nodes |

**Tidy up** (bottom bar, next to Fit): clears the overrides for this objective, re-runs dagre, then fits. Disabled in automatic mode. It is the only way back to automatic mode.

## 5c. Connect, disconnect and reconnect

This is a **data** action. A handoff is a real dependency: "B waits for A". Adding or removing one changes how the business runs, so the rules are stricter than dragging.

**The canvas edits the plan. It never starts or stops work.** Removing a handoff may make a step ready; the scheduler decides what runs, not the canvas.

**Who can do it:** use the existing permission check for editing an objective's plan. Without it, handles never render, edges can't be selected for deletion, and the right panel says "You can't change this workflow". If there is no permission model yet, treat the single local user as allowed and report that.

**Connect**
1. Drag from a step's right (out) handle to another step's left (in) handle. Strict direction: out to in only.
2. While dragging, valid targets show their handle enlarged with an ink ring. Invalid steps dim to 35%, and hovering one shows the reason. Escape or releasing on empty canvas cancels. Releasing on empty canvas does not create a step.
3. A connection is valid only if all of these hold. Use one pure function, `canConnect(from, to, graph)`, with a unit test per row.

| Rule | Reason shown |
|---|---|
| `from` is not `to` | "A step can't wait for itself" |
| No handoff already exists between them, in either direction | "Already connected" |
| It creates no loop (no path from `to` back to `from`) | "That would create a loop" |
| `to` has not started (Pending, Blocked or Paused) | "{Step} has already started" |
| Both steps are at the same level (same objective and same parent step) | "Steps must be at the same level" |

4. On connect: the edge appears at once in the Next style; derived state recomputes (a Pending step stays Pending, or becomes Blocked if the source isn't done). Add an activity entry "{Actor} linked {A} to {B}" and show a toast "Linked · Undo" for 6s. Cmd+Z also undoes.

**Disconnect**
1. Click an edge to select it (16px hit area). It shows 2px ink with a small circular x button at its midpoint. Delete or Backspace, or the x, removes it. The right panel shows the edge with a "Disconnect" button.
2. Only edges can be deleted this way. Backspace on a selected **node** must do nothing (use React Flow's `onBeforeDelete` to allow edges only).
3. **Confirm with a small popover anchored to the edge** (not a modal) when either is true:
   - the source is an approval step, or
   - removing it leaves the target with no unfinished input, so it may start right away.

   Text: "{Target} will no longer wait for {Source}. It may start right away." Buttons: Cancel, Disconnect (ink fill).
4. Every other disconnect is immediate with the same Undo toast ("Disconnected · Undo"), and an activity entry.

**Reconnect:** drag either end of a selected edge to another step. It is one atomic change (remove plus add), checked by the same `canConnect`, with one Undo.

**Keyboard and no-mouse path:** in the right panel's Connections list for a selected step, "Receives from" and "Hands off to" each get an "Add" action that opens a searchable list of steps (invalid ones disabled with the reason), and each row has a remove action. It uses the same functions and the same confirmation.

**Persistence:** a handoff is the app's existing task dependency. Find it in recon and write there. Do not invent a second store. In the Demo data fixtures, edits live in memory for the session, reset when the scenario changes, and show a quiet "Demo changes aren't saved" line in the dev badge. If there is no real dependency model to write to in production, hide the handles and say so in the report.

## 5d. Pulse: a moving dot means real work is happening now

**Rule: nothing on the canvas moves unless real work is live.** That is what lets people trust it.

- **When:** an edge pulses only when its target is a **Doat step with live work**. Live means the run has a heartbeat or event within the last 90 seconds. If the app has neither, treat "running" as live and say so in the report. People's steps never pulse. A running step with no recent signal gets the solid coloured edge and a "Quiet 4m" chip instead of a dot.
- **Direction and colour:** a single dot travels from the source handle to the target handle, in the **target owner's colour**: the worker doing the work. Behind it, the edge is solid. Ahead of it, the next edge is dashed grey. So the picture reads: passed, active, next.
- **Look:** 6px flat dot, 1.5px white outline so it stays visible on lines and dots. No blur, no glow, no trail.
- **Timing:** linear, repeating. Speed about 120px per second, minimum 1.6s and maximum 4s per trip. Offset each edge's start by a hash of its id so several pulses don't move in sync.
- **Working node:** the arc glyph rotates (1.2s linear). The border is the owner colour. Nothing else on the node moves.
- **Waiting, blocked, failed:** static. Attention comes from amber or red, not motion.
- **Motion budget:**
  - At most 24 animated edges at once, chosen from edges with an end in the viewport. The rest show the solid colour and no dot.
  - Below 50% zoom (dot representation), no dot. Solid colour only.
  - Pause all pulses when the window is hidden or minimised.
  - Under `prefers-reduced-motion`: no dot and no rotation. Active edges stay solid in the owner's colour and the arc glyph stays static.
- **Implementation:** SVG `animateMotion` on a `<circle>` inside the custom edge, using the edge's own path string. Memoize the edge so it re-renders only when its state changes. CSS `offset-path` is an alternative; pick one, measure, and report the frame rate with 24 pulses on the 200-node fixture.
- **Dev fixtures:** add a "Simulate live work" switch to the Demo data menu that marks selected Doat steps live. Label anything it drives as simulated. In production, only real signals drive the pulse.

## 6. Fit, semantic zoom and canvas width

**Fit:** runs after layout and after nodes are measured. Padding 48px. `maxZoom: 1`, so Fit never zooms in past 100%. After Fit, every node's rectangle lies inside the canvas rectangle inset by 48px, **except** when the graph would need less than 60%: then fit to the first rank and the first problem node instead, and show "Showing 12 of 40 steps · Fit all". Refit when the canvas container resizes (panel opens, window resizes) until the user pans or zooms. Remember the viewport per objective and per path.

**Test it, don't eyeball it.** Add an Electron smoke-test assertion for the Marketing, 50-node and 200-node fixtures: after Fit, node rectangles are inside the inset canvas rectangle, or the "Showing N of M" mode is active. Also assert that for edges between adjacent ranks, no part of the path lies left of the source handle or right of the target handle (no hooks).

**Bottom bar:** `-  73%  +  Fit  Tidy up  Focus canvas`. Tidy up is disabled unless the layout has been edited (section 5b).

**Focus canvas:** one button, and Cmd+. toggle, that collapses the sidebar and the right panel so the canvas gets the full window, then refits. It is a view setting, remembered per user. This exists because at a laptop window the canvas is about 590px wide, which is too narrow for a left-to-right chain of 14 steps.

**Zoom levels** (switch the representation, don't just scale):
| Zoom | Representation |
|---|---|
| 80% and up | Full node |
| 50% to 80% | Compact: mark, title on one line, glyph |
| Below 50% | Dot: mark only, with the objective title kept in the header |

Crossfade between levels in 150ms. Under reduced motion, switch instantly. Selected, waiting and failed nodes stay one level more detailed than the rest, so problems stay readable when zoomed out. Colour is kept at every level: the compact node keeps the tint, and the dot is the mark in the owner's colour.

## 7. Drill-down: open a step

Double-click (or double-tap, or Enter on a focused node, or "Open steps" in the panel) enters the step. Single click only selects. Don't add a click delay.

**Why navigate into it, not expand in place:**
- React Flow sub flows put children inside a parent, but dagre layout breaks when sub-flow nodes connect to nodes outside, and only ELK handles it.
- Expanding in place pushes siblings around and loses the mental map.
- A nested level keeps the main graph readable, which is what Dagster says nested graphs are for.

**What you see:**
- Transition within 200ms: the node grows to fill the canvas, its inner steps fade in. Under reduced motion it is a crossfade.
- The breadcrumb replaces the objective header: `Marketing Campaign › Draft promotion content`. Every segment is clickable. Esc or Backspace goes up one level.
- Boundary markers at the left and right edge show what comes in and what goes out ("Input: Campaign research summary", "Output: Draft, 3 variants"). Dagster sub-graphs have inputs and outputs for the same reason. No edges cross the boundary.
- Inner steps use the same Step component at its compact size (208px), in the same owner colour.
- Dragging and the layout overrides work the same way inside a step, keyed by the parent step.

**What is inside, by kind:**
| Step kind | Inside |
|---|---|
| Doat | Its plan as a flow (usually a chain of sub-steps). Tools it used hang below each sub-step as small dashed-linked nodes (the same idea as the model, memory and tools in your n8n agent screenshot). Plain-language actions and outputs, not raw reasoning |
| Person | Their subtasks or checklist, reported updates and attachments. Reported, not surveilled |
| Approval | The pre-action gate in context: Draft, Approval, Send. The proposal and its decision controls live in the right panel |

**Approval steps:** irreversible actions, such as sending to customers or spending money, get a gate *before* the action. The panel shows the proposed action first, then the recommended decision, then confidence and reasoning briefly, then the deadline and who is next if the reviewer is away.

**Rules:**
- Depth on the canvas is Objective, Step, Sub-step. Anything deeper is a list in the panel's Run tab.
- Only nodes with inner steps can be entered. For others, double-click opens their Run tab in the panel.
- While you are inside a step, its state shows in the panel header. If it fails, a banner appears: "This step failed at sub-step 3." Nothing moves.
- The path is part of the app state, so Back and Forward work and a restart returns to the same place.
- More than 30 sub-steps: group them into collapsed groups with counts.

**Data (adapt names to the repo):**
```ts
type OwnerColor = "coral" | "indigo" | "sage" | "teal" | "plum" | "rose" | "slate" | "olive";
// Worker profile (person or Doat) gets: colorKey: OwnerColor

type Step = {
  id: string; objectiveId: string; parentStepId?: string;
  kind: "work" | "approval";
  ownerKind: "person" | "doat"; ownerId: string;
  title: string;
};
type StepEdge = { id: string; fromId: string; toId: string; label?: string };

// Per viewer, UI state, never business data. Key = objectiveId, or objectiveId/parentStepId.
type LayoutOverrides = Record<string, Record<string /* stepId */, { x: number; y: number }>>;

// Written to the activity log on every plan edit.
type PlanEdit = { actorId: string; action: "link" | "unlink" | "relink"; fromId: string; toId: string; at: string };

// Derived, never stored: state, progress, edge state, inner-step count, isLive.
```

## 8. Right panel

- Group order: Needs attention, Working, Idle. Rename "Others" to "Idle".
- Rows are two lines at 13px: name, then goal or current step. State is written once, capitalized, with a glyph. Drop "Just now" unless a real timestamp exists.
- **Marks:** Doats use their shape in their colour, people use the tinted monogram (the same as on the canvas). No grey "D" circles.
- A worker with several steps shows "3 steps". Hovering the row highlights all of them on the canvas. Clicking selects the first and fits the view to them.
- Selected step: header, Goal, Now, a Steps list (this is the Run tab content), Connections ("Receives from" and "Hands off to", each naming the step and its owner, each with Add and remove actions, section 5c), Recent activity, composer. Add an "Open steps" button when it has inner steps.
- Selected edge: "Approve newsletter send to Send newsletter", the work item name, its state, and a "Disconnect" button that uses the same confirmation as the canvas.

## 9. Anti-patterns (give this to Codex verbatim)

Do not use: a different colour per node **type** (colour tells who owns the step, section 4b); status pills or badges; icon tiles with saturated colour backgrounds; robot or sparkle icons; glows, gradients or shadows (the pulse dot is flat); progress bars inside nodes; more than 2 title lines plus 1 meta line; corner radius above 8px; emoji; dark neon styling; coloured text; saturated node fills (tint is 6%); "Step 2 of 5" on a node; motion on anything that isn't live work; more than one moving dot per edge; red or amber as an owner colour.

On your references: the two dark Gwira mockups in your earlier message are AI renders that contain exactly these patterns (robot avatars, a different bright border per node type, status pills, glow). Take only these ideas from them: a distinct approval step, a person's photo avatar, and a left-to-right flow that wraps. The n8n screenshot is a real product. Take its handles, labelled edges and drag-to-connect, not its dark theme.

Light theme matches the rest of Gwira. A dark theme is a later token swap.

## 9b. Add to AGENTS.md (canvas rules)

- Colour tells who (owner), never what kind. Use palette keys, not hex. Amber and red are state colours only.
- Nothing moves unless real work is live. Pulses only for Doat steps with a live signal. Respect reduced motion.
- Dragging is a per-user view change. Connecting and disconnecting is a plan edit: permission-checked, validated, undoable and logged.
- The canvas edits the plan. It never starts or stops work.
- Fixture edits are session-only and labelled. No fake data and no fake persistence in production.
- Fit and edge shape are verified by an assertion, not by looking at a screenshot.

---

## 10. Codex tasks

**Order: T1b, T2, T3, T6, T7a, T7b, T4, T5.** T1 is done (but see 1b). Run the review prompt from the canvas prompt file in a new task after each. Every prompt begins by checking this file's size, so an empty file stops the task at once.

### T1b: Fix the two defects T1 left (edges and Fit)

````markdown
# Task: Fix hook-shaped edges and Fit

Follow AGENTS.md. First run `wc -c docs/product/dashboard-workflow-nodes-spec.md`; stop and tell me if it is under 20000. Read sections 1b, 5 and 6. Do not restyle nodes. Do not add other features.

1. Measure before changing anything. For the Marketing Campaign fixture, print to a dev log and put in your report: the gap between neighbouring columns in flow units, the smoothstep offset, the dagre ranksep, the canvas viewport size in pixels, the bounding box of all nodes, the zoom after Fit, and fitView's minZoom and maxZoom.
2. Edges: ranksep 96, nodesep 32, handles at the vertical centre of each node. No hook-shaped edge between nodes in adjacent ranks. Unit test: rank gap >= 2 x offset + 16.
3. Fit: `maxZoom: 1`; `minZoom` low enough for the 200-node fixture; bounds of all nodes; runs after layout and node measurement; refits when the canvas container resizes until the user pans or zooms; padding 48px.
4. Electron smoke test: for the Marketing, 50-node and 200-node fixtures, after Fit assert every node rectangle lies inside the canvas rectangle inset by 48px (or the "Showing N of M" mode is active). Also assert that for edges between adjacent ranks no part of the path lies left of the source handle or right of the target handle.
5. Add a "Focus canvas" button to the bottom bar and Cmd+. that collapses the sidebar and right panel, then refits. Remember the setting per user.

Exit: screenshots in artifacts/workflow/t1b/ at 1280x800 and 1440x900 for Marketing, 50 and 200 nodes, once with panels open and once with Focus canvas on. Typecheck, tests and build pass. Report the numbers from step 1 and what changed.
````

### T2: Node gallery with colour (design gate; stop afterwards)

````markdown
# Task: Step node design gallery

Follow AGENTS.md. First run `wc -c docs/product/dashboard-workflow-nodes-spec.md`; stop and tell me if it is under 20000. Read sections 4, 4b and 9.

Build only a dev-only page `/dev/nodes` (excluded from production builds) that shows:
1. The 8 owner colours from section 4b as tokens (palette keys), each with a Doat mark and a person monogram, and the derived tints, plus the same eight under protanopia, deuteranopia and tritanopia simulation. Report any two that look alike at 6% tint.
2. The Step node, built exactly to section 4, at 100% and 200% zoom: a Doat step and a person step in every state (done, working, waiting, pending, blocked, failed, paused), in at least three different owner colours; an approval step; with and without inner steps; long titles (2 lines and truncated); hover, selected, dimmed and focus-visible; handles shown and hidden.
3. The compact (50 to 80%) and dot (below 50%) forms, in colour.
4. The Doat marks: Marketing, Coding, Support, Research (teal). Reuse the existing Doat avatar component if there is one.

Do not wire it into the graph. Reuse existing tokens. Add the palette to the tokens, as keys.
Take screenshots into artifacts/workflow/t2/ and STOP. Do not continue to other tasks. I will review the screenshots first.
````

### T3: Wire nodes and semantic zoom

````markdown
# Task: Use the Step node in the graph, with semantic zoom

Only after the T2 screenshots are approved. Follow AGENTS.md. Check the spec file size first. Read sections 4 to 6.

Replace the graph's node component with the approved Step node, with owner colours. Add `colorKey` to the person profile (auto-assigned in palette order) and use the Doat's palette key. Implement the three zoom levels with a 150ms crossfade and the exception rule (selected, waiting and failed stay one level more detailed). Selection highlights the whole upstream and downstream path at 100% and dims the rest to 35%. Keep selected node ids outside the nodes array. Memoize nodes and edges. Update the right panel marks (section 8).

Exit with screenshots at 25%, 50%, 80% and 100% on the Marketing Campaign and 200-node fixtures, and a note on pan and zoom smoothness.
````

### T6: Edge states and the live pulse

````markdown
# Task: Edge states and live pulse

Follow AGENTS.md. Check the spec file size first. Read sections 5 and 5d.

1. Implement every edge state in the section 5 table. Active edges use the target owner's colour. Amber and red edges win over owner colours.
2. Pulse per section 5d: one flat 6px dot with a white outline, target owner's colour, linear, speed about 120px/s (min 1.6s, max 4s), start offset hashed from the edge id. Only for Doat steps with a live signal. Find what live signal exists (run heartbeat or last event time). If none exists, use "running" and say so. Use 90 seconds as the threshold, in one named constant.
3. Motion budget: at most 24 animated edges, chosen from the viewport; none below 50% zoom; paused when the window is hidden; none under reduced motion. Memoize the edge.
4. Demo data menu: add "Simulate live work", labelled simulated.

Exit: three screenshots 0.8s apart on the Marketing fixture showing the dot at three positions, one at 50% zoom with no dots, and one with reduced motion on. Report the frame rate with 24 pulses on the 200-node fixture and which technique you used.
````

### T7a: Drag nodes and Tidy up

````markdown
# Task: Draggable nodes with layout overrides

Follow AGENTS.md. Check the spec file size first. Read section 5b.

Allow dragging from the node body with a 4px threshold (single click and double click must still work). Snap to 8px. Save layout overrides per objective (and per parent step) in per-user UI state, not on the Step record. Implement the two modes (Automatic and Edited), the placement rule for new steps in Edited mode, and the "Tidy up" button. Keep keyboard nudge and Shift+drag marquee.

Exit: screenshots before and after dragging two nodes, after reload (positions kept), after Tidy up, and with a new step added in Edited mode. Tests for the mode switch and the placement rule. Report where the overrides are stored.
````

### T7b: Connect, disconnect and reconnect

````markdown
# Task: Edit handoffs (connect, disconnect, reconnect)

Follow AGENTS.md. Check the spec file size first. Read section 5c. Start with recon and report it BEFORE writing code: where a handoff comes from in the real data (the task dependency), whether a permission check for editing a plan exists, and what the write path is.

Then implement: handles hidden at rest and shown on hover, selection and focus; drag from out to in; `canConnect` as one pure function with a unit test for each rule in the table; valid targets ringed and invalid ones dimmed with the reason; Escape cancels; edge selection with the x button; Delete and Backspace remove edges only (use `onBeforeDelete`, so nodes can never be deleted); the confirmation popover for approval sources and for steps that would become ready; reconnect by dragging an edge end; Undo toast and Cmd+Z; an activity entry per edit; the Connections list Add and remove actions in the right panel; the selected-edge panel.

Fixtures: edits are session-only and labelled. No fake persistence in production. If there is no real dependency to write to, hide the handles and tell me.

Exit: screenshots of each state in artifacts/workflow/t7b/: handle visible, connecting with valid and invalid targets, selected edge, the confirmation popover, the Undo toast. Report the unit test list and the write path.
````

### T4: Drill-down

````markdown
# Task: Open a step (drill-down)

Follow AGENTS.md. Check the spec file size first. Read section 7.

Implement navigate-into: double-click, double-tap and Enter on a focused node enter a step that has inner steps; Esc and Backspace go up; the breadcrumb; the 200ms transition (crossfade under reduced motion); boundary markers; the path stored in app state so Back and Forward work. Inner steps use the Step node's compact size in the owner's colour. Doat steps show their plan, with tools hanging below. For steps without inner steps, double-click opens the panel's Run tab.

Use real step records. If there is no way to get inner steps for the current data, add the smallest local model for `parentStepId` and report it. Use dev fixtures to show a Doat step, a person step and an approval step.

Exit with screenshots in artifacts/workflow/t4/ of: the badge on a node, the entered view for each kind, the breadcrumb, the failure banner, and the entered view at a narrow window. Report the keyboard path for entering and leaving.
````

### T5: Approval steps and group by worker

Run after T4, as two separate tasks: first the approval step (sections 4 and 7, with the panel's decision controls), then "Group by worker" swimlanes (section 5, phase 2).