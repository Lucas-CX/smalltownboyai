import { createFileRoute } from '@tanstack/react-router';

import { dancePricingSeo } from '@/lib/dance-seo';
import { DancePricing } from '@/blocks/dance-pricing';

export const Route = createFileRoute('/pricing')({
  head: dancePricingSeo,
  component: () => (
    <div className="dance-page">
      <main>
        <DancePricing standalone />
      </main>
    </div>
  ),
});
