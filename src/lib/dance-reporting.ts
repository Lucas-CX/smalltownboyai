export const REPORT_TIMEZONE = 'Asia/Shanghai';
const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;

export function reportDate(time: number | Date) {
  return new Date(Number(time) + OFFSET).toISOString().slice(0, 10);
}

export function reportWindow(days: number, now = Date.now()) {
  const today = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET;
  const since = today - (days - 1) * DAY;
  return {
    since,
    until: now,
    dates: Array.from({ length: days }, (_, i) => reportDate(since + i * DAY)),
  };
}

export function conversionRate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

export type ConversionEvent = {
  flowId: string;
  event: string;
  source: string;
  resourceId: string | null;
  createdAt: Date;
};
export const conversionSteps = [
  'visit',
  'photos',
  'generate',
  'checkout',
  'paid',
] as const;
export type ConversionDay = {
  date: string;
  counts: number[];
  checkoutFlows: number;
  paidCheckoutFlows: number;
  queuedJobs: number;
  succeededJobs: number;
};

// Visit cohorts: a flow belongs to its first studio view in the selected window.
// Checkout and delivery are separate branches, so existing credit holders do
// not have to buy again to count as a successful delivery.
export function summarizeConversions(
  events: ConversionEvent[],
  dates: string[]
) {
  const days = dates.map(
    (date): ConversionDay => ({
      date,
      counts: [0, 0, 0, 0, 0],
      checkoutFlows: 0,
      paidCheckoutFlows: 0,
      queuedJobs: 0,
      succeededJobs: 0,
    })
  );
  const byDate = new Map(days.map((day) => [day.date, day]));
  const flows = new Map<string, ConversionEvent[]>();
  for (const event of events) {
    if (event.event.startsWith('server_') && event.source !== 'server')
      continue;
    const rows = flows.get(event.flowId) || [];
    rows.push(event);
    flows.set(event.flowId, rows);
  }
  for (const rows of flows.values()) {
    rows.sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
    const first = rows.find((row) => row.event === 'dance_studio_viewed');
    if (first) {
      const day = byDate.get(reportDate(first.createdAt));
      if (day) {
        day.counts[0]++;
        let after = Number(first.createdAt);
        let reachedCheckout: ConversionEvent[] = [];
        for (const [i, event] of [
          'dance_photo_ready',
          'dance_generate_clicked',
          'server_checkout_created',
        ].entries()) {
          const candidates = rows.filter(
            (row) => row.event === event && Number(row.createdAt) >= after
          );
          if (!candidates.length) break;
          after = Number(candidates[0].createdAt);
          day.counts[i + 1]++;
          if (event === 'server_checkout_created') reachedCheckout = candidates;
        }
        if (
          reachedCheckout.some((checkout) =>
            rows.some(
              (row) =>
                row.event === 'server_payment_verified' &&
                !!checkout.resourceId &&
                row.resourceId === checkout.resourceId &&
                Number(row.createdAt) >= Number(checkout.createdAt)
            )
          )
        )
          day.counts[4]++;
      }
    }
    const checkouts = rows.filter(
      (row) => row.event === 'server_checkout_created' && row.resourceId
    );
    // One flow per checkout cohort, even when users open several checkouts.
    if (checkouts.length) {
      const day = byDate.get(reportDate(checkouts[0].createdAt));
      if (day) {
        day.checkoutFlows++;
        if (
          checkouts.some((checkout) =>
            rows.some(
              (row) =>
                row.event === 'server_payment_verified' &&
                row.resourceId === checkout.resourceId &&
                Number(row.createdAt) >= Number(checkout.createdAt)
            )
          )
        )
          day.paidCheckoutFlows++;
      }
    }
  }
  // Delivery can finish on another flow; pair authoritative events by job ID.
  const queued = new Map<string, ConversionEvent>();
  const succeeded = new Map<string, number>();
  for (const row of events) {
    if (row.source !== 'server' || !row.resourceId) continue;
    if (
      row.event === 'server_generation_queued' &&
      (!queued.has(row.resourceId) ||
        Number(row.createdAt) < Number(queued.get(row.resourceId)!.createdAt))
    )
      queued.set(row.resourceId, row);
    if (row.event === 'server_generation_succeeded')
      succeeded.set(
        row.resourceId,
        Math.max(succeeded.get(row.resourceId) || 0, Number(row.createdAt))
      );
  }
  for (const [id, row] of queued) {
    const day = byDate.get(reportDate(row.createdAt));
    if (!day) continue;
    day.queuedJobs++;
    if ((succeeded.get(id) ?? -1) >= Number(row.createdAt)) day.succeededJobs++;
  }
  return days;
}

export type FinanceDay = {
  date: string;
  receiptsCents: number;
  paidOrders: number;
  invalidOrders: number;
  kieCostCents: number;
  kieTasks: number;
  missingCosts: number;
  apiMarginCents: number | null;
};
export type FinanceReport = {
  timezone: string;
  generatedAt: string;
  days: FinanceDay[];
  total: FinanceDay;
  lifetime: FinanceDay;
};

export function totalFinance(days: FinanceDay[]): FinanceDay {
  const total: FinanceDay = {
    date: '',
    receiptsCents: 0,
    paidOrders: 0,
    invalidOrders: 0,
    kieCostCents: 0,
    kieTasks: 0,
    missingCosts: 0,
    apiMarginCents: null,
  };
  for (const day of days) {
    for (const key of [
      'receiptsCents',
      'paidOrders',
      'invalidOrders',
      'kieCostCents',
      'kieTasks',
      'missingCosts',
    ] as const)
      total[key] += day[key];
  }
  total.apiMarginCents =
    total.missingCosts || total.invalidOrders
      ? null
      : total.receiptsCents - total.kieCostCents;
  return total;
}
