import { z } from 'zod';

const key = 'dance-purchase-intent-v1';
const schema = z
  .object({
    packId: z.enum(['single', 'friends', 'collection']),
    resolution: z.enum(['480P', '720P', '1080P']),
    requestKey: z.string().uuid(),
    ownerId: z.string().optional(),
    expiresAt: z.number().finite(),
  })
  .strict();
export type DancePurchaseIntent = z.infer<typeof schema>;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function savePurchaseIntent(
  storage: Store,
  intent: Omit<DancePurchaseIntent, 'expiresAt'>,
  now = Date.now()
) {
  const value = schema.parse({ ...intent, expiresAt: now + 30 * 60_000 });
  storage.setItem(key, JSON.stringify(value));
}

export function clearPurchaseIntent(storage: Store) {
  storage.removeItem(key);
}

// Resume only for a signed-in user, and bind an anonymous intent to that user.
// Reading does not purchase anything; an explicit confirmation is still required.
export function readPurchaseIntent(
  storage: Store,
  ownerId: string,
  now = Date.now()
) {
  const raw = storage.getItem(key);
  if (!raw) return;
  let value: DancePurchaseIntent;
  try {
    value = schema.parse(JSON.parse(raw));
  } catch {
    clearPurchaseIntent(storage);
    return;
  }
  if (
    !ownerId ||
    value.expiresAt <= now ||
    value.expiresAt > now + 30 * 60_000 ||
    (value.ownerId && value.ownerId !== ownerId)
  ) {
    clearPurchaseIntent(storage);
    return;
  }
  value.ownerId = ownerId;
  storage.setItem(key, JSON.stringify(value));
  return value;
}
