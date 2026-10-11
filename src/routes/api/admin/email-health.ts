import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { emailConfigurationHealth } from '@/core/email/config';
import { getAllConfigs } from '@/modules/config/service';
import { hasPermission } from '@/modules/rbac/service';
import { respData, respErr } from '@/lib/resp';

async function GET({ request }: { request: Request }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (
    !session?.user ||
    !(await hasPermission(session.user.id, 'admin.settings.read'))
  )
    return respErr('Forbidden', { status: 403 });
  try {
    return respData(emailConfigurationHealth(await getAllConfigs()), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return respErr('Email configuration unavailable', { status: 503 });
  }
}
export const Route = createFileRoute('/api/admin/email-health')({
  server: { handlers: { GET } },
});
