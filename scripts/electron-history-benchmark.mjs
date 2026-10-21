import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const electron = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-desktop-history-benchmark-'));
const results = [];

try {
  for (const count of [100, 1_000, 5_000]) {
    const root = path.join(workspace, String(count));
    const profile = path.join(root, 'profile');
    const sessionsRoot = path.join(root, 'sessions');
    const projects = Array.from({ length: 5 }, (_, index) => path.join(root, `project-${index + 1}`));
    await Promise.all(projects.map((project) => fs.mkdir(project, { recursive: true })));
    const sessionDirectory = path.join(sessionsRoot, '2026', '10', '14');
    await fs.mkdir(sessionDirectory, { recursive: true });
    const filler = 'x'.repeat(32 * 1024);
    for (let index = 0; index < count; index += 1) {
      const project = projects[index % projects.length];
      const id = `synthetic-${count}-${index}`;
      const createdAt = `2026-10-14T10:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`;
      const lines = [
        JSON.stringify({ timestamp: createdAt, type: 'session_meta', payload: { id, cwd: project, timestamp: createdAt } }),
        JSON.stringify({ timestamp: createdAt, type: 'event_msg', payload: { type: 'user_message', message: `Synthetic task ${index}` } }),
        JSON.stringify({ timestamp: createdAt, type: 'event_msg', payload: { type: 'agent_message', message: filler } })
      ];
      await fs.writeFile(path.join(sessionDirectory, `thread-${String(index).padStart(6, '0')}.jsonl`), `${lines.join('\n')}\n`);
    }
    const output = await runElectron({
      CODEX_DESKTOP_SESSIONS_ROOT: sessionsRoot,
      ELECTRON_HISTORY_BENCHMARK: '1',
      ELECTRON_BENCHMARK_PROJECTS: projects.join(path.delimiter),
      ELECTRON_BENCHMARK_PROFILE: profile
    });
    const match = output.match(/ELECTRON_HISTORY_BENCHMARK_RESULT (.+)/);
    if (!match) throw new Error(`Missing history benchmark result for ${count}\n${output}`);
    results.push({ conversations: count, ...JSON.parse(match[1]) });
  }
  console.log(`ELECTRON_HISTORY_BENCHMARKS ${JSON.stringify(results)}`);
} finally {
  await fs.rm(workspace, { recursive: true, force: true });
}

function runElectron(environment) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...environment };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, ['.', '--js-flags=--expose-gc', `--user-data-dir=${environment.ELECTRON_BENCHMARK_PROFILE}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Electron history benchmark timed out\n${output}`));
    }, 60_000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error(`Electron history benchmark failed with code ${code}\n${output}`));
    });
  });
}
