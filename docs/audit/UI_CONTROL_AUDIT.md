# UI control audit — stabilization

Audited 2026-10-14 by tracing every interactive control in `src/renderer/main.tsx` to its handler and main-process IPC path where applicable.

| Area | Controls | Status after stabilization |
|---|---|---|
| Primary navigation | New thread, Skills, Automations | New thread and Skills work; Automations is disabled with an explanation because no backend exists. |
| Projects | Add, selector, expand, new thread, open/delete history, remove | Implemented paths remain active; stale file/history results and open-history errors are handled. Project path edit is disabled because it previously incorrectly added a new project. |
| Project menu | Remove, worktree, rename | Remove works. Worktree and rename are disabled with explanations; neither backend exists. |
| Composer | Send/stop, attachments, @files, /skills, model/reasoning/permission pickers | Active. Stop now has a single terminal lifecycle; Full Access requires confirmation. |
| Git | Branch picker/search/switch, create branch | List/search/switch use existing backend; switch errors are visible. Create branch remains disabled because no implementation exists. |
| Skills | Refresh/search/detail/enable/disable/uninstall/open folder/create prompt | Existing local-skill functions remain active; refresh errors are surfaced. No third-party install/trust flow was invented. |
| Modals | Onboarding, delete history, bootstrap, Full Access, skill detail, image preview | Existing handlers traced; Full Access confirmation added. |
| Other controls | Copy, local/external links, branch/file/skill chips, attachment/image removal | Existing renderer or explicit IPC behavior traced; no silent no-op discovered. |

The native-looking onboarding window controls only close/dismiss onboarding; they do not minimize or close the Electron window. This is an existing UI behavior and should be redesigned only with explicit product approval.

No new Automations, Settings, worktree, rename, or branch-creation behavior was added: those need defined product semantics and backend support, so disabling them is safer than simulating a feature.
