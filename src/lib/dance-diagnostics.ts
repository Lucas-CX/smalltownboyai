export function authFailureReason(error: unknown) {
  const value =
    error && typeof error === 'object'
      ? (error as { code?: string; status?: number })
      : {};
  if (value.code === 'EMAIL_NOT_VERIFIED') return 'email_not_verified';
  if (
    [
      'INVALID_EMAIL_OR_PASSWORD',
      'INVALID_PASSWORD',
      'USER_NOT_FOUND',
    ].includes(value.code || '')
  )
    return 'invalid_credentials';
  if (value.status === 429) return 'rate_limited';
  if (error instanceof TypeError) return 'network_or_client';
  if (value.status && value.status >= 500) return 'auth_service_unavailable';
  return 'auth_failed';
}

export function runtimeDiagnostic(
  error: unknown,
  filename: string | undefined,
  line: number | undefined,
  origin: string,
  userAgent: string
) {
  const name = error instanceof Error ? error.name : '';
  const error_kind = [
    'TypeError',
    'ReferenceError',
    'SyntaxError',
    'RangeError',
  ].includes(name)
    ? (name as 'TypeError' | 'ReferenceError' | 'SyntaxError' | 'RangeError')
    : 'Other';
  let error_source: 'first_party' | 'third_party' | 'opaque' = 'opaque';
  try {
    if (filename)
      error_source =
        new URL(filename).origin === origin ? 'first_party' : 'third_party';
  } catch {
    /* no raw URL leaves this function */
  }
  const browser_family = /Edg/i.test(userAgent)
    ? 'edge'
    : /Firefox|FxiOS/i.test(userAgent)
      ? 'firefox'
      : /Chrome|CriOS/i.test(userAgent)
        ? 'chrome'
        : /Safari/i.test(userAgent)
          ? 'safari'
          : 'other';
  const error_line =
    Number.isInteger(line) && line! >= 0 && line! <= 1_000_000 ? line! : 0;
  // Group by safe error class/source/position, never by a message or stack that
  // may contain photos, customer data, provider payloads or signed URLs.
  const safe = `${error_kind}:${error_source}:${error_line}`;
  let hash = 2166136261;
  for (const char of safe)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return {
    error_kind,
    error_source,
    error_line,
    browser_family,
    error_fingerprint: (hash >>> 0).toString(16).padStart(8, '0'),
  } as const;
}
