export type PaymentReview = 'confirmed' | 'pending' | 'login';

// URL flags are not proof: verify provider, ownership and idempotent ledger grant.
export async function reviewDancePayment<
  T extends { metadata?: Record<string, string> | null },
>(args: {
  userId?: string;
  sessionId: string;
  live: boolean;
  retrieve: (id: string) => Promise<T>;
  fulfill: (checkout: T) => Promise<unknown>;
}): Promise<PaymentReview> {
  if (!args.userId) return 'login';
  if (
    args.sessionId.length > 255 ||
    !new RegExp(`^cs_${args.live ? 'live' : 'test'}_[A-Za-z0-9_]+$`).test(
      args.sessionId
    )
  )
    return 'pending';
  try {
    const checkout = await args.retrieve(args.sessionId);
    if (checkout.metadata?.userId !== args.userId) return 'pending';
    await args.fulfill(checkout);
    return 'confirmed';
  } catch {
    return 'pending';
  }
}
