import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sql } from 'drizzle-orm';

import { KieDanceClient } from '../src/core/ai/dance-kie';
import {
  conversionRate,
  reportDate,
  reportWindow,
  summarizeConversions,
  type ConversionEvent,
} from '../src/lib/dance-reporting';

const event = (
  name: string,
  time: string,
  resourceId: string | null = null,
  flowId = 'flow'
): ConversionEvent => ({
  event: name,
  createdAt: new Date(time),
  resourceId,
  flowId,
  source: name.startsWith('server_') ? 'server' : 'client',
});
test('calendar days use Shanghai midnight, including an unfinished current day', () => {
  assert.equal(reportDate(Date.parse('2026-10-10T16:00:00Z')), '2026-10-11');
  const window = reportWindow(2, Date.parse('2026-10-11T04:00:00Z'));
  assert.equal(
    new Date(window.since).toISOString(),
    '2026-10-09T16:00:00.000Z'
  );
  assert.deepEqual(window.dates, ['2026-10-10', '2026-10-11']);
  assert.equal(conversionRate(0, 0), null);
});
test('ordered funnel deduplicates visits, matches payment resources and carries cross-day conversions', () => {
  const rows = [
    event('dance_studio_viewed', '2026-10-10T15:00:00Z'),
    event('dance_studio_viewed', '2026-10-10T15:01:00Z'),
    event('dance_generate_clicked', '2026-10-10T15:02:00Z'), // before photo: cannot advance
    event('dance_photo_ready', '2026-10-10T15:03:00Z'),
    event('dance_generate_clicked', '2026-10-10T15:04:00Z'),
    event('server_checkout_created', '2026-10-10T15:05:00Z', 'order-a'),
    event('server_payment_verified', '2026-10-11T01:00:00Z', 'order-b'),
  ];
  let days = summarizeConversions(rows, ['2026-10-10', '2026-10-11']);
  assert.deepEqual(days[0].counts, [1, 1, 1, 1, 0]);
  rows.push(
    event('server_payment_verified', '2026-10-11T01:01:00Z', 'order-a')
  );
  rows.push(
    event('server_payment_verified', '2026-10-11T01:02:00Z', 'order-a')
  );
  days = summarizeConversions(rows, ['2026-10-10', '2026-10-11']);
  assert.deepEqual(days[0].counts, [1, 1, 1, 1, 1]);
  assert.deepEqual(days[1].counts, [0, 0, 0, 0, 0]);
  assert.equal(days[0].paidCheckoutFlows, 1);
});
test('existing credits deliver without buying again; client forged success cannot count', () => {
  const rows = [
    event('server_generation_queued', '2026-10-10T15:00:00Z', 'job'),
    event(
      'server_generation_succeeded',
      '2026-10-11T01:00:00Z',
      'job',
      'other-flow'
    ),
  ];
  const [day] = summarizeConversions(rows, ['2026-10-10']);
  assert.equal(day.queuedJobs, 1);
  assert.equal(day.succeededJobs, 1);
  assert.equal(day.counts[4], 0);
  rows[1].source = 'client';
  assert.equal(summarizeConversions(rows, ['2026-10-10'])[0].succeededJobs, 0);
});
test('Kie cost reads never submit and reject absent, provisional and negative costs', async () => {
  for (const [data, expected] of [
    [{ state: 'success', creditsConsumed: 240 }, 240],
    [{ state: 'fail', creditsConsumed: 0 }, 0],
    [{ state: 'success' }, null],
    [{ state: 'generating', creditsConsumed: 0 }, null],
    [{ state: 'success', creditsConsumed: -1 }, null],
  ] as const) {
    const client = new KieDanceClient('fixture', async (input, init) => {
      assert.match(String(input), /jobs\/recordInfo\?taskId=fixture$/);
      assert.equal(init?.method, 'GET');
      return Response.json({ code: 200, data });
    });
    assert.equal(await client.consumption('fixture'), expected);
  }
});
test('finance uses paid time, includes failed and deleted real Kie calls, and blocks incomplete margins', async () => {
  process.env.DATABASE_PROVIDER = 'sqlite';
  process.env.DATABASE_URL = ':memory:';
  const { envConfigs } = await import('../src/config');
  envConfigs.database_provider = 'sqlite';
  envConfigs.database_url = ':memory:';
  const { db } = await import('../src/core/db');
  for (const statement of readFileSync(
    'migrations/cloudflare/0001_initial.sql',
    'utf8'
  )
    .split('--> statement-breakpoint')
    .filter((s) => s.trim()))
    await db().run(sql.raw(statement));
  await db().run(
    sql`INSERT INTO user(id,name,email) VALUES ('u','Fixture','fixture@domain.invalid')`
  );
  const paidAt = Date.parse('2026-10-10T16:01:00Z');
  await db()
    .run(sql`INSERT INTO "order"(id,order_no,user_id,status,amount,currency,payment_provider,checkout_info,payment_amount,payment_currency,paid_at,created_at) VALUES
    ('o','dance-live:1','u','paid',9999,'usd','stripe-live','{}',990,'usd',${paidAt},${paidAt - 86400000}),
    ('t','dance-test:1','u','paid',9999,'usd','stripe-test','{}',9999,'usd',${paidAt},${paidAt})`);
  for (const [id, status, cost, mode] of [
    ['a', 'succeeded', 120, 'kie'],
    ['b', 'failed', 40, 'kie'],
    ['c', 'deleted', 120, 'kie'],
    ['d', 'succeeded', 9999, 'mock'],
  ] as const) {
    await db().run(
      sql`INSERT INTO dance_job(id,user_id,request_key,status,photos,generation_mode,provider_id,provider_cost_cents,next_run_at,created_at,expires_at) VALUES (${id},'u',${id},${status},'[]',${mode},${id},${cost},0,${Math.floor(paidAt / 1000)},0)`
    );
  }
  const { queryFinance } = await import('../src/modules/dance-finance/service');
  let report = await queryFinance(2, Date.parse('2026-10-11T04:00:00Z'));
  assert.equal(report.days[0].receiptsCents, 0);
  assert.equal(report.days[1].receiptsCents, 990);
  assert.equal(report.total.kieCostCents, 280);
  assert.equal(report.total.apiMarginCents, 710);
  await db().run(
    sql`UPDATE dance_job SET provider_cost_cents=NULL WHERE id='b'`
  );
  report = await queryFinance(2, Date.parse('2026-10-11T04:00:00Z'));
  assert.equal(report.total.apiMarginCents, null);
  assert.equal(report.total.missingCosts, 1);
  await db().run(sql`UPDATE dance_job SET provider_cost_cents=40 WHERE id='b'`);
  await db().run(sql`UPDATE "order" SET payment_currency='eur' WHERE id='o'`);
  report = await queryFinance(2, Date.parse('2026-10-11T04:00:00Z'));
  assert.equal(report.total.apiMarginCents, null);
  assert.equal(report.total.invalidOrders, 1);
  assert.equal(report.lifetime.invalidOrders, 1);
  assert.equal(report.lifetime.apiMarginCents, null);

  await db().run(sql`UPDATE "order" SET payment_currency='usd' WHERE id='o'`);
  const historical = paidAt - 100 * 86400000;
  const future = paidAt + 10 * 86400000;
  for (const [id, time, amount, cost] of [
    ['historical', historical, 1000, 200],
    ['future', future, 7000, 999],
  ] as const) {
    await db().run(
      sql`INSERT INTO "order"(id,order_no,user_id,status,amount,currency,payment_provider,checkout_info,payment_amount,payment_currency,paid_at) VALUES (${id},${`dance-live:${id}`},'u','paid',${amount},'usd','stripe-live','{}',${amount},'usd',${time})`
    );
    await db().run(
      sql`INSERT INTO dance_job(id,user_id,request_key,status,photos,generation_mode,provider_id,provider_cost_cents,next_run_at,created_at,expires_at) VALUES (${id},'u',${id},'deleted','[]','kie',${id},${cost},0,${Math.floor(time / 1000)},0)`
    );
  }
  // Lifetime includes records older than 31 days and never changes with the
  // period selector. Future records and simulated receipts/costs stay excluded.
  for (const days of [1, 7, 31]) {
    report = await queryFinance(days, Date.parse('2026-10-11T04:00:00Z'));
    assert.equal(report.total.apiMarginCents, 710);
    assert.equal(report.lifetime.receiptsCents, 1990);
    assert.equal(report.lifetime.kieCostCents, 480);
    assert.equal(report.lifetime.apiMarginCents, 1510);
    assert.equal(report.lifetime.paidOrders, 2);
  }
  await db().run(
    sql`UPDATE dance_job SET provider_cost_cents=NULL WHERE id='historical'`
  );
  report = await queryFinance(1, Date.parse('2026-10-11T04:00:00Z'));
  assert.equal(report.total.apiMarginCents, 710);
  assert.equal(report.lifetime.missingCosts, 1);
  assert.equal(report.lifetime.apiMarginCents, null);
});
