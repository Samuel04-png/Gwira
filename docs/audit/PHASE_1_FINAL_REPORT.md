# Phase 1 final validation report

Validation date: 2026-10-14. All synthetic files, Electron profiles, mock CLI binaries and test projects were created under the operating system temporary directory and removed after each completed run.

## Verdict

The local coding-agent client is stable enough to begin **careful, non-destructive Gwira UI customization**. It is not ready for customer-facing multi-user use or for broad architectural transformation without preserving the remaining guardrails below.

The original history OOM path is now verified as mitigated for the tested synthetic workloads. The test did not inspect or use private Codex sessions. It does not prove behavior for arbitrary malformed CLI history, all macOS filesystem conditions, or an unbounded active transcript.

## Large-history Electron validation

The test generated a realistic JSONL corpus with a metadata record, user prompt and 32 KiB agent payload per conversation. The 5,000-conversation case contained approximately 156 MiB of synthetic session payload. Each case used five temporary projects, concurrent history requests, eight repeated concurrent refresh rounds, history opening/resume, and renderer responsiveness checks.

| Conversations on disk | Histories returned | Initial concurrent load | 8 refresh rounds | Resume | Main peak RSS | Main heap after GC | Result |
|---:|---:|---:|---:|---:|---:|---:|---|
| 100 | 100 | 285.2 ms | 327.8 ms | 2.4 ms | 192.3 MB | 4.6 MB | Pass |
| 1,000 | 1,000 | 430.3 ms | 1,005.1 ms | 2.3 ms | 285.2 MB | 4.5 MB | Pass |
| 5,000 | 1,000 (intentional cap) | 339.3 ms | 1,082.7 ms | 2.0 ms | 284.9 MB | 4.6 MB | Pass |

Chromium-reported renderer heap remained approximately 12.7–13.4 MB before/after operations in these runs. No Electron crash, hang, failed IPC request or non-responsive composer was observed in the passing workload. The bounded 1,000-session policy explains why the 5,000-session test did not grow proportionally.

An attempted high-frequency DOM project-selection loop did not complete within the isolated harness timeout. It was terminated and is **not** counted as a passing rapid-navigation validation. The regular Electron smoke test still verifies project creation and one project switch; repeated concurrent history refreshes passed. Add a focused repeated project-selection regression before claiming high-frequency navigation is fully verified.

## Agent lifecycle validation

`npm run test:electron-agent-lifecycle` launched the production Electron build against a temporary, local mock `codex` executable. It did not use credentials, network access, or a paid model.

- Project creation and session creation: verified.
- Default permissions: verified as `workspace-write` (`default`).
- Full Access confirmation modal: verified before escalation.
- Streamed agent output: verified.
- Stop of an active agent: verified; final state was `idle`.
- Resume: verified with persisted `mock-conversation` ID.
- Disk conversation persistence and renderer history discovery: verified.
- Error handling: verified; mock non-zero exit produced `error` and `mock execution failed`.

This verifies the desktop process/IPC lifecycle, not the behavior, cost, authentication, tools, or model protocol of a live OpenAI Codex account. A paid real-model test was deliberately not run because approval was required first.

## Defect found and corrected during validation

On macOS, a project selected through a `/var/...` alias can be recorded by a child process as `/private/var/...`. The old string-only cwd comparison hid that valid thread. `listCodexHistoriesByCwd()` now compares canonical real paths when they exist. A symlink regression test covers the behavior.

## Final checks

- Full Vitest suite: **29 files, 127 tests passed**.
- TypeScript typecheck: **passed**.
- Production build: **passed**.
- Electron UI smoke test: **passed**.
- Synthetic large-history Electron benchmark: **passed**.
- Mocked real-Electron agent lifecycle: **passed**.

## Remaining limitations and security work

- Full transcripts and user prompts have no explicit retention/truncation policy; live child output is capped, but opened history can still be large.
- Repeated high-frequency project switching needs a targeted regression test.
- Real Codex CLI/provider behavior remains untested; run a minimal paid test only after approval.
- Full Access is confirmed in UI but remains a dangerous CLI bypass; per-action approvals do not exist.
- Git switch still lacks dirty-worktree confirmation/preflight.
- Broad local-path IPC, unsandboxed Electron renderer, missing CSP, untrusted skill provenance, global CLI installation flow, dependency vulnerabilities, and unsupported Node 26 alpha remain security/operational risks from the audit.
- Automations, Settings, worktree, rename/path editing and branch creation remain intentionally disabled, not implemented.

## Validation-harness isolation note

The first two validation-runner attempts omitted `--user-data-dir`, which may have replaced Codex Desktop’s local project-list preference with temporary project entries. No project folders, real Codex session files, credentials or system Node installation were touched. The runners were immediately corrected to use isolated temporary profiles; no attempt was made to guess or overwrite the prior preference value. Confirm the saved project list in the app before further work.
