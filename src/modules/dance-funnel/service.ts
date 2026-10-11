import { and, asc, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { danceFunnelEvent as events } from '@/config/db/schema';
import {
  funnelStages,
  journeyOutcome,
  type FunnelRecord,
} from '@/lib/dance-funnel-contract';
import {
  REPORT_TIMEZONE,
  reportWindow,
  summarizeConversions,
} from '@/lib/dance-reporting';

export function funnelAudience(includeTests: boolean, now = Date.now()) {
  // Exclude the ENTIRE visit, including anonymous events before login. A
  // diagnostic flag can exclude its own visit, never mark a payment as real.
  return includeTests
    ? sql`1=1`
    : sql`${events.flowId} NOT IN (
    SELECT DISTINCT x.flow_id FROM dance_funnel_event x LEFT JOIN "user" u ON u.id=x.user_id
    WHERE (
      x.diagnostic=1 OR x.mode IN ('mock','stripe-test')
      OR u.email LIKE '%@example.test' OR u.email LIKE '%@example.com'
      OR x.user_id IN (SELECT ur.user_id FROM user_role ur JOIN role r ON r.id=ur.role_id
        WHERE r.name IN ('super_admin','admin')
        AND (ur.expires_at IS NULL OR ur.expires_at > ${now}))
    ))`;
}

export async function queryFunnel(args: {
  days: number;
  includeTests: boolean;
  page: number;
  flowId?: string;
}) {
  const now = Date.now();
  const window = reportWindow(args.days, now);
  const since = new Date(window.since);
  const audience = funnelAudience(args.includeTests);
  const filter = and(
    gte(events.createdAt, since),
    lte(events.createdAt, new Date(now)),
    audience
  );
  const conversionEvents = await db()
    .select({
      flowId: events.flowId,
      event: events.event,
      source: events.source,
      resourceId: events.resourceId,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(
      and(
        filter,
        inArray(events.event, [
          'dance_studio_viewed',
          'dance_photo_ready',
          'dance_generate_clicked',
          'server_checkout_created',
          'server_payment_verified',
          'server_generation_queued',
          'server_generation_succeeded',
        ])
      )
    )
    .limit(100001);
  // Never silently report sampled conversion percentages.
  if (conversionEvents.length > 100000)
    throw new Error(
      'Conversion report exceeds safe row limit; select fewer days'
    );
  const [total] = await db()
    .select({
      flows: sql<number>`count(distinct ${events.flowId})`,
      rows: count(),
    })
    .from(events)
    .where(filter);
  const counts = await db()
    .select({
      event: events.event,
      flows: sql<number>`count(distinct ${events.flowId})`,
    })
    .from(events)
    .where(filter)
    .groupBy(events.event);
  const stageCounts = funnelStages.map((stage) => ({
    key: stage.key,
    flows: Number(
      counts.find((row: { event: string }) => row.event === stage.events[0])
        ?.flows || 0
    ),
  }));
  const recent = await db()
    .select({
      flowId: events.flowId,
      lastAt: sql<number>`max(${events.createdAt})`,
    })
    .from(events)
    .where(filter)
    .groupBy(events.flowId)
    .orderBy(desc(sql`max(${events.createdAt})`))
    .limit(20)
    .offset((args.page - 1) * 20);
  const rows: FunnelRecord[] = recent.length
    ? await db()
        .select()
        .from(events)
        .where(
          and(
            gte(events.createdAt, since),
            inArray(
              events.flowId,
              recent.map((row: { flowId: string }) => row.flowId)
            )
          )
        )
        .orderBy(asc(events.createdAt))
    : [];
  const journeys = recent.map((visit: { flowId: string }) => {
    const records = rows.filter((row) => row.flowId === visit.flowId);
    const last = records.at(-1)!;
    const identified = [...records].reverse().find((row) => row.userId);
    return {
      flowId: visit.flowId,
      userRef: identified?.userId?.slice(0, 8) || null,
      firstAt: records[0].createdAt.toISOString(),
      lastAt: last.createdAt.toISOString(),
      lastEvent: last.event,
      locale: records.find((row) => row.locale !== 'en')?.locale || last.locale,
      device:
        records.find((row) => row.device !== 'unknown')?.device || 'unknown',
      outcome: journeyOutcome(records),
      eventCount: records.length,
    };
  });
  // Exact error counts across the selected period, independent of pagination.
  const errors = await db()
    .select({
      event: events.event,
      params: events.params,
      source: events.source,
      total: count(),
    })
    .from(events)
    .where(
      and(
        filter,
        inArray(events.event, [
          'dance_photo_failed',
          'dance_auth_failed',
          'dance_upload_failed',
          'dance_checkout_failed',
          'dance_client_error',
          'dance_draft_missing',
          'server_generation_failed',
          'server_generation_review',
          'server_payment_return_failed',
        ])
      )
    )
    .groupBy(events.event, events.params, events.source)
    .orderBy(desc(count()))
    .limit(30);
  const timeline: FunnelRecord[] = args.flowId
    ? await db()
        .select()
        .from(events)
        .where(and(filter, eq(events.flowId, args.flowId)))
        .orderBy(asc(events.createdAt))
        .limit(500)
    : [];
  return {
    daily: summarizeConversions(conversionEvents, window.dates),
    timezone: REPORT_TIMEZONE,
    generatedAt: new Date(now).toISOString(),
    since: since.toISOString(),
    totalFlows: Number(total.flows),
    totalEvents: Number(total.rows),
    page: args.page,
    stages: stageCounts,
    journeys,
    errors,
    timeline: timeline.map((row) => ({
      id: row.id,
      event: row.event,
      source: row.source,
      params: JSON.parse(row.params),
      createdAt: row.createdAt.toISOString(),
      mode: row.mode,
    })),
  };
}
