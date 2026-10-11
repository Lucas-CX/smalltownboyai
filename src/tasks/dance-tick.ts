import { defineTask } from 'nitro/task';

export default defineTask({
  meta: {
    name: 'dance:tick',
    description: 'Reconcile dance jobs and delete expired private files',
  },
  async run() {
    try {
      const moduleName = 'cloudflare:workers';
      const { env } = await import(/* @vite-ignore */ moduleName);
      (globalThis as any).__CF_ENV__ = env;
      const { tick } = await import('@/modules/dance/service');
      const { restoreFailedDanceCredits } =
        await import('@/modules/ai-tasks/service');
      const { getAllConfigs } = await import('@/modules/config/service');
      const config = await getAllConfigs();
      await tick(config.kie_api_key);
      await restoreFailedDanceCredits();
      return { result: 'processed' };
    } catch (error) {
      console.error(
        'Dance scheduled task failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
