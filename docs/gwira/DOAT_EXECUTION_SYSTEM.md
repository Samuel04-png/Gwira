# Doat execution system

Only `codex-local` is executable in the current local prototype. It wraps the existing coding-task bridge; it does not replace `CodexExecManager`, modify IPC command construction, or persist streamed output in Gwira.

For a coding Doat to run a task, all of the following must hold:

1. The Doat is active and uses `codex-local`.
2. The task is assigned to that Doat and linked to an exact saved local Codex project.
3. Workspace-write is used with web search disabled.
4. The task is in To do and has no active run.
5. Existing stop, bounded-output, error, session-history, and approval behavior applies.

Configured non-Codex Doats are real records but have no execution provider. Their profiles and task state say so explicitly. Multi-Doat plans, schedules, tool calls, external communications, spending, and autonomous permissions are blocked.
