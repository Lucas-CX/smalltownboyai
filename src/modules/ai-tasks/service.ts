import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import { cloudDanceEnabled } from '@/core/cloudflare/dance';
import {
  queueCloudDance,
  restoreCloudDance,
} from '@/core/cloudflare/dance-ledger';
import { db } from '@/core/db';
import { retryLocalTransaction } from '@/core/db/retry-local-transaction';
import {
  aiTask,
  credit,
  danceJob,
  order,
  type DanceJob,
} from '@/config/db/schema';
import { consume, revoke } from '@/modules/credits/service';
import { danceCreditCost } from '@/lib/dance-plans';
import { getUuid } from '@/lib/hash';

export async function queueDanceWithCredits(userId: string, jobId: string) {
  if (cloudDanceEnabled()) {
    await queueCloudDance(userId, jobId);
    const [job] = await db()
      .select()
      .from(danceJob)
      .where(and(eq(danceJob.id, jobId), eq(danceJob.userId, userId)))
      .limit(1);
    return job as DanceJob;
  }
  if (
    process.env.DANCE_SANDBOX !== 'true' ||
    process.env.NODE_ENV === 'production' ||
    process.env.DATABASE_PROVIDER !== 'sqlite'
  )
    throw new Error('Preview unavailable');
  return retryLocalTransaction<DanceJob>(() =>
    db().transaction(async (tx: any) => {
      const [intent] = await tx
        .select()
        .from(danceJob)
        .where(and(eq(danceJob.id, jobId), eq(danceJob.userId, userId)))
        .limit(1);
      if (!intent) throw new Error('Order unavailable');
      const real = intent.generationMode === 'kie';
      if (real) {
        const grants = await tx
          .select({ remaining: credit.remainingCredits })
          .from(credit)
          .innerJoin(order, eq(credit.orderNo, order.orderNo))
          .where(
            and(
              eq(credit.userId, userId),
              eq(credit.status, 'active'),
              eq(credit.transactionType, 'grant'),
              eq(order.paymentProvider, 'stripe-test'),
              eq(order.status, 'paid')
            )
          );
        if (
          intent.status === 'unpaid' &&
          grants.reduce(
            (total: number, grant: { remaining: number }) =>
              total + grant.remaining,
            0
          ) < danceCreditCost(intent.resolution)
        )
          throw new Error('Verified test payment required');
      }
      const [claimed] = await tx
        .update(danceJob)
        .set({
          status: 'queued',
          paymentMode: real ? 'credits-test' : 'credits-preview',
          amountCents: 0,
          nextRunAt: Math.floor(Date.now() / 1000) + 2,
        })
        .where(
          and(
            eq(danceJob.id, jobId),
            eq(danceJob.userId, userId),
            eq(danceJob.status, 'unpaid'),
            gt(danceJob.expiresAt, Math.floor(Date.now() / 1000))
          )
        )
        .returning();
      if (!claimed) {
        const [existing] = await tx
          .select()
          .from(danceJob)
          .where(and(eq(danceJob.id, jobId), eq(danceJob.userId, userId)))
          .limit(1);
        if (
          !existing ||
          !['credits-preview', 'credits-test'].includes(existing.paymentMode)
        )
          throw new Error('Order unavailable');
        return existing;
      }
      const spent = await consume({
        userId,
        credits: danceCreditCost(intent.resolution),
        scene: real ? 'dance-real-test' : 'dance-preview',
        description: real ? 'Wan acceptance test' : 'Simulated dance video',
        metadata: JSON.stringify({ jobId }),
        tx,
      });
      if (!spent.success) throw new Error('INSUFFICIENT_CREDITS');
      const [result] = await tx
        .update(danceJob)
        .set({ paymentId: `credit:${spent.consumedCredit.id}` })
        .where(eq(danceJob.id, jobId))
        .returning();
      return result;
    })
  );
}

// Idempotent credit restoration for failed preview jobs; never a monetary refund.
export async function restoreFailedDanceCredits() {
  if (cloudDanceEnabled()) return restoreCloudDance();
  const jobs = await db()
    .select()
    .from(danceJob)
    .where(
      and(
        eq(danceJob.status, 'failed'),
        inArray(danceJob.paymentMode, ['credits-preview', 'credits-test'])
      )
    )
    .limit(100);
  for (const job of jobs) {
    const id = job.paymentId?.startsWith('credit:')
      ? job.paymentId.slice(7)
      : null;
    if (!id) continue;
    await retryLocalTransaction(() =>
      db().transaction(async (tx: any) => {
        const [record] = await tx
          .update(credit)
          .set({ status: 'deleted' })
          .where(
            and(
              eq(credit.id, id),
              eq(credit.userId, job.userId),
              eq(credit.transactionType, 'consume'),
              eq(credit.status, 'active')
            )
          )
          .returning();
        await tx
          .update(danceJob)
          .set({ paymentMode: 'credits-restored' })
          .where(eq(danceJob.id, job.id));
        if (!record) return;
        for (const item of JSON.parse(record.consumedDetail || '[]'))
          await tx
            .update(credit)
            .set({
              remainingCredits: sql`${credit.remainingCredits} + ${item.creditsConsumed}`,
            })
            .where(
              and(eq(credit.id, item.creditId), eq(credit.userId, job.userId))
            );
      })
    );
  }
}

export enum AITaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

/**
 * Create an AI task with optional credit consumption.
 */
export async function createTask(params: {
  userId: string;
  mediaType: string;
  provider: string;
  model: string;
  prompt: string;
  costCredits?: number;
  options?: any;
}): Promise<any> {
  const { userId, mediaType, provider, model, prompt, costCredits, options } =
    params;

  return db().transaction(async (tx: any) => {
    // 1. Insert task
    const taskData: any = {
      id: getUuid(),
      userId,
      mediaType,
      provider,
      model,
      prompt,
      status: AITaskStatus.PENDING,
      costCredits: costCredits || 0,
    };

    const [task] = await tx.insert(aiTask).values(taskData).returning();

    // 2. Consume credits if cost > 0
    if (costCredits && costCredits > 0) {
      const result = await consume({
        userId,
        credits: costCredits,
        scene: 'ai_task',
        description: `AI ${mediaType} generation`,
        metadata: JSON.stringify({ taskId: task.id }),
        tx,
      });

      if (!result.success) {
        throw new Error('Insufficient credits');
      }

      // Store consumed credit ID for potential revocation
      if (result.consumedCredit) {
        await tx
          .update(aiTask)
          .set({
            taskInfo: JSON.stringify({ creditId: result.consumedCredit.id }),
          })
          .where(eq(aiTask.id, task.id));
      }
    }

    return task;
  });
}

/**
 * Update task status. Revokes credits on failure.
 */
export async function updateTask(params: {
  taskId: string;
  status: AITaskStatus;
  taskResult?: any;
}) {
  const { taskId, status, taskResult } = params;

  const [task] = await db()
    .select()
    .from(aiTask)
    .where(eq(aiTask.id, taskId))
    .limit(1);

  if (!task) throw new Error('Task not found');

  // Update task
  const updateData: any = { status };
  if (taskResult) {
    updateData.taskResult = JSON.stringify(taskResult);
  }

  await db().update(aiTask).set(updateData).where(eq(aiTask.id, taskId));

  // Revoke credits on failure
  if (status === AITaskStatus.FAILED && task.taskInfo) {
    try {
      const info = JSON.parse(task.taskInfo as string);
      if (info.creditId) {
        await revoke(info.creditId);
      }
    } catch {
      // Ignore parse errors
    }
  }
}

/**
 * Get tasks for a user.
 */
export async function getTasks(params: {
  userId: string;
  mediaType?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { userId, mediaType, status, page = 1, limit = 20 } = params;

  return db()
    .select()
    .from(aiTask)
    .where(
      and(
        eq(aiTask.userId, userId),
        mediaType ? eq(aiTask.mediaType, mediaType) : undefined,
        status ? eq(aiTask.status, status) : undefined,
        isNull(aiTask.deletedAt)
      )
    )
    .orderBy(desc(aiTask.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
}

/**
 * Find task by ID.
 */
export async function findTask(taskId: string) {
  const [result] = await db()
    .select()
    .from(aiTask)
    .where(eq(aiTask.id, taskId))
    .limit(1);
  return result;
}
