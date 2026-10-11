import { createFileRoute } from '@tanstack/react-router';

import { DanceOperationsAdmin } from '@/blocks/dance-operations-admin';

export const Route = createFileRoute('/admin/')({
  component: DanceOperationsAdmin,
});
