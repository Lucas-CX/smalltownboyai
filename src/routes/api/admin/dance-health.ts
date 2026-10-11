import { createFileRoute } from '@tanstack/react-router';

import { getAuth } from '@/core/auth';
import { cloudBindings } from '@/core/cloudflare/dance';
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
    const config = await getAllConfigs(true);
    const bindings = cloudBindings();
    return respData(
      {
        preview: process.env.VITE_PREVIEW_ONLY === 'true',
        paymentMode: process.env.DANCE_PAYMENT_MODE,
        generationMode: process.env.DANCE_GENERATION_MODE,
        kieConfigured: !!config.kie_api_key?.trim(),
        stripeConfigured:
          !!config.stripe_secret_key && !!config.stripe_signing_secret,
        privateStorageBound: !!bindings?.DANCE_FILES,
        imageProcessingBound: !!bindings?.IMAGES,
        processing: {
          mode: 'kie-callback-and-on-demand',
          recurringScheduler: false,
          callbackSigningConfigured:
            (process.env.AUTH_SECRET?.length ?? 0) >= 32,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch {
    return respErr('Readiness check unavailable', { status: 503 });
  }
}

export const Route = createFileRoute('/api/admin/dance-health')({
  server: { handlers: { GET } },
});
