import { createFileRoute } from '@tanstack/react-router';

import { danceSeo } from '@/lib/dance-seo';
import { DanceStudio } from '@/blocks/dance-studio';

export const Route = createFileRoute('/')({
  head: danceSeo,
  component: DanceStudio,
});
