import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { list, requireSandbox } from '@/modules/dance/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  try {
    requireSandbox();
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (
      !session?.user ||
      !(await hasPermission(session.user.id, 'admin.ai-tasks.read'))
    )
      return respErr('Forbidden', { status: 403 });
    return respData(await list(), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return respErr('Sandbox unavailable', { status: 503 });
  }
}
export const Route = createFileRoute('/api/admin/dance')({
  server: { handlers: { GET } },
});
