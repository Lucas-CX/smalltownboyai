import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { queryFunnel } from '@/modules/dance-funnel/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (
    !session?.user ||
    !(await hasPermission(session.user.id, 'admin.ai-tasks.read'))
  )
    return respErr('Forbidden', { status: 403 });
  try {
    const p = new URL(request.url).searchParams;
    const input = z
      .object({
        days: z.coerce.number().int().min(1).max(31).default(7),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        includeTests: z.boolean(),
        flowId: z.string().max(100).optional(),
      })
      .parse({
        days: p.get('days') || undefined,
        page: p.get('page') || undefined,
        includeTests: p.get('includeTests') === '1',
        flowId: p.get('flowId') || undefined,
      });
    return respData(await queryFunnel(input), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return respErr('Funnel unavailable. Check the database migration.', {
      status: 503,
    });
  }
}
export const Route = createFileRoute('/api/admin/dance-funnel')({
  server: { handlers: { GET } },
});
