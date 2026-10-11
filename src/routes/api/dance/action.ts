import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import * as dance from '@/modules/dance/service';
import { advanceDanceJobs } from '@/lib/dance-events.server';
import { respData, respErr } from '@/lib/resp';

const input = z.object({
  id: z.string().uuid(),
  action: z.enum(['pay-mock', 'support', 'delete']),
});
async function POST({ request }: { request: Request }) {
  try {
    dance.requireSandbox();
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return respErr('Invalid origin', { status: 403 });
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user) return respErr('Sign in to continue', { status: 401 });
    const { id, action } = input.parse(await request.json());
    if (action === 'pay-mock') {
      await dance.payMock(session.user.id, id);
      await advanceDanceJobs({
        userId: session.user.id,
        jobId: id,
        reason: 'submit',
      });
      return respData(dance.visible(await dance.owned(session.user.id, id)));
    }
    if (action === 'support') await dance.requestSupport(session.user.id, id);
    else await dance.erase(session.user.id, id);
    return respData({ ok: true });
  } catch {
    return respErr('Action unavailable for this order', { status: 400 });
  }
}
export const Route = createFileRoute('/api/dance/action')({
  server: { handlers: { POST } },
});
