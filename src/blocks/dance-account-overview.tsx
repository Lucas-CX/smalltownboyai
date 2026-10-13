import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { apiGet } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function DanceAccountOverview() {
  const { data: session } = useSession();
  const credits = useQuery({
    queryKey: ['dance-credits', session?.user.id],
    queryFn: () => apiGet<{ balance: number }>('/api/dance/credits'),
    enabled: !!session?.user,
  });
  const links = [
    {
      href: '/#orders',
      title: m['settings.overview.videos'](),
      description: m['settings.overview.videos_description'](),
    },
    {
      href: '/settings/payments',
      title: m['settings.payments.title'](),
      description: m['settings.overview.payments_help'](),
    },
    {
      href: '/contact',
      title: m['settings.nav.tickets'](),
      description: m['settings.overview.support_help'](),
    },
  ];
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{m['settings.title']()}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {m['settings.welcome']({
            name: session?.user.name || session?.user.email || '',
          })}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{m['settings.credits.title']()}</CardTitle>
          <CardDescription>
            {m['settings.overview.credits_help']()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-3xl font-semibold">
            {credits.isError ? '—' : (credits.data?.balance ?? '—')}
          </p>
          {credits.isError && (
            <p role="alert" className="text-sm">
              {m['common.sign.request_failed']()}{' '}
              <button className="underline" onClick={() => credits.refetch()}>
                {m['dance.retry']()}
              </button>
            </p>
          )}
          <Link href="/settings/credits" className="text-sm underline">
            {m['settings.nav.credits']()}
          </Link>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {links.map((item) => (
          <Card key={item.href}>
            <CardHeader>
              <CardTitle>
                <Link href={item.href} className="underline underline-offset-4">
                  {item.title}
                </Link>
              </CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
