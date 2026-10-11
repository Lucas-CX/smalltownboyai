import { createFileRoute } from '@tanstack/react-router';

import { DanceFunnelAdmin } from '@/blocks/dance-funnel-admin';

export const Route = createFileRoute('/admin/dance-funnel')({
  component: DanceFunnelAdmin,
});
