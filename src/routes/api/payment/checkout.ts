import { createFileRoute } from '@tanstack/react-router';

import { respErr } from '@/lib/resp';

// Reviewed release approval is required before restoring the template sales endpoint.
export const Route = createFileRoute('/api/payment/checkout')({
  server: {
    handlers: {
      POST: () =>
        respErr('Live sales are disabled. Use the dance test checkout.', {
          status: 503,
        }),
    },
  },
});
