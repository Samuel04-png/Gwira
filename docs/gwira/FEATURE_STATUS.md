# Gwira feature status

| Feature | Status | Scope / limitation |
|---|---|---|
| Codex coding workspace | Fully working | Existing local CLI workflow; retains workspace-write default and Full Access confirmation. |
| Local project/thread history | Fully working | Bounded and cached Phase 1 implementation; local only. |
| Gwira business domain | Local prototype only | Validated and bounded browser-local persistence; no cloud collaboration or authorization. |
| Local tasks, actors, projects, approvals, activity | Fully working | Shared local state, pending-approval completion guard, restart recovery for interrupted local runs, and bounded activity. |
| Coding-agent task execution | Local prototype only | Reuses actual local Codex session lifecycle, duplicate-start guard and explicit stop state; default workspace-write only. |
| Home / My Work / Inbox / Agents | Fully working | Data-backed local surfaces; Inbox is local task/approval activity, not external messaging. |
| Doats | Local prototype only | Persisted local workforce profiles with deterministic SVG identities. Only a detected local Codex CLI can be configured to execute supported coding tasks; other providers are explicitly unavailable. |
| Local onboarding | Fully working (local) | Resumable business-setup guidance persists in the Gwira local store. It creates no account, invitation, cloud workspace, or automatic worker. |
| Integrations catalog | Local prototype only | All catalog entries are explicitly unavailable; no OAuth, credential storage, synchronization, or messaging is implemented. |
| Cloud AI provider and job contracts | Architecture only | Typed provider/job contracts are tested but have no network adapter, queue, worker, deployment, or cloud execution. |
| Teams / workspace preferences | Local prototype only | Add people, add coding-agent records, and rename the local workspace. No invitations or synchronization. |
| Automations / Scheduled / Explore | Blocked | Require a workflow scheduler, policy/approval model and durable backend. |
| External email, WhatsApp and connectors | Blocked | Require authorized connectors, credentials and policy/audit controls. |
| Multi-user collaboration | Blocked | Requires real backend, identity, tenancy and authorization. |
| Commercial distribution | Blocked | Repository licensing requires written clarification and legal review. |
| Malformed local-state recovery | Local prototype only | Preserves invalid raw payload in a recovery key and warns the user; guided recovery/export remains planned. |
