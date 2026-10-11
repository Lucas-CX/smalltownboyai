import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Cross-platform replacement for shell-sourcing env. Never print values.
for (const line of readFileSync('.env.production', 'utf8').split(/\r?\n/)) {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if (match) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
process.env.NODE_ENV = 'production';
process.env.NITRO_PRESET = 'cloudflare_module';
// Rolldown's Rust workers can exhaust the default Windows thread stack while
// bundling the SSR dependency graph. Respect an explicit operator override.
if (process.platform === 'win32') {
  process.env.RUST_MIN_STACK ||= '8388608';
  // Bound Rust worker memory on machines also running browsers/dev servers.
  process.env.RAYON_NUM_THREADS ||= '2';
}
for (const args of [['build'], ['exec', 'wrangler', 'deploy']]) {
  const result = spawnSync('pnpm', args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const discovery = spawnSync(process.execPath, ['scripts/submit-indexnow.mjs'], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});
if (discovery.status !== 0) {
  console.warn(
    'Deployment completed, but IndexNow submission did not pass. Retry pnpm seo:indexnow after checking the live deployment.'
  );
}
