import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { tDynamic } from '@/core/i18n/dynamic';
import { Link } from '@/core/i18n/navigation';
import { apiGet, apiPost } from '@/lib/api-client';
import type { FunnelReport } from '@/lib/dance-funnel-contract';
import type { FinanceReport } from '@/lib/dance-reporting';
import { m } from '@/paraglide/messages.js';
import { DanceConversionSummary } from '@/blocks/dance-conversion-summary';
import { Button } from '@/components/ui/button';

const money = (cents: number | null) =>
  cents === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(cents / 100);
export function DanceOperationsAdmin() {
  const [days, setDays] = useState(7);
  const [cursors, setCursors] = useState<Record<number, string | undefined>>(
    {}
  );
  const client = useQueryClient();
  const finance = useQuery({
    queryKey: ['admin-finance', days],
    queryFn: () =>
      apiGet<FinanceReport>(`/api/admin/dance-finance?days=${days}`),
    staleTime: 60_000,
    retry: false,
  });
  const funnel = useQuery({
    queryKey: ['admin-operations-funnel', days],
    queryFn: () => apiGet<FunnelReport>(`/api/admin/dance-funnel?days=${days}`),
    staleTime: 60_000,
    retry: false,
  });
  const sync = useMutation({
    mutationFn: (period: number) =>
      apiPost<{ checked: number; updated: number; nextCursor: string | null }>(
        '/api/admin/dance-finance',
        { days: period, afterId: cursors[period] }
      ),
    onSuccess: (data, period) => {
      setCursors((previous) => ({
        ...previous,
        [period]: data.nextCursor || undefined,
      }));
      toast.success(m['admin.metrics.synced'](data));
      void client.invalidateQueries({ queryKey: ['admin-finance'] });
    },
    onError: () => toast.error(m['admin.metrics.sync_error']()),
  });
  return (
    <div className="mx-auto max-w-[1500px] space-y-8 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {m['admin.metrics.title']()}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {m['admin.metrics.subtitle']()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">
            {m['admin.funnel.period']()}{' '}
            <select
              className="bg-background rounded-md border p-2"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[1, 2, 7, 14, 31].map((n) => (
                <option key={n} value={n}>
                  {n === 1
                    ? m['admin.metrics.today']()
                    : `${n} ${m['admin.funnel.days']()}`}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={finance.isFetching || funnel.isFetching}
            onClick={() => {
              void finance.refetch();
              void funnel.refetch();
            }}
          >
            {m['admin.metrics.refresh']()}
          </Button>
        </div>
      </header>
      {finance.isPending && <p role="status">{m['admin.metrics.loading']()}</p>}
      {finance.isError && (
        <p role="alert" className="text-destructive">
          {m['admin.metrics.unavailable']()}
        </p>
      )}
      {finance.data && (
        <section className="space-y-4" aria-busy={finance.isFetching}>
          <div className="space-y-3 rounded-xl border p-4 md:p-5">
            <h2 className="text-lg font-semibold">
              {m['admin.metrics.lifetime_title']()}
            </h2>
            <p className="text-muted-foreground text-sm">
              {m['admin.metrics.lifetime_note']()}
            </p>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                [
                  'lifetime_margin',
                  money(finance.data.lifetime.apiMarginCents),
                ],
                [
                  'lifetime_receipts',
                  money(finance.data.lifetime.receiptsCents),
                ],
                ['lifetime_kie', money(finance.data.lifetime.kieCostCents)],
                ['lifetime_orders', String(finance.data.lifetime.paidOrders)],
              ].map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <h3 className="text-muted-foreground text-sm">
                    {tDynamic(`admin.metrics.${key}`)}
                  </h3>
                  <p className="mt-2 text-2xl font-semibold break-all tabular-nums md:text-3xl">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            {(finance.data.lifetime.missingCosts > 0 ||
              finance.data.lifetime.invalidOrders > 0) && (
              <p role="status" className="text-sm">
                {m['admin.metrics.lifetime_incomplete']({
                  tasks: finance.data.lifetime.missingCosts,
                  orders: finance.data.lifetime.invalidOrders,
                })}
              </p>
            )}
          </div>
          <h2 className="pt-2 text-lg font-semibold">
            {m['admin.metrics.period_title']({ days })}
          </h2>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ['receipts', money(finance.data.total.receiptsCents)],
              ['kie', money(finance.data.total.kieCostCents)],
              ['margin', money(finance.data.total.apiMarginCents)],
              ['missing', String(finance.data.total.missingCosts)],
            ].map(([key, value]) => (
              <div
                key={key}
                className="bg-card min-w-0 rounded-lg border p-4 md:p-5"
              >
                <h2 className="text-muted-foreground text-sm">
                  {tDynamic(`admin.metrics.${key}`)}
                </h2>
                <p className="mt-3 text-2xl font-semibold break-all tabular-nums md:text-3xl">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="bg-muted/40 space-y-2 rounded-lg border p-4 text-sm">
            <p>{m['admin.metrics.profit_note']()}</p>
            <details className="text-muted-foreground">
              <summary className="cursor-pointer">
                {m['admin.metrics.methodology']()}
              </summary>
              <p className="mt-2">{m['admin.metrics.cost_note']()}</p>
            </details>
            {(finance.data.total.missingCosts > 0 ||
              finance.data.total.invalidOrders > 0) && (
              <p className="font-medium">{m['admin.metrics.incomplete']()}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {m['admin.metrics.daily_finance']()}
            </h2>
            <Button
              variant="outline"
              disabled={sync.isPending || !finance.data.total.missingCosts}
              onClick={() => sync.mutate(days)}
            >
              {sync.isPending
                ? m['admin.metrics.syncing']()
                : cursors[days]
                  ? m['admin.metrics.next_batch']()
                  : m['admin.metrics.sync']()}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="bg-muted/50">
                <tr>
                  {[
                    'date',
                    'orders',
                    'receipts',
                    'tasks',
                    'kie',
                    'margin',
                    'status',
                  ].map((key) => (
                    <th className="p-3 font-medium whitespace-nowrap" key={key}>
                      {tDynamic(`admin.metrics.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...finance.data.days].reverse().map((day) => (
                  <tr key={day.date} className="border-t">
                    <th className="p-3 font-medium whitespace-nowrap">
                      {day.date}
                    </th>
                    <td className="p-3">{day.paidOrders}</td>
                    <td className="p-3">{money(day.receiptsCents)}</td>
                    <td className="p-3">{day.kieTasks}</td>
                    <td className="p-3">{money(day.kieCostCents)}</td>
                    <td className="p-3 font-semibold">
                      {money(day.apiMarginCents)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {day.invalidOrders > 0
                        ? m['admin.metrics.invalid_orders']()
                        : day.apiMarginCents === null
                          ? m['admin.metrics.pending_cost']({
                              count: day.missingCosts,
                            })
                          : m['admin.metrics.recorded']()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs">
            {m['admin.metrics.updated']({
              time: new Date(finance.data.generatedAt).toLocaleString('en-GB', {
                timeZone: 'Asia/Shanghai',
              }),
            })}
          </p>
        </section>
      )}
      {funnel.isPending && <p role="status">{m['admin.metrics.loading']()}</p>}
      {funnel.isError && (
        <p role="alert" className="text-destructive">
          {m['admin.funnel.unavailable']()}
        </p>
      )}
      {funnel.data && <DanceConversionSummary days={funnel.data.daily} />}
      <Link
        href="/admin/dance-funnel"
        className="text-primary underline underline-offset-4"
      >
        {m['admin.metrics.journeys']()}
      </Link>
    </div>
  );
}
