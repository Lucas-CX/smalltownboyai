import { createFileRoute } from '@tanstack/react-router';

import { DanceAdmin } from '@/blocks/dance-studio';

export const Route = createFileRoute('/admin/dance')({ component: DanceAdmin });
