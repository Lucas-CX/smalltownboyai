import { z } from 'zod';

const receiptSchema = z.object({
  transaction_id: z.string().regex(/^[a-f0-9]{32}$/),
  value: z.number().finite().positive(),
  currency: z.literal('USD'),
  pack_id: z.enum(['single', 'friends', 'collection']),
  payment_mode: z.enum(['stripe-live', 'stripe-test']),
});
export type DancePaymentReceipt = z.infer<typeof receiptSchema>;

export function readDancePaymentReceipt(value: unknown) {
  const result = z
    .object({ receipt: receiptSchema.nullable() })
    .safeParse(value);
  return result.success ? result.data.receipt : null;
}

// The server returns an opaque order hash, never a Stripe ID or personal data.
// Reuse the event ID across refreshes/tabs so database ingestion is idempotent.
export function paymentFunnelEventId(transactionId: unknown) {
  if (
    typeof transactionId !== 'string' ||
    !/^[a-f0-9]{32}$/.test(transactionId)
  )
    return undefined;
  return `${transactionId.slice(0, 8)}-${transactionId.slice(8, 12)}-4${transactionId.slice(13, 16)}-8${transactionId.slice(17, 20)}-${transactionId.slice(20)}`;
}
