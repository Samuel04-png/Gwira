# Agent system assessment

## What exists

The current “agent” is a local Codex CLI child process. A renderer prompt becomes `CodexExecManager.sendInput()`, which checks a session, appends the user message, marks it running, resolves the CLI, and spawns `codex exec` (or `exec resume`) in the project cwd. The CLI receives a prompt plus model, reasoning, sandbox/permission, optional search and conversation ID. It accesses files and tools according to the installed CLI and its permission mode; the desktop app neither brokers each tool call nor persists a normalized tool/audit record.

Stdout is line-buffered as JSONL. `codexEvents.ts` extracts assistant text, errors, tool/process summaries and patches into human-readable chunks. `SessionStore` stores a current-process transcript and CLI conversation ID; completed history is read from CLI session JSONL. `stop()` sends `SIGTERM`; it does not implement approval queues, process-tree termination, durable cancellation, retries, budgets or recovery.

Multiple `sessionId` child processes can exist concurrently in a `Map`; switching threads does not stop them. This is concurrency, not agent collaboration: there is no task graph, shared memory, delegation, agent identity, work claiming, orchestration, messaging, conflict resolution, or lease.

## Limitations and Gwira implications

| Capability | Current state | Gwira requirement |
|---|---|---|
| Coding agent | Valuable local implementation | Retain behind a desktop runtime adapter. |
| Non-coding providers | Not supported | Provider-neutral agent/task contract and adapters for OpenAI, Anthropic/OpenRouter etc. |
| Tools | Implicit Codex CLI tools | Registered, scoped, auditable tools with credentials vaulting and per-action policy. |
| Permissions | CLI flag, unsafe default | Organization role + task policy + tool/action approvals; no unrestricted default. |
| History | Local CLI files/in-memory | Server-side immutable run/event ledger, redaction and retention policies. |
| Background execution | Dies with desktop/process | Cloud workers/queues and heartbeats; desktop only for local-code runtime jobs. |
| Collaboration | None | Task assignments, dependencies, artifacts, comments, human/agent actors and review gates. |

Coding work remains especially suitable for a local executor because repositories and developer tools are on the developer machine. Gwira should represent it as one capability of a broader runtime, not force all agent types into Codex CLI. A cloud worker must never receive arbitrary local filesystem access; local execution should use a signed/registered desktop agent with explicit project-scoped grants.
