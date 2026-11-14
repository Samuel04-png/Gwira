import { spawn } from 'node:child_process';
import net from 'node:net';

const host = '127.0.0.1';
const port = await findFreePort(5173);
const rendererUrl = `http://${host}:${port}`;
const children = [];
let shuttingDown = false;

console.log(`Starting Gwira dev server on ${rendererUrl}`);

const tsc = start('tsc', ['-p', 'tsconfig.electron.json', '--watch', '--preserveWatchOutput'], { label: 'tsc' });
const vite = start('vite', ['--host', host, '--port', String(port)], { label: 'vite' });

await Promise.all([
  waitForInitialCompilation(tsc),
  waitForTcp(host, port)
]);

start('electron', ['.'], {
  label: 'electron',
  env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl }
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: options.env || process.env,
    shell: false
  });
  children.push(child);

  child.stdout.on('data', (chunk) => write(options.label, chunk));
  child.stderr.on('data', (chunk) => write(options.label, chunk));
  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0 && signal !== 'SIGTERM') {
      console.error(`${options.label || command} exited with code=${code} signal=${signal}`);
      shutdown();
    }
  });
  return child;
}

function write(label, chunk) {
  const prefix = label ? `[${label}] ` : '';
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.length > 0) console.log(`${prefix}${line}`);
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 250);
}

async function findFreePort(startPort) {
  for (let candidate = startPort; candidate < startPort + 100; candidate += 1) {
    if (await isFree(candidate)) return candidate;
  }
  throw new Error(`No free port found from ${startPort} to ${startPort + 99}`);
}

function isFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

function waitForTcp(waitHost, waitPort) {
  return retryUntil(`tcp:${waitPort}`, () => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: waitHost, port: waitPort }, () => {
      socket.destroy();
      resolve();
    });
    socket.once('error', reject);
  }));
}

async function retryUntil(label, action) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      await action();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// Existing dist files may belong to an older main/preload contract. Do not start
// Electron until this watch process has emitted its first successful build.
function waitForInitialCompilation(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const onData = chunk => { output = (output + chunk.toString()).slice(-16000); if (/Found 0 errors\. Watching for file changes\./.test(output)) { clearTimeout(timer); child.stdout.off('data',onData); resolve(); } };
    const timer = setTimeout(() => { child.stdout.off('data',onData); reject(new Error('Electron compilation did not finish successfully. Check the TypeScript output before restarting.')); },60000);
    child.stdout.on('data',onData);
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Electron compiler exited before the initial build.')); });
  });
}
