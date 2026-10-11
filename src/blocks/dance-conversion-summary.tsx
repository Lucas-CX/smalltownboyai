import { tDynamic } from '@/core/i18n/dynamic';
import {
  conversionRate,
  conversionSteps,
  type ConversionDay,
} from '@/lib/dance-reporting';
import { m } from '@/paraglide/messages.js';

export function formatRate(n: number, d: number) {
  const value = conversionRate(n, d);
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function DanceConversionSummary({ days }: { days: ConversionDay[] }) {
  const counts = conversionSteps.map((_, i) =>
    days.reduce((sum, day) => sum + day.counts[i], 0)
  );
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          {m['admin.metrics.conversion']()}
        </h2>
        <p className="text-muted-foreground mt-1 max-w-4xl text-sm">
          {m['admin.metrics.cohort_note']()}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {conversionSteps.map((key, i) => (
          <div key={key} className="bg-card space-y-2 rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">
              {tDynamic(`admin.funnel.stage.${key}`)}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{counts[i]}</p>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full"
                style={{
                  width: `${counts[0] ? (counts[i] / counts[0]) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-sm tabular-nums">
              {i
                ? `${formatRate(counts[i], counts[i - 1])} · ${m['admin.metrics.step_rate']()}`
                : m['admin.metrics.denominator']()}
            </p>
            {i > 0 && (
              <p className="text-muted-foreground text-xs">
                {m['admin.metrics.not_advanced']({
                  count: counts[i - 1] - counts[i],
                })}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm tabular-nums">
          <caption className="text-muted-foreground p-3 text-left">
            {m['admin.metrics.daily_conversion']()}
          </caption>
          <thead className="bg-muted/50">
            <tr>
              {[
                'date',
                'visits',
                'photos',
                'intent',
                'checkout',
                'paid',
                'visit_rate',
                'checkout_rate',
                'delivery_rate',
              ].map((key) => (
                <th key={key} className="p-3 font-medium whitespace-nowrap">
                  {tDynamic(`admin.metrics.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((day) => (
              <tr key={day.date} className="border-t">
                <th className="p-3 font-medium whitespace-nowrap">
                  {day.date}
                </th>
                {day.counts.map((n, i) => (
                  <td key={i} className="p-3">
                    {n}
                  </td>
                ))}
                <td className="p-3 font-semibold">
                  {formatRate(day.counts[4], day.counts[0])}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {formatRate(day.paidCheckoutFlows, day.checkoutFlows)}{' '}
                  <span className="text-muted-foreground">
                    ({day.paidCheckoutFlows}/{day.checkoutFlows})
                  </span>
                </td>
                <td className="p-3 whitespace-nowrap">
                  {formatRate(day.succeededJobs, day.queuedJobs)}{' '}
                  <span className="text-muted-foreground">
                    ({day.succeededJobs}/{day.queuedJobs})
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        {m['admin.metrics.branch_note']()}
      </p>
    </section>
  );
}
