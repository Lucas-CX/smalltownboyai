import { Link } from '@/core/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';

export function DanceGuideActions({
  label,
  secondaryLabel,
  secondaryHref,
}: {
  label: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <div
      data-guide-primary-action
      className="my-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5"
    >
      <Link
        href="/#studio"
        className={buttonVariants({
          size: 'lg',
          className: 'min-h-12 w-full px-6 sm:w-auto',
        })}
      >
        {label} <span aria-hidden="true">→</span>
      </Link>
      {secondaryLabel && secondaryHref && (
        <Link
          href={secondaryHref}
          className="text-muted-foreground hover:text-foreground text-center text-sm underline underline-offset-4"
        >
          {secondaryLabel}
        </Link>
      )}
    </div>
  );
}
