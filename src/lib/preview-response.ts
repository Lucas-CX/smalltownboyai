import { respData, respErr } from './resp';

// Display-only deployments must work without a database and cannot accept mutations.
export function previewResponse(
  request: Request,
  enabled: boolean
): Response | null {
  if (!enabled) return null;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/zh(?=\/|$)/, '') || '/';
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (path.startsWith('/api/')) {
    if (request.method === 'GET' && path === '/api/auth/get-session')
      return Response.json(null, { headers });
    if (request.method === 'GET' && path === '/api/config/public')
      return respData(
        {
          email_auth_enabled: 'false',
          google_auth_enabled: 'false',
          google_one_tap_enabled: 'false',
          github_auth_enabled: 'false',
          password_reset_enabled: 'false',
        },
        { headers }
      );
    if (request.method === 'GET' && path === '/api/dance/settings')
      return respData(
        { simulation: true, acceptance: false, previewOnly: true },
        { headers }
      );
    return respErr('Display preview only. This feature is not open yet.', {
      status: 503,
      headers,
    });
  }
  if (
    /^\/(admin|settings|sign-in|sign-up|forgot-password|reset-password|verify-email|auth-callback)(\/|$)/.test(
      path
    )
  )
    return Response.redirect(
      new URL(url.pathname.startsWith('/zh/') ? '/zh' : '/', url),
      302
    );
  return null;
}
