import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-desktop-agent-lifecycle-'));
const project = path.join(workspace, 'project');
const bin = path.join(workspace, 'bin');
const sessionsRoot = path.join(workspace, 'sessions');
const profile = path.join(workspace, 'profile');
const electron = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
await Promise.all([fs.mkdir(project, { recursive: true }), fs.mkdir(bin, { recursive: true })]);

const mock = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('mock-codex 1.0.0'); process.exit(0); }
if (args[0] === 'debug') { console.log(JSON.stringify({ models: [] })); process.exit(0); }
const prompt = args.at(-1) || '';
const root = process.env.MOCK_CODEX_SESSIONS_ROOT;
const cwd = process.cwd();
const file = path.join(root, '2026', '10', '14', 'mock-session.jsonl');
if (prompt.includes('fail')) { console.error('mock execution failed'); process.exit(2); }
if (prompt.includes('slow')) {
  console.log(JSON.stringify({ conversation_id: 'mock-conversation', message: 'Mock agent started slow work' }));
  setTimeout(() => process.exit(0), 10000);
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), type: 'session_meta', payload: { id: 'mock-conversation', cwd, timestamp: new Date().toISOString() } }) + '\\n');
  fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'user_message', message: prompt } }) + '\\n');
  fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'agent_message', message: 'Mock agent completed task' } }) + '\\n');
  console.log(JSON.stringify({ conversation_id: 'mock-conversation', message: 'Mock agent completed task' }));
}
`;
const command = path.join(bin, 'codex');
await fs.writeFile(command, mock, { mode: 0o755 });

try {
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
    CODEX_DESKTOP_SESSIONS_ROOT: sessionsRoot,
    MOCK_CODEX_SESSIONS_ROOT: sessionsRoot,
    ELECTRON_AGENT_LIFECYCLE_TEST: '1',
    ELECTRON_BENCHMARK_PROJECTS: project
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const output = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['.', `--user-data-dir=${profile}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk.toString(); });
    child.stderr.on('data', (chunk) => { text += chunk.toString(); });
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Agent lifecycle test timed out\n${text}`)); }, 30_000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(text);
      else reject(new Error(`Agent lifecycle test failed with code ${code}\n${text}`));
    });
  });
  const match = output.match(/ELECTRON_AGENT_LIFECYCLE_RESULT (.+)/);
  if (!match) throw new Error(`Missing agent lifecycle result\n${output}`);
  const result = JSON.parse(match[1]);
  if (!result.workflowDone || result.defaultPermission !== 'default' || !result.fullAccessConfirmation || !result.streamed || !result.persisted || !result.resumed || result.stoppedStatus !== 'idle' || result.errorStatus !== 'error') {
    throw new Error(`Unexpected agent lifecycle result\n${output}`);
  }
  const sessionFile = path.join(sessionsRoot, '2026', '10', '14', 'mock-session.jsonl');
  const sessionFileExists = await fs.stat(sessionFile).then(() => true).catch(() => false);
  console.log(`ELECTRON_AGENT_LIFECYCLE ${JSON.stringify({ ...result, sessionFileExists })}`);
} finally {
  await fs.rm(workspace, { recursive: true, force: true });
}
