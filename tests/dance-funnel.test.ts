import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sql } from 'drizzle-orm';

import {
  funnelBatchSchema,
  journeyOutcome,
  type FunnelRecord,
} from '../src/lib/dance-funnel-contract';

test('public telemetry rejects forged server confirmation and strips private fields', () => {
  const body = {
    flowId: crypto.randomUUID(),
    events: [
      {
        id: crypto.randomUUID(),
        event: 'dance_photo_failed',
        params: {
          role: 'left',
          reason: 'invalid_image',
          photos: 'private',
          email: 'private',
          message: 'secret',
          transaction_id: 'secret',
        },
      },
    ],
  };
  const accepted = funnelBatchSchema.parse(body);
  assert.deepEqual(accepted.events[0].params, {
    role: 'left',
    reason: 'invalid_image',
  });
  assert.equal(
    funnelBatchSchema.safeParse({
      ...body,
      events: [{ ...body.events[0], event: 'server_payment_verified' }],
    }).success,
    false
  );
  assert.equal(
    funnelBatchSchema.safeParse({ ...body, userId: 'victim' }).success,
    false
  );
  assert.equal(
    funnelBatchSchema.safeParse({
      ...body,
      events: Array(21).fill(body.events[0]),
    }).success,
    false
  );
});
const time = Date.now() - 3600_000;
const row = (event: string, offset: number, params = {}): FunnelRecord => ({
  id: crypto.randomUUID(),
  event,
  createdAt: new Date(time + offset),
  params: JSON.stringify(params),
  flowId: 'visit',
  source: event.startsWith('server_') ? 'server' : 'client',
  userId: null,
  locale: 'it',
  device: 'mobile',
  resourceId: null,
  mode: 'stripe-live',
  diagnostic: false,
});
test('a recovered error is not confused with unresolved interruption or inactivity', () => {
  assert.equal(
    journeyOutcome([
      row('dance_photo_failed', 0, { role: 'left' }),
      row('dance_photo_ready', 1, { role: 'right' }),
    ]),
    'technical'
  );
  assert.equal(
    journeyOutcome([
      row('dance_photo_failed', 0, { role: 'left' }),
      row('dance_photo_ready', 1, { role: 'left' }),
      row('dance_purchase_shown', 2),
    ]),
    'purchase_dropoff'
  );
  assert.equal(
    journeyOutcome([
      row('dance_checkout_failed', 0),
      row('server_checkout_created', 1),
      row('server_payment_verified', 2),
    ]),
    'paid'
  );
  assert.equal(journeyOutcome([row('dance_studio_viewed', 0)]), 'unknown');
  assert.equal(
    journeyOutcome([row('server_generation_queued', 0)]),
    'pending_review'
  );
  assert.equal(
    journeyOutcome([
      row('server_generation_review', 0),
      row('server_generation_succeeded', 1),
    ]),
    'succeeded'
  );
  assert.equal(
    journeyOutcome([
      row('server_generation_succeeded', 0),
      row('server_generation_failed', 1),
    ]),
    'technical'
  );
  assert.equal(
    journeyOutcome([row('dance_generation_succeeded', 0)]),
    'unknown',
    'browser cannot confirm provider completion'
  );
});

test('persistent history deduplicates, joins payment results, excludes diagnostic visits and survives cleanup', async () => {
  process.env.DATABASE_PROVIDER = 'sqlite';
  process.env.DATABASE_URL = ':memory:';
  process.env.DB_SINGLETON_ENABLED = 'true';
  process.env.NODE_ENV = 'production';
  process.env.DANCE_PAYMENT_MODE = 'stripe-live';
  const { db } = await import('../src/core/db');
  const { envConfigs } = await import('../src/config');
  envConfigs.database_provider = 'sqlite';
  envConfigs.database_url = ':memory:';
  envConfigs.db_singleton_enabled = 'true';
  for (const path of [
    'migrations/cloudflare/0001_initial.sql',
    'migrations/cloudflare/0002_dance_funnel.sql',
  ]) {
    for (const statement of readFileSync(path, 'utf8')
      .split('--> statement-breakpoint')
      .filter((value) => value.trim()))
      await db().run(sql.raw(statement));
  }
  await db().run(
    sql`INSERT INTO user(id,name,email) VALUES ('customer','Customer','real@domain.invalid'),('test','Test','qa@example.test'),('operator','Operator','operator@domain.invalid')`
  );
  await db().run(
    sql`INSERT INTO role(id,name,title,status) VALUES ('admin-role','super_admin','Admin','active')`
  );
  await db().run(
    sql`INSERT INTO user_role(id,user_id,role_id) VALUES ('operator-role','operator','admin-role')`
  );
  const { recordFunnel, recordResourceFunnel } =
    await import('../src/core/telemetry/dance-funnel');
  const { queryFunnel } = await import('../src/modules/dance-funnel/service');
  const flow = crypto.randomUUID(),
    excluded = crypto.randomUUID(),
    adminFlow = crypto.randomUUID(),
    diagnostics = crypto.randomUUID();
  const common = { flowId: flow, userId: 'customer' };
  await recordFunnel({
    ...common,
    event: 'dance_studio_viewed',
    source: 'client',
  });
  await recordFunnel({
    ...common,
    event: 'server_checkout_created',
    resourceId: 'order-1',
  });
  await recordResourceFunnel('server_payment_verified', 'order-1', 'customer');
  await recordResourceFunnel('server_payment_verified', 'order-1', 'customer');
  await recordFunnel({
    ...common,
    event: 'server_generation_queued',
    resourceId: 'job-1',
  });
  await recordResourceFunnel(
    'server_generation_succeeded',
    'job-1',
    'customer'
  );
  await recordFunnel({
    flowId: excluded,
    event: 'dance_studio_viewed',
    source: 'client',
  });
  await recordFunnel({
    flowId: excluded,
    userId: 'test',
    event: 'dance_session_ready',
    source: 'client',
  });
  await recordFunnel({
    flowId: adminFlow,
    userId: 'operator',
    event: 'dance_studio_viewed',
    source: 'client',
  });
  await recordFunnel({
    flowId: diagnostics,
    event: 'dance_studio_viewed',
    source: 'client',
    diagnostic: true,
  });
  const report = await queryFunnel({
    days: 7,
    includeTests: false,
    page: 1,
    flowId: flow,
  });
  assert.equal(report.totalFlows, 1);
  assert.equal(report.stages.find((stage) => stage.key === 'paid')?.flows, 1);
  assert.equal(
    report.timeline.filter((event) => event.event === 'server_payment_verified')
      .length,
    1
  );
  assert.equal(report.journeys[0].outcome, 'succeeded');
  assert.equal(
    (await queryFunnel({ days: 7, includeTests: true, page: 1 })).totalFlows,
    4
  );
  // No FK to a job/order, so normal private-photo cleanup cannot erase history.
  assert.equal(report.timeline.at(-1)?.event, 'server_generation_succeeded');
  await db().run(sql`DROP TABLE dance_funnel_event`);
  assert.equal(
    await recordFunnel({ ...common, event: 'dance_studio_viewed' }),
    false,
    'missing table fails open'
  );
});
