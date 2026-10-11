import { createFileRoute } from '@tanstack/react-router';

import { respData } from '@/lib/resp';

export const Route = createFileRoute('/api/dance/settings')({
  server: {
    handlers: {
      GET: () =>
        respData(
          {
            simulation: process.env.DANCE_GENERATION_MODE !== 'kie',
            acceptance:
              process.env.NODE_ENV !== 'production' &&
              process.env.DANCE_SANDBOX === 'true' &&
              process.env.DANCE_GENERATION_MODE === 'kie',
          },
          { headers: { 'Cache-Control': 'no-store' } }
        ),
    },
  },
});
