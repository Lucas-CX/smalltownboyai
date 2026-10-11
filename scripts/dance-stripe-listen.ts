import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { getAllConfigs } from '../src/modules/config/service';

const config = await getAllConfigs();
const key = config.stripe_secret_key || '';
if (!key.startsWith('sk_test_')) throw new Error('Stripe test key required');
const cli = process.env.STRIPE_CLI_PATH || 'data/tools/stripe/stripe.exe';
const child = spawn(
  cli,
  [
    'listen',
    '--forward-to',
    'http://localhost:3000/api/dance/stripe-webhook',
    '--events',
    'checkout.session.completed,checkout.session.async_payment_succeeded',
  ],
  {
    env: { ...process.env, STRIPE_API_KEY: key },
    windowsHide: true,
  }
);
let pending = '';
const consume = (chunk: Buffer) => {
  pending += chunk.toString();
  const secret = pending.match(/whsec_[A-Za-z0-9]+/);
  if (secret) {
    const path = '.env.development';
    const source = readFileSync(path, 'utf8').replace(
      /^STRIPE_SIGNING_SECRET=.*\r?\n?/gm,
      ''
    );
    writeFileSync(
      path,
      `${source.trimEnd()}\nSTRIPE_SIGNING_SECRET=${secret[0]}\n`
    );
    console.log('Stripe test listener ready; signing secret saved privately.');
    pending = '';
  } else if (/\[200\]/.test(pending)) {
    console.log('Stripe test webhook delivered: HTTP 200.');
    pending = '';
  } else if (pending.length > 8000) {
    console.log(
      'Stripe listener status changed; inspect Stripe test events if delivery fails.'
    );
    pending = '';
  }
};
child.stdout.on('data', consume);
child.stderr.on('data', consume);
child.on('exit', (code) => console.log(`Stripe listener exited: ${code}`));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
