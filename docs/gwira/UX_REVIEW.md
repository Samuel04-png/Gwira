# Gwira UX review

## Phase 3 baseline

- The sidebar offers a polished local-workspace entry point but only New chat and Skills are functional today; Scheduled, Explore and search remain explicitly unavailable.
- Business work must not displace coding work. A coding task should lead naturally to the existing workspace, show a real session state, and return to its task review without duplicating the transcript.
- Local prototype status must be visible wherever a user might infer shared collaboration, remote notifications or cloud persistence.
- The first work-management flow must make state and ownership obvious: task status, assignee, agent status, approval requirement and next action must be visible without opening technical logs.
- Avoid generic dashboard metrics. Home shows only persisted tasks, approvals, comments and actual local Codex session lifecycle events.

## Review checkpoints

1. Validate keyboard access to task creation, status changes, task detail and approval actions.
2. Validate clear empty, loading, error and unavailable states.
3. Check every visible action changes shared state or is explicitly disabled with a reason.
4. Confirm light sidebar and dark coding workspace remain visually coherent; dark-mode preference is a future dedicated setting, not silently inferred.
5. Re-run existing Electron lifecycle and history tests after integration.

## Lead review after integration

- The business destinations preserve the light local sidebar and dark work surface. They use the same restrained borders, compact controls and typography rather than introducing a separate dashboard theme.
- Every enabled business control is data-backed: people/agents/settings forms update the local reducer; task edits, comments and approvals update shared state; project links reference an existing saved Codex project exactly; agent controls use the existing session bridge. Scheduled and Explore remain disabled with explanations.
- Empty states identify the next real setup step and do not invent teammates, agents, notifications, messages, or metrics.
- The task detail panel exposes the coding-run state and only enables “Run coding task” for a `todo` task assigned to a coding agent. A linked saved project is additionally required by the controller.
- Accessibility follow-up: new forms use native labels and buttons; keyboard activation is native. The task board needs a future keyboard-first focus/selection pass and broader screen-reader validation before production use.
- Product limitation remains prominent: this is one-device local state. There is no shared inbox, identity, roles/authorization enforcement, remote worker, or external connector.

## Phase 4 refinement review

- Business pages now fill the workspace rather than the coding workspace’s top-bar grid row; automated Electron smoke checks their visible geometry.
- Errors from business actions appear in a shared, dismissible alert rather than being hidden in the chat-only layout.
- Home and Inbox links now open the exact matching My Work detail. Task detail state resets on task changes, preventing stale edits from being applied to another task.
- Agent execution communicates Starting and Stopping states and guards against rapid duplicate clicks. An interrupted run after app restart is explicitly shown as stopped rather than falsely presented as live or complete.
- The remaining UX priority is an explicit local actor selector once multiple people are configured, plus task-board scaling/filtering and a guided malformed-data recovery experience.

## DOAT milestone 1 review

- Doats have their own sidebar destination, directory, creation flow, profile, task summary, provider status, and explicit empty/unavailable states.
- The visual identity is a deterministic local SVG backed by a saved specification. It is never represented as a generated image or as evidence of an execution capability.
- Creating a Doat does not grant permissions. Only when the local Codex CLI is actually detected is its matching coding-agent record created; otherwise the profile stays visibly unavailable.
- Pause and archive controls are data-backed. Pause blocks new launches; archive requires active work to be stopped first. Editing a profile and business-memory configuration remain intentionally absent rather than appearing to work.
