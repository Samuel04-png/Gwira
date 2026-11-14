import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (key, fallback) => process.argv.find((arg) => arg.startsWith(`--${key}=`))?.split('=').slice(1).join('=') ?? fallback;
const scenario = option('scenario', 'finished');
if (!['live', 'finished', 'failed', 'background', 'states'].includes(scenario)) throw new Error('Unknown activity trace scenario');
const stage = option('stage', 'after');
const width = option('width', '1280');
const height = option('height', '800');
const directory = path.join(root, 'artifacts/workflow/activity-trace');
await fs.mkdir(directory, { recursive: true });
const profile = await fs.mkdtemp(path.join(directory, '.profile-'));
const server = net.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--configLoader', 'runner', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
vite.stdout.on('data', (chunk) => { output += chunk; });
vite.stderr.on('data', (chunk) => { output += chunk; });
try {
  const url = `http://127.0.0.1:${port}/?activityTraceFixture=${scenario}`;
  let ready = false;
  for (let count = 0; count < 100; count++) {
    if (vite.exitCode !== null) throw new Error(output);
    try { ready = (await fetch(url)).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Vite did not start: ${output}`);
  const env = { ...process.env, ACTIVITY_TRACE_URL: url, ACTIVITY_TRACE_SCENARIO: scenario, ACTIVITY_TRACE_STAGE: stage, ACTIVITY_TRACE_DIRECTORY: directory, ACTIVITY_TRACE_WIDTH: width, ACTIVITY_TRACE_HEIGHT: height, ACTIVITY_TRACE_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(path.join(root, 'node_modules/.bin/electron'), ['scripts/activity-trace-capture.cjs', '--force-device-scale-factor=1', `--user-data-dir=${profile}`], { cwd: root, env, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  if (code !== 0) throw new Error(`Activity capture exited ${code}`);
} finally {
  vite.kill();
  // Isolated profile created by this invocation; no user profile is accessed.
  await fs.rm(profile, { recursive: true, force: true });
}
