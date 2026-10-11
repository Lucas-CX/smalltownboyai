import { sql } from 'drizzle-orm';

import { db } from '@/core/db';

let configured: Promise<unknown> | undefined;
// Only wrap database-only transactions. Never wrap provider requests or other side effects.
export async function retryLocalTransaction<T>(
  operation: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      if (process.env.DATABASE_PROVIDER === 'sqlite') {
        configured ||= Promise.resolve(
          db().run(sql`PRAGMA journal_mode=WAL`)
        ).catch((error) => {
          configured = undefined;
          throw error;
        });
        await configured;
      }
      return await operation();
    } catch (error) {
      const code =
        (error as { code?: string; cause?: { code?: string } }).code ||
        (error as { cause?: { code?: string } }).cause?.code;
      if (
        process.env.DATABASE_PROVIDER !== 'sqlite' ||
        code !== 'SQLITE_BUSY' ||
        attempt >= 5
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
}
