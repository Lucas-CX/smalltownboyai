import { createFileRoute } from '@tanstack/react-router';

import { DanceAccountOverview } from '@/blocks/dance-account-overview';

export const Route = createFileRoute('/settings/')({
  component: DanceAccountOverview,
});
