import { createFileRoute } from '@tanstack/react-router';
import { and, eq } from 'drizzle-orm';

import { getAuth } from '@/core/auth';
import { db } from '@/core/db';
import { dancePaymentMode } from '@/core/payment/dance-mode';
import { order } from '@/config/db/schema';
import { md5 } from '@/lib/hash';
import { respData, respErr } from '@/lib/resp';

export const Route = createFileRoute('/api/dance/payment-analytics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headers = { 'Cache-Control': 'private, no-store' };
        const session = await getAuth().api.getSession({
          headers: request.headers,
        });
        if (!session?.user)
          return respErr('Unauthorized', { status: 401, headers });
        const id = request.headers
          .get('cookie')
          ?.match(/(?:^|;\s*)dance_payment_receipt=([^;]*)/)?.[1];
        if (!id || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(id))
          return respData({ receipt: null }, { headers });
        const [paid] = await db()
          .select()
          .from(order)
          .where(
            and(
              eq(order.userId, session.user.id),
              eq(order.paymentSessionId, id),
              eq(order.status, 'paid'),
              eq(order.paymentProvider, dancePaymentMode())
            )
          )
          .limit(1);
        if (!paid) return respData({ receipt: null }, { headers });
        return respData(
          {
            receipt: {
              transaction_id: md5(paid.id),
              value: (paid.paymentAmount ?? paid.amount) / 100,
              currency: paid.currency.toUpperCase(),
              pack_id: paid.productId,
              payment_mode: paid.paymentProvider,
            },
          },
          { headers }
        );
      },
    },
  },
});
