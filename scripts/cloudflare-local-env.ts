import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { getAllConfigs } from '../src/modules/config/service';

const config = await getAllConfigs();
if (!config.stripe_secret_key?.startsWith('sk_test_'))
  throw new Error('Stripe test key required');
writeFileSync(
  '.dev.vars',
  [
    `AUTH_SECRET=${randomBytes(32).toString('hex')}`,
    `CONFIG_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
    `STRIPE_SECRET_KEY=${config.stripe_secret_key}`,
    `STRIPE_SIGNING_SECRET=whsec_${randomBytes(32).toString('hex')}`,
  ].join('\n') + '\n'
);
console.log(
  'Local Workers secrets saved privately; no Kie key or paid permit configured.'
);
