import handler from '@tanstack/react-start/server-entry';

import { envConfigs } from './config';
import { getCookieFromHeader } from './lib/cookie';
import { danceCanonicalTarget } from './lib/dance-canonical';
import { dancePublicPaths } from './lib/dance-discovery';
import {
  danceHtmlPageRequest,
  normalizeDanceNodeRequest,
} from './lib/dance-http';
import { danceMarketLocales } from './lib/dance-locales';
import { previewResponse } from './lib/preview-response';
import { paraglideMiddleware } from './paraglide/server.js';

// On Cloudflare Workers, stash the binding env (D1, ASSETS, …) on globalThis
// so synchronous code paths (e.g. the db() singleton with DATABASE_PROVIDER=d1)
// can reach bindings without threading the request context through every call.
// The specifier is kept non-literal so bundlers leave the import to runtime;
// outside workerd the import rejects and we just move on.
const CF_WORKERS_MODULE = 'cloudflare:workers';
let cfEnvPromise: Promise<void> | null = null;

function ensureCloudflareEnv(): Promise<void> {
  if (!cfEnvPromise) {
    cfEnvPromise = import(/* @vite-ignore */ CF_WORKERS_MODULE)
      .then((mod) => {
        (globalThis as any).__CF_ENV__ = mod.env;
      })
      .catch(() => {
        // Not running on Cloudflare Workers — nothing to stash.
      });
  }
  return cfEnvPromise;
}

// Custom server entry — wraps every request in Paraglide's middleware so
// getLocale() resolves per-request (AsyncLocalStorage) during SSR.
export default {
  async fetch(req: Request): Promise<Response> {
    req = normalizeDanceNodeRequest(req);
    await ensureCloudflareEnv();
    const incoming = new URL(req.url);
    const canonicalTarget = danceCanonicalTarget(
      incoming,
      req.method,
      envConfigs.seo_url
    );
    if (canonicalTarget) return Response.redirect(canonicalTarget, 308);
    const preview = previewResponse(req, envConfigs.preview_only === 'true');
    if (preview) return preview;
    const pageRequest = danceHtmlPageRequest(
      req,
      dancePublicPaths,
      danceMarketLocales
    );
    const response = await paraglideMiddleware(pageRequest, () =>
      handler.fetch(pageRequest)
    );
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const utmSource = new URL(req.url).searchParams.get('utm_source');
    const existing = getCookieFromHeader(
      req.headers.get('cookie'),
      'utm_source'
    );
    if (utmSource && !existing) {
      const sanitized = utmSource.replace(/[^\w.\-]/g, '').slice(0, 100);
      if (sanitized) {
        response.headers.append(
          'Set-Cookie',
          `utm_source=${sanitized}; Max-Age=2592000; Path=/; SameSite=Lax`
        );
      }
    }
    return response;
  },
};
