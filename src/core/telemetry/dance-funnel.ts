import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { danceFunnelEvent } from '@/config/db/schema';
import { getCookieFromHeader } from '@/lib/cookie';
import {
  funnelParamsSchema,
  type FunnelParams,
} from '@/lib/dance-funnel-contract';
import { md5 } from '@/lib/hash';

export function requestFlow(request: Request) {
  return validFlow(
    request.headers.get('x-dance-flow') ||
      getCookieFromHeader(request.headers.get('cookie'), 'dance_flow')
  );
}
export function validFlow(value: string | null | undefined) {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
    ? value
    : undefined;
}
export async function recordFunnel(input: {
  id?: string;
  flowId?: string;
  userId?: string | null;
  event: string;
  source?: 'client' | 'server';
  locale?: string;
  device?: string;
  params?: FunnelParams;
  resourceId?: string;
  diagnostic?: boolean;
}) {
  // Fail-open: telemetry must never roll back a payment, block auth or repeat a
  // paid provider call. A missing migration is visible in logs/admin health.
  try {
    const flowId =
      input.flowId || (input.userId ? `account:${input.userId}` : undefined);
    if (!flowId) return false;
    const id = input.id || md5(`${input.event}:${input.resourceId || flowId}`);
    await db()
      .insert(danceFunnelEvent)
      .values({
        id,
        flowId,
        userId: input.userId || null,
        event: input.event,
        source: input.source || 'server',
        locale: input.locale || 'en',
        device: input.device || 'unknown',
        params: JSON.stringify(funnelParamsSchema.parse(input.params || {})),
        resourceId: input.resourceId || null,
        mode: process.env.DANCE_PAYMENT_MODE || 'mock',
        diagnostic: input.diagnostic || process.env.NODE_ENV !== 'production',
      })
      .onConflictDoNothing();
    return true;
  } catch {
    console.warn('Dance funnel event could not be persisted');
    return false;
  }
}

export async function recordResourceFunnel(
  event: string,
  resourceId: string,
  userId: string,
  params: FunnelParams = {}
) {
  try {
    const [previous] = await db()
      .select()
      .from(danceFunnelEvent)
      .where(
        and(
          eq(danceFunnelEvent.resourceId, resourceId),
          eq(danceFunnelEvent.userId, userId)
        )
      )
      .limit(1);
    return recordFunnel({
      event,
      resourceId,
      userId,
      params,
      flowId: previous?.flowId,
      diagnostic: previous?.diagnostic,
      locale: previous?.locale,
    });
  } catch {
    console.warn('Dance funnel resource could not be persisted');
    return false;
  }
}
