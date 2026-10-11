import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const env = {
  ...process.env,
  NODE_ENV: 'production',
  NITRO_PRESET: 'cloudflare_module',
};
// Match cf:deploy: explicit production values override inherited local settings.
for (const line of readFileSync('.env.production', 'utf8').split(/\r?\n/)) {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
if (process.platform === 'win32') {
  env.RUST_MIN_STACK ||= '8388608';
  env.RAYON_NUM_THREADS ||= '2';
}
const result = spawnSync('pnpm', ['build'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
  windowsHide: true,
});
process.exit(result.status || (result.error ? 1 : 0));
