// Only public GET/HEAD pages on known production hosts are normalized.
// POSTs, APIs and local/staging hosts retain their existing request behavior.
export function danceCanonicalTarget(
  input: URL,
  method: string,
  origin: string
) {
  if (
    !['GET', 'HEAD'].includes(method) ||
    input.pathname.startsWith('/api/') ||
    input.pathname === '/api'
  )
    return null;
  const canonical = new URL(origin);
  const hosts = [canonical.hostname, 'www.' + canonical.hostname];
  if (!hosts.includes(input.hostname)) return null;
  const target = new URL(input.href);
  target.protocol = canonical.protocol;
  target.host = canonical.host;
  if (target.pathname !== '/')
    target.pathname = target.pathname.replace(/\/+$/, '');
  return target.href === input.href ? null : target.href;
}
