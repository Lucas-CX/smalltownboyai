import { createFileRoute } from '@tanstack/react-router';

import { danceDiscoveryText } from '@/lib/dance-discovery';

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(danceDiscoveryText(true), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
    },
  },
});
