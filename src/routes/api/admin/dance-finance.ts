import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { getAllConfigs } from '@/modules/config/service';
import {
  queryFinance,
  reconcileKieCosts,
} from '@/modules/dance-finance/service';
import { hasPermission } from '@/modules/rbac/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

const noStore = { headers: { 'Cache-Control': 'private, no-store' } };
const period = z.coerce.number().int().min(1).max(31);
async function GET({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (
    !session?.user ||
    !(await hasPermission(session.user.id, 'admin.payments.read'))
  )
    return respErr('Forbidden', { status: 403 });
  const days = period.safeParse(
    new URL(request.url).searchParams.get('days') || 7
  );
  if (!days.success) return respErr('Invalid period', { status: 400 });
  try {
    return respData(await queryFinance(days.data), noStore);
  } catch {
    return respErr('Finance report unavailable', { status: 503 });
  }
}
async function POST({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (
    !session?.user ||
    !(await hasPermission(session.user.id, 'admin.payments.read')) ||
    !(await hasPermission(session.user.id, 'admin.settings.write'))
  )
    return respErr('Forbidden', { status: 403 });
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return respErr('Invalid origin', { status: 403 });
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 30_000,
    keyPrefix: 'kie-cost-reconcile',
    extraKey: session.user.id,
  });
  if (limited) return limited;
  try {
    const body = z
      .object({ days: period, afterId: z.string().min(1).max(100).optional() })
      .strict()
      .safeParse(await request.json());
    if (!body.success) return respErr('Invalid period', { status: 400 });
    const configs = await getAllConfigs();
    if (!configs.kie_api_key)
      return respErr('Kie is not configured', { status: 503 });
    return respData(
      await reconcileKieCosts(
        configs.kie_api_key,
        body.data.days,
        body.data.afterId
      ),
      noStore
    );
  } catch {
    return respErr('Cost reconciliation unavailable', { status: 503 });
  }
}
export const Route = createFileRoute('/api/admin/dance-finance')({
  server: { handlers: { GET, POST } },
});
