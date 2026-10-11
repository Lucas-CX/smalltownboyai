import {
  and,
  asc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  like,
  lt,
  or,
  sql,
} from 'drizzle-orm';

import { KieDanceClient } from '@/core/ai/dance-kie';
import { db } from '@/core/db';
import { danceJob, order } from '@/config/db/schema';
import {
  REPORT_TIMEZONE,
  reportDate,
  reportWindow,
  totalFinance,
  type FinanceDay,
  type FinanceReport,
} from '@/lib/dance-reporting';

const receiptScope = (now: number) =>
  and(
    like(order.orderNo, 'dance-live:%'),
    eq(order.paymentProvider, 'stripe-live'),
    lt(order.paidAt, new Date(now + 1))
  );
const kieScope = (now: number) =>
  and(
    eq(danceJob.generationMode, 'kie'),
    or(
      isNotNull(danceJob.providerId),
      eq(danceJob.status, 'review'),
      eq(danceJob.status, 'reconciling'),
      like(danceJob.errorCode, 'SUBMISSION_%')
    ),
    lt(danceJob.createdAt, Math.floor(now / 1000) + 1)
  );

async function queryLifetimeFinance(now: number): Promise<FinanceDay> {
  const validReceipt = sql`lower(${order.paymentCurrency}) = 'usd' AND ${order.paymentAmount} >= 0 AND ${order.paymentAmount} <= ${Number.MAX_SAFE_INTEGER} AND round(${order.paymentAmount}, 0) = ${order.paymentAmount}`;
  const validCost = sql`${danceJob.providerCostCents} >= 0 AND ${danceJob.providerCostCents} <= ${Number.MAX_SAFE_INTEGER} AND round(${danceJob.providerCostCents}, 0) = ${danceJob.providerCostCents} AND ${danceJob.status} NOT IN ('queued','generating','reconciling','review')`;
  // Aggregate in the database: lifetime history must not be limited by the
  // selected date range or fetched as an ever-growing list of individual rows.
  const [[receipts], [costs]] = await Promise.all([
    db()
      .select({
        paidOrders: sql<number>`count(*)`,
        receiptsCents: sql<number>`coalesce(sum(case when ${validReceipt} then ${order.paymentAmount} else 0 end), 0)`,
        invalidOrders: sql<number>`coalesce(sum(case when ${validReceipt} then 0 else 1 end), 0)`,
      })
      .from(order)
      .where(receiptScope(now)),
    db()
      .select({
        kieTasks: sql<number>`count(*)`,
        kieCostCents: sql<number>`coalesce(sum(case when ${validCost} then ${danceJob.providerCostCents} else 0 end), 0)`,
        missingCosts: sql<number>`coalesce(sum(case when ${validCost} then 0 else 1 end), 0)`,
      })
      .from(danceJob)
      .where(kieScope(now)),
  ]);
  return totalFinance([
    {
      date: '',
      apiMarginCents: null,
      paidOrders: Number(receipts.paidOrders),
      receiptsCents: Number(receipts.receiptsCents),
      invalidOrders: Number(receipts.invalidOrders),
      kieTasks: Number(costs.kieTasks),
      kieCostCents: Number(costs.kieCostCents),
      missingCosts: Number(costs.missingCosts),
    },
  ]);
}

export async function queryFinance(
  days: number,
  now = Date.now()
): Promise<FinanceReport> {
  const window = reportWindow(days, now);
  const result: FinanceDay[] = window.dates.map((date) => ({
    date,
    receiptsCents: 0,
    paidOrders: 0,
    invalidOrders: 0,
    kieCostCents: 0,
    kieTasks: 0,
    missingCosts: 0,
    apiMarginCents: null,
  }));
  const byDate = new Map(result.map((day) => [day.date, day]));
  // Gross receipts are attributed to payment time, never order creation time.
  // Retain refunded orders in gross receipts: this report explicitly excludes
  // refunds/fees, which have no complete authoritative ledger in this database.
  const receipts = await db()
    .select({
      amount: order.paymentAmount,
      currency: order.paymentCurrency,
      paidAt: order.paidAt,
    })
    .from(order)
    .where(and(receiptScope(now), gte(order.paidAt, new Date(window.since))));
  for (const receipt of receipts) {
    const day = byDate.get(reportDate(receipt.paidAt));
    if (!day) continue;
    day.paidOrders++;
    if (
      receipt.currency?.toLowerCase() !== 'usd' ||
      !Number.isSafeInteger(receipt.amount) ||
      receipt.amount < 0
    )
      day.invalidOrders++;
    else day.receiptsCents += receipt.amount;
  }
  // ALL real Kie calls cost money, including operator tests and failed calls.
  // Soft-deleted media records retain their cost. Never exclude them by status.
  const jobs = await db()
    .select({
      createdAt: danceJob.createdAt,
      cost: danceJob.providerCostCents,
      status: danceJob.status,
    })
    .from(danceJob)
    .where(
      and(
        kieScope(now),
        gte(danceJob.createdAt, Math.floor(window.since / 1000))
      )
    );
  for (const job of jobs) {
    const day = byDate.get(reportDate(job.createdAt * 1000));
    if (!day) continue;
    day.kieTasks++;
    if (
      job.cost === null ||
      !Number.isSafeInteger(job.cost) ||
      job.cost < 0 ||
      ['queued', 'generating', 'reconciling', 'review'].includes(job.status)
    )
      day.missingCosts++;
    else day.kieCostCents += job.cost;
  }
  for (const day of result)
    day.apiMarginCents =
      day.missingCosts || day.invalidOrders
        ? null
        : day.receiptsCents - day.kieCostCents;
  return {
    timezone: REPORT_TIMEZONE,
    generatedAt: new Date(now).toISOString(),
    days: result,
    total: totalFinance(result),
    lifetime: await queryLifetimeFinance(now),
  };
}

// Cost-only reconciliation: read existing provider tasks; never submit, retry,
// restore customer credits, or change generation/delivery status.
export async function reconcileKieCosts(
  key: string,
  days: number,
  afterId?: string
) {
  const window = reportWindow(days);
  const jobs = await db()
    .select({ id: danceJob.id, providerId: danceJob.providerId })
    .from(danceJob)
    .where(
      and(
        eq(danceJob.generationMode, 'kie'),
        isNotNull(danceJob.providerId),
        isNull(danceJob.providerCostCents),
        afterId ? gt(danceJob.id, afterId) : undefined,
        gte(danceJob.createdAt, Math.floor(window.since / 1000))
      )
    )
    .orderBy(asc(danceJob.id))
    .limit(10);
  const client = new KieDanceClient(key);
  const outcomes = await Promise.allSettled(
    jobs.map(async (job: { id: string; providerId: string }) => {
      const cost = await client.consumption(job.providerId);
      if (cost === null) return false;
      await db()
        .update(danceJob)
        .set({ providerCostCents: Math.ceil(cost / 2) })
        .where(
          and(
            eq(danceJob.id, job.id),
            eq(danceJob.providerId, job.providerId),
            isNull(danceJob.providerCostCents)
          )
        );
      return true;
    })
  );
  return {
    nextCursor: jobs.length === 10 ? (jobs.at(-1)!.id as string) : null,
    checked: jobs.length,
    updated: outcomes.filter((r) => r.status === 'fulfilled' && r.value).length,
  };
}
