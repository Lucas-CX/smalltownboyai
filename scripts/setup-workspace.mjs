import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] || 'local';
if (!['local', 'production'].includes(mode)) {
  throw new Error('Usage: node scripts/setup-workspace.mjs local|production');
}

if (mode === 'local') {
  const target = '.env.development';
  if (existsSync(target)) {
    console.log(`${target} already exists; preserved without changes.`);
  } else {
    const template = readFileSync('.env.example', 'utf8');
    const content = template.replace(
      /^AUTH_SECRET=\r?$/m,
      `AUTH_SECRET=${randomBytes(32).toString('base64')}`
    );
    writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
    console.log(
      'Created local mock configuration with a new private auth secret.'
    );
  }
} else {
  for (const [source, target] of [
    ['.env.production.example', '.env.production'],
    ['wrangler.production.example.jsonc', 'wrangler.jsonc'],
  ]) {
    if (existsSync(target)) {
      console.log(`${target} already exists; preserved without changes.`);
    } else {
      copyFileSync(source, target);
      console.log(
        `Created ${target}; existing Cloudflare secrets stay remote.`
      );
    }
  }
}
