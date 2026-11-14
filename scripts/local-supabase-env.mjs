// Writes the gitignored .env.auth.dev.local from the running local Supabase stack.
// Only the public API URL and publishable key are written; secrets are never read into the file.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

let raw;
try {
  raw = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch {
  console.error('Local Supabase is not running. Start it with: supabase start');
  process.exit(1);
}
const value = (name) => new RegExp(`^${name}="?([^"\\n]*)"?$`, 'm').exec(raw)?.[1];
const url = value('API_URL');
const key = value('PUBLISHABLE_KEY');
if (!url || !key?.startsWith('sb_publishable_') || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  console.error('Local Supabase did not report a loopback API URL and publishable key.');
  process.exit(1);
}
writeFileSync('.env.auth.dev.local', [
  `GWIRA_SUPABASE_URL=${url}`,
  `GWIRA_SUPABASE_PUBLISHABLE_KEY=${key}`,
  'GWIRA_AUTH_ENVIRONMENT=development',
  ''
].join('\n'), { mode: 0o600 });
console.log(`Local auth profile written for ${url} (development only).`);
