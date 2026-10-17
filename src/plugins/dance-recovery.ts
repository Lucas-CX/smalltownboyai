import { definePlugin } from 'nitro';

import { sweepDanceRecovery } from '../lib/dance-recovery.server';

export default definePlugin((nitro) => {
  nitro.hooks.hook('cloudflare:scheduled', async ({ env }) => {
    (globalThis as any).__CF_ENV__ = env;
    try {
      await sweepDanceRecovery();
    } catch (error) {
      console.error('Dance recovery invocation failed');
      throw error;
    }
  });
});
