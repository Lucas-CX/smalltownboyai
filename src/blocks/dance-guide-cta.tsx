import { Link } from '@/core/i18n/navigation';
import { m } from '@/paraglide/messages.js';
import { buttonVariants } from '@/components/ui/button';

export function DanceGuideCta() {
  return (
    <aside
      data-guide-cta
      aria-labelledby="guide-cta-title"
      className="bg-muted/50 mt-10 rounded-2xl border p-6 sm:p-8"
    >
      <h2
        id="guide-cta-title"
        className="text-foreground text-xl font-semibold"
      >
        {m['dance.guide_cta.title']()}
      </h2>
      <p className="text-muted-foreground mt-3 leading-7">
        {m['dance.guide_cta.description']()}
      </p>
      <div className="mt-5">
        <Link
          href="/#studio"
          className={buttonVariants({
            size: 'lg',
            className: 'min-h-11 w-full px-5 sm:w-auto',
          })}
        >
          {m['dance.guide_cta.action']()} →
        </Link>
      </div>
      <p className="text-muted-foreground mt-3 text-sm leading-6">
        {m['dance.guide_cta.note']()}
      </p>
    </aside>
  );
}
