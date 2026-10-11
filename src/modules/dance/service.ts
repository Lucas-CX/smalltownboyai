import { and, count, desc, eq, gt, gte, inArray, lte, ne } from 'drizzle-orm';

import {
  downloadDanceResult,
  realDancePermit,
  submitRealDance,
} from '@/core/ai/dance-acceptance';
import { KieDanceClient } from '@/core/ai/dance-kie';
import { downloadDanceResultStream } from '@/core/ai/dance-result';
import { cloudDanceEnabled } from '@/core/cloudflare/dance';
import { db } from '@/core/db';
import { completeDanceCast } from '@/core/storage/dance-default-cast';
import {
  deletePrivate,
  normalizePhoto,
  savePrivate,
  savePrivateStream,
} from '@/core/storage/dance-private';
import { recordResourceFunnel } from '@/core/telemetry/dance-funnel';
import { danceJob, type DanceJob } from '@/config/db/schema';
import { isDanceResolution, type DanceResolution } from '@/lib/dance-settings';

const now = () => Math.floor(Date.now() / 1000);
export function requireSandbox() {
  if (cloudDanceEnabled()) return;
  if (
    process.env.DANCE_SANDBOX !== 'true' ||
    process.env.NODE_ENV === 'production'
  )
    throw new Error(
      'Sandbox unavailable. Live generation and sales are disabled.'
    );
  if (!['sqlite', undefined].includes(process.env.DATABASE_PROVIDER))
    throw new Error('Dance prototype requires local SQLite');
}
export async function owned(userId: string, id: string): Promise<DanceJob> {
  const [job] = await db()
    .select()
    .from(danceJob)
    .where(and(eq(danceJob.id, id), eq(danceJob.userId, userId)))
    .limit(1);
  if (!job) throw new Error('Order not found');
  return job;
}
export async function findByRequest(userId: string, requestKey: string) {
  const [job] = await db()
    .select()
    .from(danceJob)
    .where(
      and(
        eq(danceJob.userId, userId),
        eq(danceJob.requestKey, userId + ':' + requestKey)
      )
    )
    .limit(1);
  return job;
}
export function visible(job: DanceJob) {
  const { photos, requestKey, resultKey, ...safe } = job;
  return {
    ...safe,
    expired: job.expiresAt <= now(),
    simulation: job.generationMode !== 'kie',
  };
}
export async function list(
  userId?: string
): Promise<ReturnType<typeof visible>[]> {
  return (
    await db()
      .select()
      .from(danceJob)
      .where(userId ? eq(danceJob.userId, userId) : undefined)
      .orderBy(desc(danceJob.createdAt))
      .limit(50)
  ).map(visible);
}
export async function create(
  userId: string,
  requestKey: string,
  photos: (Uint8Array | null)[],
  scenario: string,
  resolution: DanceResolution = '480P'
) {
  requireSandbox();
  if (!isDanceResolution(resolution)) throw new Error('Invalid resolution');
  const key = `${userId}:${requestKey}`;
  const [existing] = await db()
    .select()
    .from(danceJob)
    .where(eq(danceJob.requestKey, key))
    .limit(1);
  if (existing) return visible(existing);
  const permit = await realDancePermit(userId, resolution);
  if (permit && scenario !== 'success')
    throw new Error('Fault injection is disabled for real tasks');
  const [recent] = await db()
    .select({ total: count() })
    .from(danceJob)
    .where(
      and(eq(danceJob.userId, userId), gte(danceJob.createdAt, now() - 86400))
    );
  if (recent.total >= 10) throw new Error('Daily limit: 10 videos per account');
  const cast = completeDanceCast(photos);
  // Process sequentially to bound decoded image memory.
  const keys: string[] = [];
  try {
    for (const photo of cast)
      keys.push(await savePrivate(await normalizePhoto(photo)));
    const [job] = await db()
      .insert(danceJob)
      .values({
        id: crypto.randomUUID(),
        userId,
        requestKey: key,
        photos: JSON.stringify(keys),
        scenario,
        resolution,
        generationMode: permit ? 'kie' : 'mock',
        createdAt: now(),
        expiresAt: now() + 86400,
        nextRunAt: now(),
        paymentMode: ['stripe-test', 'stripe-live'].includes(
          process.env.DANCE_PAYMENT_MODE || ''
        )
          ? process.env.DANCE_PAYMENT_MODE!
          : 'mock',
      })
      .onConflictDoNothing()
      .returning();
    if (!job) {
      await Promise.all(keys.map(deletePrivate));
      const [other] = await db()
        .select()
        .from(danceJob)
        .where(eq(danceJob.requestKey, key))
        .limit(1);
      return visible(other);
    }
    return visible(job);
  } catch (error) {
    await Promise.all(keys.map(deletePrivate));
    throw error;
  }
}
// Called ONLY after provider verification, or the explicitly labelled sandbox checkout.
// Atomic unpaid -> queued transition is both payment and generation idempotency boundary.
export async function acceptPayment(
  id: string,
  paymentId: string,
  mode: string,
  cents: number
) {
  const rows = await db()
    .update(danceJob)
    .set({ status: 'queued', paymentId, nextRunAt: now() + 2 })
    .where(
      and(
        eq(danceJob.id, id),
        eq(danceJob.status, 'unpaid'),
        eq(danceJob.paymentMode, mode),
        eq(danceJob.amountCents, cents)
      )
    )
    .returning();
  return rows.length === 1;
}
export async function payMock(userId: string, id: string) {
  requireSandbox();
  const job = await owned(userId, id);
  if (job.paymentMode !== 'mock' || job.expiresAt <= now())
    throw new Error('Checkout unavailable');
  await acceptPayment(id, `mock-${id}`, 'mock', job.amountCents);
  return visible(await owned(userId, id));
}
export async function requestSupport(userId: string, id: string) {
  await owned(userId, id);
  await db()
    .update(danceJob)
    .set({ supportRequested: 1 })
    .where(eq(danceJob.id, id));
}
export async function erase(userId: string, id: string) {
  const job = await owned(userId, id);
  // Revocation precedes physical deletion, so cached links immediately stop working.
  await db()
    .update(danceJob)
    .set({ status: 'deleted', expiresAt: now() })
    .where(eq(danceJob.id, id));
  await Promise.all((JSON.parse(job.photos) as string[]).map(deletePrivate));
  if (job.resultKey) await deletePrivate(job.resultKey);
  await db()
    .update(danceJob)
    .set({ photos: '[]', resultKey: null })
    .where(eq(danceJob.id, id));
}
// A separate persistent worker runs this; GET requests never advance a task.
export async function tick(kieKey?: string) {
  requireSandbox();
  const expired: DanceJob[] = await db()
    .select()
    .from(danceJob)
    .where(and(lte(danceJob.expiresAt, now()), ne(danceJob.photos, '[]')))
    .limit(100);
  for (const job of expired)
    if (job.photos !== '[]') await erase(job.userId, job.id);
  const due: DanceJob[] = await db()
    .select()
    .from(danceJob)
    .where(
      and(
        inArray(danceJob.status, ['queued', 'generating', 'reconciling']),
        lte(danceJob.nextRunAt, now())
      )
    )
    .limit(10);
  for (const job of due) {
    if (job.expiresAt <= now()) continue;
    if (job.generationMode === 'kie') {
      if (!kieKey) continue;
      if (job.status === 'queued' && !job.providerId) {
        // 'reconciling' without providerId is a durable submission claim; never submit again.
        const claimed = await db()
          .update(danceJob)
          .set({
            status: 'reconciling',
            errorCode: 'SUBMISSION_IN_PROGRESS',
            nextRunAt: now() + 120,
          })
          .where(and(eq(danceJob.id, job.id), eq(danceJob.status, 'queued')))
          .returning();
        if (!claimed.length) continue;
        try {
          const providerId = await submitRealDance(job, kieKey);
          await db()
            .update(danceJob)
            .set({
              providerId,
              status: 'generating',
              errorCode: null,
              nextRunAt: now() + 15,
            })
            .where(
              and(eq(danceJob.id, job.id), eq(danceJob.status, 'reconciling'))
            );
        } catch (error) {
          // Keep provider payloads and credentials out of logs. These fixed
          // preflight errors identify failures before a paid submission.
          const message = error instanceof Error ? error.message : '';
          const safeReason =
            /^(Kie HTTP \d{3}|Kie error \d+|Provider upload HTTP \d{3}|Provider upload failed|Illegal invocation|Provider balance unavailable|Insufficient provider balance|Real generation requires operator approval|Real generation unavailable|Approved generation already submitted|Permit consumed)$/.test(
              message
            )
              ? message
              : 'Unclassified submission failure';
          console.error('Dance submission needs review', job.id, safeReason);
          await recordResourceFunnel(
            'server_generation_review',
            job.id,
            job.userId,
            { reason: 'submission_review' }
          );
          await db()
            .update(danceJob)
            .set({
              errorCode: 'SUBMISSION_REQUIRES_REVIEW',
              nextRunAt: now() + 300,
            })
            .where(
              and(eq(danceJob.id, job.id), eq(danceJob.status, 'reconciling'))
            );
        }
        continue;
      }
      if (!job.providerId) continue;
      // Lease polling/download work; stale workers cannot publish over deletion or expiry.
      const leased = await db()
        .update(danceJob)
        .set({ nextRunAt: now() + 180 })
        .where(
          and(
            eq(danceJob.id, job.id),
            eq(danceJob.nextRunAt, job.nextRunAt),
            eq(danceJob.status, job.status)
          )
        )
        .returning();
      if (!leased.length) continue;
      let saved: string | null = null;
      let phase: 'status' | 'download' | 'storage' | 'persist' = 'status';
      try {
        const result = await new KieDanceClient(kieKey).status(job.providerId);
        if (result.state === 'success') {
          phase = 'download';
          if (cloudDanceEnabled()) {
            const media = await downloadDanceResultStream(result.urls[0]);
            phase = 'storage';
            saved = await savePrivateStream(media.body, media.byteLength);
          } else {
            const media = await downloadDanceResult(result.urls[0]);
            phase = 'storage';
            saved = await savePrivate(media);
          }
        }
        phase = 'persist';
        const updated = await db()
          .update(danceJob)
          .set({
            status:
              result.state === 'success'
                ? 'succeeded'
                : result.state === 'fail'
                  ? 'failed'
                  : ['waiting', 'queuing'].includes(result.state)
                    ? 'queued'
                    : 'generating',
            resultKey: saved,
            errorCode:
              result.state === 'fail' ? 'PROVIDER_GENERATION_FAILED' : null,
            providerCostCents:
              result.creditsConsumed === null
                ? null
                : Math.ceil(result.creditsConsumed / 2),
            nextRunAt: now() + 15,
          })
          .where(
            and(
              eq(danceJob.id, job.id),
              eq(danceJob.status, job.status),
              eq(danceJob.nextRunAt, leased[0].nextRunAt),
              gt(danceJob.expiresAt, now())
            )
          )
          .returning();
        if (!updated.length && saved) await deletePrivate(saved);
        if (updated.length && ['success', 'fail'].includes(result.state))
          await recordResourceFunnel(
            result.state === 'success'
              ? 'server_generation_succeeded'
              : 'server_generation_failed',
            job.id,
            job.userId,
            result.state === 'fail' ? { reason: 'provider_failure' } : {}
          );
      } catch {
        if (saved) await deletePrivate(saved);
        await db()
          .update(danceJob)
          .set({
            status: 'reconciling',
            errorCode: {
              status: 'PROVIDER_STATUS_PENDING',
              download: 'PROVIDER_RESULT_DOWNLOAD_PENDING',
              storage: 'RESULT_STORAGE_PENDING',
              persist: 'RESULT_PERSIST_PENDING',
            }[phase],
            nextRunAt: now() + 30,
          })
          .where(
            and(
              eq(danceJob.id, job.id),
              eq(danceJob.status, job.status),
              eq(danceJob.nextRunAt, leased[0].nextRunAt)
            )
          );
      }
      continue;
    }
    let status = 'succeeded';
    let errorCode: string | null = null;
    if (job.status === 'queued') status = 'generating';
    else if (job.scenario === 'failure') {
      status = 'failed';
      errorCode = 'SIMULATED_PROVIDER_FAILURE';
    } else if (job.scenario === 'timeout' && job.status === 'generating') {
      status = 'reconciling';
      errorCode = 'SIMULATED_TIMEOUT_CHECKING_EXISTING_TASK';
    }
    // Compare-and-swap allows multiple workers without duplicate execution.
    await db()
      .update(danceJob)
      .set({
        status,
        errorCode,
        providerId: job.providerId || `mock-${job.id}`,
        providerCostCents: 0,
        nextRunAt: now() + 5,
      })
      .where(and(eq(danceJob.id, job.id), eq(danceJob.status, job.status)));
  }
}
