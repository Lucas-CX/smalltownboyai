// Nitro/srvx's Node Request wrapper can transfer its underlying body while
// Paraglide clones it. Normalize the Node wrapper once before middleware, so
// the middleware and application share an ordinary Fetch Request. Workers and
// native requests are left untouched; uploads stay streamed (never buffered).
export function normalizeDanceNodeRequest(request: Request): Request {
  const runtime = (request as Request & { runtime?: { node?: unknown } })
    .runtime;
  if (!runtime?.node || ['GET', 'HEAD'].includes(request.method))
    return request;
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
    duplex: 'half',
  } as RequestInit);
}

// TanStack's page renderer requires an HTML Accept header. Offer the ordinary
// HTML page to Markdown-preferring readers; this does not produce Markdown.
// Keep server functions, APIs, assets and non-read requests untouched.
export function danceHtmlPageRequest(
  request: Request,
  publicPaths: readonly string[],
  locales: readonly string[]
): Request {
  if (!['GET', 'HEAD'].includes(request.method)) return request;
  if (request.headers.get('x-tsr-serverFn') === 'true') return request;

  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  const path = locales.includes(segments[1])
    ? '/' + segments.slice(2).join('/')
    : url.pathname;
  if (!publicPaths.includes(path)) return request;

  const accepted = (request.headers.get('accept') || '')
    .split(',')
    .map((entry) => {
      const [media, ...params] = entry.trim().toLowerCase().split(';');
      const quality = params.find((param) => param.trim().startsWith('q='));
      return {
        media: media.trim(),
        enabled: !quality || Number(quality.trim().slice(2)) > 0,
      };
    });
  if (
    !accepted.some(({ media, enabled }) => media === 'text/markdown' && enabled)
  ) {
    return request;
  }
  if (
    accepted.some(
      ({ media, enabled }) => ['text/html', '*/*'].includes(media) && enabled
    )
  ) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.set('accept', 'text/html');
  // Nitro may supply a Request-compatible wrapper rather than the native
  // implementation. Construct from the URL to avoid cross-runtime clone errors.
  return new Request(request.url, {
    method: request.method,
    headers,
    signal: request.signal,
  });
}
