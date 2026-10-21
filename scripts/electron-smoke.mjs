import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-desktop-smoke-'));
const profile = path.join(workspace, 'profile');
const projects = [path.join(workspace, 'project-one'), path.join(workspace, 'project-two')];
const addedProject = path.join(workspace, 'project-added');
const sessionsRoot = path.join(workspace, 'sessions');
await Promise.all([...projects, addedProject].map((project) => fs.mkdir(project, { recursive: true })));
const now = new Date();
const historyLines = (id, cwd, title, offsetMinutes) => [
  { timestamp: new Date(now.getTime() - offsetMinutes * 60_000).toISOString(), type: 'session_meta', payload: { id, cwd, timestamp: new Date(now.getTime() - offsetMinutes * 60_000).toISOString() } },
  { timestamp: new Date(now.getTime() - offsetMinutes * 60_000).toISOString(), type: 'event_msg', payload: { type: 'user_message', message: title } }
].map((entry) => JSON.stringify(entry)).join('\n');
await fs.mkdir(path.join(sessionsRoot, '2026', '10', '15'), { recursive: true });
await Promise.all([
  fs.writeFile(path.join(sessionsRoot, '2026', '10', '15', 'recent-one.jsonl'), `${historyLines('smoke-recent-one', projects[0], 'Review the quarterly operating plan', 1)}\n`),
  fs.writeFile(path.join(sessionsRoot, '2026', '10', '15', 'recent-two.jsonl'), `${historyLines('smoke-recent-two', projects[1], '{"page_id":null}', 2)}\n`)
]);

try {
  await new Promise((resolve, reject) => {
    const electron = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
    const childEnv = {
      ...process.env,
      ELECTRON_SMOKE_TEST: '1',
      ELECTRON_SMOKE_PROJECTS: projects.join(path.delimiter),
      ELECTRON_SMOKE_ADD_PROJECT: addedProject,
      CODEX_DESKTOP_SESSIONS_ROOT: sessionsRoot
    };
    if (process.env.ELECTRON_SMOKE_SCREENSHOT_PATH) childEnv.ELECTRON_SMOKE_SCREENSHOT_PATH = process.env.ELECTRON_SMOKE_SCREENSHOT_PATH;
    if (process.env.ELECTRON_SMOKE_PROJECT_HEADER_DEFAULT_SCREENSHOT_PATH) childEnv.ELECTRON_SMOKE_PROJECT_HEADER_DEFAULT_SCREENSHOT_PATH = process.env.ELECTRON_SMOKE_PROJECT_HEADER_DEFAULT_SCREENSHOT_PATH;
    if (process.env.ELECTRON_SMOKE_PROJECT_HEADER_HOVER_SCREENSHOT_PATH) childEnv.ELECTRON_SMOKE_PROJECT_HEADER_HOVER_SCREENSHOT_PATH = process.env.ELECTRON_SMOKE_PROJECT_HEADER_HOVER_SCREENSHOT_PATH;
    delete childEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, ['.', `--user-data-dir=${profile}`], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const collect = (chunk) => { output += chunk.toString(); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Electron smoke test timed out\n${output}`));
    }, 20_000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && output.includes('ELECTRON_SMOKE_RESULT')) resolve();
      else reject(new Error(`Electron smoke test failed with code ${code}\n${output}`));
    });
  });
} finally {
  await fs.rm(workspace, { recursive: true, force: true });
}
