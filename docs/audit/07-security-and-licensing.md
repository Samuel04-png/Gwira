# Security and licensing audit

## Security findings

| Severity | Finding | Evidence | Required direction |
|---|---|---|---|
| Critical design risk | Unsafe execution selected by default | `main.tsx` initializes full access; `codexCommand.ts` passes the dangerous bypass flag. | Least privilege default, explicit escalation, approvals and policy enforcement. |
| High | Broad local-file IPC | Renderer can ask main to read arbitrary image paths, reveal arbitrary paths, list/switch Git in arbitrary cwd, and delete paths under `~/.codex/sessions`. | Validate schemas/realpaths, restrict to approved projects/attachments, require user gesture where appropriate. |
| High | No CSP visible in renderer HTML/config | Electron window is not sandboxed; external content/link behavior must be defensive. | Add restrictive CSP, enable sandbox if compatibility permits, navigation allowlist and security regression tests. |
| High | Unbounded resource use | History, project scans, output buffers and sessions lack budgets/backpressure. | Bounded IO/concurrency/memory/timeouts and telemetry. |
| Medium | Untrusted skill content | Skill markdown is read, displayed and path-deleted by ID; enablement is UI metadata, not runtime policy. | Signed/trusted sources, provenance, scoped permissions and install review. |
| Medium | Global CLI installation from app | UI can invoke `npm install -g @openai/codex`. | Pin/review source/version, communicate impact and avoid silent elevation. |
| Medium | Error/command content may be sensitive | CLI stderr/tool output is retained/rendered and future telemetry could leak it. | Redaction, consent, encrypted storage, access/retention controls. |

`contextIsolation: true` and `nodeIntegration: false` are positive controls. Shell command construction mostly uses argument arrays (reducing shell injection), but that does not limit what the permitted Codex agent can do.

## Dependency audit

`npm audit --omit=dev` on 2026-10-14 reported **3 high** vulnerabilities: `nanoid` (two denial-of-service advisories), `postcss` (source-map path/file disclosure advisories), and `source-map-js` (event-loop DoS). Audit reports a non-forced `npm audit fix` route. No upgrade was applied. The current result differs from the older 10 moderate/13 high/2 critical report in the brief; the working dependency manifests already had user changes, including a `yauzl` override, and were preserved. Re-run a locked production/development audit in CI after reviewing the uncommitted manifest changes.

## Licensing and commercial use

There is no repository-root `LICENSE` file and `package.json` has no `license` field. README states commercial use is allowed only with clear visible attribution to “Codex Desktop” and its GitHub repository. This is a stated attribution condition, but it is not a standard machine-readable license; obtain written clarification from the copyright holder/MangoWork before using the code as proprietary Gwira product foundation. Preserve required third-party notices from packaged dependencies; Electron, React, TypeScript, Vite and transitive packages have their own licenses. Also review Codex/OpenAI terms, provider terms, Apple/Windows signing conditions and all connector terms independently. This is technical licensing triage, not legal advice.
