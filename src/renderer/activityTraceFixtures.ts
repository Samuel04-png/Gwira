import type { SessionMessage } from '../shared/types.js';

/** Renderer-only, explicitly labelled fixtures. Never enters a session or storage. */
export function activityTraceFixture(name: string | null): { name: string; messages: SessionMessage[]; isRunning: boolean } | undefined {
  if (!name || !['live', 'finished', 'failed', 'background', 'states', 'visual-system'].includes(name)) return undefined;
  if (name === 'visual-system') return { name:'Visual QA sample · no work executed',isRunning:false,messages:[
    {id:'visual-user',role:'user',text:'Help me review a proposed weekly operations brief. Keep approvals with me.',createdAt:'2026-11-03T07:00:00Z'},
    {id:'visual-answer',role:'codex',createdAt:'2026-11-03T07:00:01Z',text:'# A proposed weekly brief\n\nThis is a **development visual sample**, not a report of executed work. Use a short summary to make the next decision clear.\n\n## Review the next steps\n\n1. Confirm the source records.\n2. Review responsibilities and constraints.\n3. Approve changes before recording them.\n\n- [x] Preview available\n- [ ] Human review pending\n\n| Item | Current state |\n| --- | --- |\n| Workflow | Proposed |\n| Outgoing messages | Not sent |\n\n> Keep decisions with the person responsible for the work.\n\nUse `reviewRequired` to describe the boundary. See [the review guide](https://example.com/review).\n\n```ts\nconst proposal = { reviewRequired: true };\n```\n\n### Nothing has been executed\n\n*Review the proposal* before creating work.'}
  ] };
  const start = Date.parse('2026-10-24T14:00:00Z');
  const message = (role: SessionMessage['role'], text: string, minute: number, id: string): SessionMessage => ({ id, role, text, createdAt: new Date(start + minute * 60_000).toISOString() });
  const commands = [
    `Ran /bin/zsh -lc "sed -n '1,180p' src/renderer/components/Transcript.tsx"\nOutput\nWall time: 0.041 seconds\nProcess exited with code 0\nOutput:\nexport function Transcript() {\n  return renderConversation();\n}\n`,
    `Ran /bin/zsh -lc "rg -n 'activity|tool_call' src/renderer"\nOutput\nWall time: 0.024 seconds\nProcess exited with code 0\nOutput:\nsrc/renderer/components/Transcript.tsx:97: ActivityMessage\n`,
    `Applied patch\n*** Begin Patch\n*** Update File: src/renderer/components/Transcript.tsx\n@@\n-<summary>activity</summary>\n+<RunSummary />\n*** End Patch\n`,
    `Ran /bin/zsh -lc "npm run typecheck"\nOutput\nWall time: 2.4 seconds\nProcess exited with code 0\nOutput:\nTypeScript checked successfully.\n`
  ];
  const user = message('user', 'Make the execution trace easier to scan and keep the response readable.', 0, 'fixture-user');
  const final = message('codex', 'The execution trace is easier to scan. Related steps are grouped, and commands and output are available when you need them.\n\nYour conversation and recorded events are preserved.', 35, 'fixture-final');
  if (name === 'states') return { name: 'Status glyph samples · recorded text only', isRunning: true, messages: [user, message('system', commands[0] + 'Error\nThe command could not finish.\nWaiting for a person\nQueued command\nRan npm run build\n', 1, 'fixture-states')] };
  if (name === 'background') {
    const raw = '2026-10-24T14:03:00.000Z ERROR codex_core::models_manager: /workspace/codex/core/src/models_manager.rs:218: Could not refresh the model list: request timed out';
    return { name: 'Repeated background errors', isRunning: false, messages: [user, message('system', `Error\n${raw}\nError\n${raw.replace('14:03:00', '14:03:05')}\n`, 3, 'fixture-errors'), final] };
  }
  if (name === 'live') return { name: 'Live run', isRunning: true, messages: [user, message('system', commands[0] + commands[1] + 'Ran /bin/zsh -lc "npm run build"\n', 1, 'fixture-live')] };
  if (name === 'failed') return { name: 'One failed step', isRunning: false, messages: [user, message('system', commands[0] + 'Ran /bin/zsh -lc "npm run build"\nOutput\nWall time: 2.5 seconds\nProcess exited with code 1\nOutput:\nError: Build failed: a required module could not be resolved.\n', 1, 'fixture-failed'), message('codex', 'The build could not finish because a required module could not be resolved. The command and full output are available in the failed step.', 4, 'fixture-final')] };
  const steps = Array.from({ length: 28 }, (_, index) => commands[index % commands.length]);
  steps[27] = `Ran /bin/zsh -lc "npm test"\nOutput\nWall time: 3.6 seconds\nProcess exited with code 0\nOutput:\n${Array.from({ length: 600 }, (_, index) => `Verification output line ${index + 1}: existing behavior preserved.`).join('\n')}\n`;
  return { name: 'Finished run · 28 steps · 600 output lines', isRunning: false, messages: [user, message('system', steps.join(''), 1, 'fixture-28'), final] };
}
