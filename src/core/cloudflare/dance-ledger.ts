import { danceCreditCost } from '../../lib/dance-plans';
import {
  dancePaymentMode,
  danceStripeLive,
  validateDancePayment,
} from '../payment/dance-mode';
import { danceD1 } from './dance';

export async function cloudDanceBalance(userId: string) {
  const row = await danceD1()
    .prepare(
      `SELECT COALESCE(SUM(c.remaining_credits),0) AS balance
    FROM credit c JOIN "order" o ON o.order_no=c.order_no
    WHERE c.user_id=? AND c.transaction_type='grant' AND c.status='active'
    AND (c.expires_at IS NULL OR c.expires_at>?) AND o.payment_provider=? AND o.status='paid'`
    )
    .bind(userId, Date.now(), dancePaymentMode())
    .first();
  return Number(row?.balance || 0);
}

export async function assertLiveDancePayment(jobId: string, userId: string) {
  const paid = await danceD1()
    .prepare(
      `SELECT j.id FROM dance_job j
    JOIN credit spent ON j.payment_id='credit:'||spent.id AND spent.user_id=j.user_id
    JOIN credit grant_row ON grant_row.id=json_extract(spent.consumed_detail,'$[0].creditId') AND grant_row.user_id=j.user_id
    JOIN "order" o ON o.order_no=grant_row.order_no AND o.user_id=j.user_id
    WHERE j.id=? AND j.user_id=? AND j.status='reconciling' AND j.generation_mode='kie'
    AND j.provider_id IS NULL AND j.payment_mode='credits-live'
    AND spent.transaction_type='consume' AND spent.status='active'
    AND ((json_extract(spent.metadata,'$.pricingVersion') IS NULL AND spent.credits=-100)
      OR (json_extract(spent.metadata,'$.pricingVersion')='resolution-v1'
        AND json_extract(spent.metadata,'$.resolution')=j.resolution
        AND spent.credits=-json_extract(spent.metadata,'$.cost')))
    AND -spent.credits=(SELECT SUM(json_extract(value,'$.creditsConsumed')) FROM json_each(spent.consumed_detail))
    AND json_extract(spent.metadata,'$.jobId')=j.id
    AND o.payment_provider='stripe-live' AND o.status='paid'`
    )
    .bind(jobId, userId)
    .first();
  if (!paid) throw new Error('Verified live payment required');
}

// The claim, FIFO allocation and debit execute in one atomic D1 batch.
export async function queueCloudDance(userId: string, jobId: string) {
  const d1 = danceD1();
  const intent = await d1
    .prepare('SELECT resolution FROM dance_job WHERE id=? AND user_id=?')
    .bind(jobId, userId)
    .first();
  if (!intent) throw new Error('Order unavailable');
  const resolution = intent.resolution ?? '480P';
  const cost = danceCreditCost(resolution);
  const grantNow = Date.now();
  const provider = dancePaymentMode();
  const paymentMode = danceStripeLive() ? 'credits-live' : 'credits-test';
  const token = `credit:${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const eligible = `SELECT c.id,c.remaining_credits,c.created_at FROM credit c JOIN "order" o ON c.order_no=o.order_no
    WHERE c.user_id=? AND c.transaction_type='grant' AND c.status='active'
    AND c.remaining_credits>0 AND (c.expires_at IS NULL OR c.expires_at>?)
    AND o.payment_provider=? AND o.status='paid'`;
  await d1.batch([
    d1
      .prepare(
        `UPDATE dance_job SET status='queued',payment_mode=?,payment_id=?,next_run_at=?
      WHERE id=? AND user_id=? AND status='unpaid' AND expires_at>?
      AND COALESCE(resolution,'480P')=?
      AND (SELECT COALESCE(SUM(remaining_credits),0) FROM (${eligible}))>=?`
      )
      .bind(
        paymentMode,
        token,
        now,
        jobId,
        userId,
        now,
        resolution,
        userId,
        grantNow,
        provider,
        cost
      ),
    d1
      .prepare(
        `INSERT INTO credit(id,user_id,transaction_no,transaction_type,transaction_scene,credits,remaining_credits,status,consumed_detail,metadata)
      SELECT ?,?,?,'consume','dance-cloud',?,0,'active',
      (SELECT json_group_array(json_object('creditId',id,'creditsConsumed',MIN(remaining_credits,?-previous)))
       FROM (SELECT *,COALESCE(SUM(remaining_credits) OVER (ORDER BY created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS previous
         FROM (${eligible})) WHERE previous<?),
      json_object('jobId',?,'pricingVersion','resolution-v1','resolution',?,'cost',?)
      WHERE EXISTS(SELECT 1 FROM dance_job WHERE id=? AND user_id=? AND payment_id=?)`
      )
      .bind(
        token.slice(7),
        userId,
        token,
        -cost,
        cost,
        userId,
        grantNow,
        provider,
        cost,
        jobId,
        resolution,
        cost,
        jobId,
        userId,
        token
      ),
    d1
      .prepare(
        `UPDATE credit SET remaining_credits=remaining_credits-(
      SELECT json_extract(value,'$.creditsConsumed') FROM credit spent,json_each(spent.consumed_detail)
      WHERE spent.id=? AND json_extract(value,'$.creditId')=credit.id)
      WHERE user_id=? AND id IN (SELECT json_extract(value,'$.creditId') FROM credit spent,json_each(spent.consumed_detail) WHERE spent.id=?)`
      )
      .bind(token.slice(7), userId, token.slice(7)),
  ]);
  const job = await d1
    .prepare(
      'SELECT status,payment_mode FROM dance_job WHERE id=? AND user_id=?'
    )
    .bind(jobId, userId)
    .first();
  if (!job || job.status === 'unpaid') throw new Error('INSUFFICIENT_CREDITS');
  if (![paymentMode, 'credits-restored'].includes(job.payment_mode))
    throw new Error('Order unavailable');
}

export async function restoreCloudDance(
  scope: { userId?: string; jobId?: string } = {}
) {
  const d1 = danceD1();
  const { results } = await d1
    .prepare(
      "SELECT id,payment_id,user_id FROM dance_job WHERE status='failed' AND payment_mode IN ('credits-test','credits-live') AND (? IS NULL OR user_id=?) AND (? IS NULL OR id=?) LIMIT 100"
    )
    .bind(
      scope.userId ?? null,
      scope.userId ?? null,
      scope.jobId ?? null,
      scope.jobId ?? null
    )
    .all();
  for (const job of results) {
    if (!job.payment_id?.startsWith('credit:')) continue;
    const id = job.payment_id.slice(7);
    await d1.batch([
      d1
        .prepare(
          `UPDATE credit SET remaining_credits=remaining_credits+(
        SELECT json_extract(value,'$.creditsConsumed') FROM credit spent,json_each(spent.consumed_detail)
        WHERE spent.id=? AND spent.user_id=? AND spent.transaction_type='consume' AND spent.status='active'
        AND json_extract(value,'$.creditId')=credit.id)
        WHERE user_id=? AND id IN (SELECT json_extract(value,'$.creditId') FROM credit spent,json_each(spent.consumed_detail)
        WHERE spent.id=? AND spent.user_id=? AND spent.transaction_type='consume' AND spent.status='active')`
        )
        .bind(id, job.user_id, job.user_id, id, job.user_id),
      d1
        .prepare(
          "UPDATE credit SET status='deleted' WHERE id=? AND user_id=? AND transaction_type='consume' AND status='active'"
        )
        .bind(id, job.user_id),
      d1
        .prepare(
          "UPDATE dance_job SET payment_mode='credits-restored',next_run_at=9999999999 WHERE id=? AND status='failed' AND payment_mode IN ('credits-test','credits-live')"
        )
        .bind(job.id),
    ]);
  }
}

export async function fulfillCloudCheckout(checkout: any) {
  validateDancePayment(checkout);
  const live = danceStripeLive();
  const d1 = danceD1();
  const orderNo = checkout.metadata?.danceCreditOrder;
  if (!orderNo?.startsWith(live ? 'dance-live:' : 'dance-test:'))
    throw new Error('Payment namespace mismatch');
  const intent = await d1
    .prepare('SELECT * FROM "order" WHERE order_no=?')
    .bind(orderNo)
    .first();
  if (
    !intent ||
    intent.payment_provider !== dancePaymentMode() ||
    checkout.id !== intent.payment_session_id ||
    checkout.metadata?.userId !== intent.user_id ||
    checkout.currency !== intent.currency ||
    checkout.amount_total !== intent.amount
  )
    throw new Error('Payment mismatch');
  const id = `grant:${orderNo}`;
  const result = await d1.batch([
    d1
      .prepare(
        `UPDATE "order" SET status='paid',payment_amount=?,payment_currency=?,paid_at=?,transaction_id=? WHERE id=? AND status='pending'`
      )
      .bind(
        checkout.amount_total,
        checkout.currency,
        Date.now(),
        typeof checkout.payment_intent === 'string'
          ? checkout.payment_intent
          : null,
        intent.id
      ),
    d1
      .prepare(
        `INSERT INTO credit(id,user_id,order_no,transaction_no,transaction_type,transaction_scene,credits,remaining_credits,status,description,metadata)
      SELECT ?,user_id,order_no,?,'grant','payment',credits_amount,credits_amount,'active',?,?
      FROM "order" WHERE id=? AND status='paid' ON CONFLICT(transaction_no) DO NOTHING`
      )
      .bind(
        id,
        id,
        live ? 'Stripe payment credits' : 'Stripe test payment credits',
        JSON.stringify({ testMode: !live }),
        intent.id
      ),
  ]);
  return result[1].meta.changes > 0;
}
