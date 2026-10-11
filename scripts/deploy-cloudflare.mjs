import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

import {
  liveCheck,
  preflight,
  productionEnv,
  readConfig,
} from './seo-release-gate.mjs';

// Cross-platform replacement for shell-sourcing env. Never print values.
const releaseEnv = productionEnv();
const preview = process.argv.includes('--preview');
const origin = preflight(releaseEnv, readConfig('wrangler.jsonc'), preview);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
assert.match(revision, /^[a-f0-9]{40}$/);
function verifyCheckout() {
  assert.equal(
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    '',
    'Commit all release changes before deploying'
  );
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    revision,
    'Git revision changed during build; rebuild the intended revision'
  );
}
verifyCheckout();
console.log(`Deploying Git revision ${revision}`);
// Fixture tests must not inherit production credentials or production-only guards.
const checkEnv = { ...process.env, NODE_ENV: 'test' };
Object.assign(process.env, releaseEnv);
process.env.VITE_PREVIEW_ONLY = releaseEnv.VITE_PREVIEW_ONLY ?? 'false';
process.env.NODE_ENV = 'production';
process.env.NITRO_PRESET = 'cloudflare_module';
// Rolldown's Rust workers can exhaust the default Windows thread stack while
// bundling the SSR dependency graph. Respect an explicit operator override.
if (process.platform === 'win32') {
  process.env.RUST_MIN_STACK ||= '8388608';
  // Bound Rust worker memory on machines also running browsers/dev servers.
  process.env.RAYON_NUM_THREADS ||= '2';
}
for (const args of [
  ['security:audit'],
  ['seo:gate:test'],
  ['dance:test'],
  ['dance:conversion:test'],
  ['exec', 'tsc', '--noEmit'],
  ['build'],
  [
    'exec',
    'wrangler',
    'deploy',
    '--tag',
    revision.slice(0, 12),
    '--message',
    `git:${revision}`,
  ],
]) {
  if (args[0] === 'exec' && args[1] === 'wrangler') {
    preflight(releaseEnv, readConfig('.output/server/wrangler.json'), preview);
    verifyCheckout();
  }
  const result = spawnSync('pnpm', args, {
    stdio: 'inherit',
    env: args[0] === 'build' || args[1] === 'wrangler' ? process.env : checkEnv,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (preview) {
  console.log('IndexNow skipped: this deployment is not open for indexing.');
  process.exit(0);
}
let verified = false;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    console.log(JSON.stringify(await liveCheck(origin)));
    verified = true;
    break;
  } catch (error) {
    console.error(`Post-deploy SEO attempt ${attempt}: ${error.message}`);
    if (attempt < 3) await setTimeout(10000);
  }
}
if (!verified) {
  console.error(
    'Worker was deployed, but SEO verification FAILED. IndexNow was NOT submitted. Investigate the live release; do not report launch acceptance or automatically roll back.'
  );
  process.exit(1);
}
console.log(
  'Origin SEO passed. GSC fetch/read/index status is UNVERIFIED. Complete the GSC checklist in docs/SEO-RELEASE-GATE.md.'
);
const regression = spawnSync('pnpm', ['seo:test'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SEO_TEST_URL: origin,
    SEO_TEST_INDEXABLE: 'true',
    SEO_TEST_PREVIEW: 'false',
  },
  shell: process.platform === 'win32',
  windowsHide: true,
});
if (regression.status !== 0) {
  console.error(
    'Worker was deployed, but public-page SEO regression FAILED. Search submission skipped.'
  );
  process.exit(regression.status || 1);
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
