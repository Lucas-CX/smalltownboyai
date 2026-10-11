// Better Auth rejects fragments in relative callback URLs. Preserve the studio
// anchor with an absolute URL, while keeping the destination on this origin.
export function authCallbackUrl(path: string, origin: string): string {
  const base = new URL(origin).origin;
  const target = new URL(path, base);
  if (
    target.origin !== base ||
    !['https:', 'http:'].includes(target.protocol)
  ) {
    throw new Error('Invalid authentication callback');
  }
  return target.href;
}

export function authRetryUrl(
  returnTo: string,
  signInPath: string,
  origin: string
) {
  const target = new URL(authCallbackUrl(signInPath, origin));
  target.searchParams.set('callbackUrl', returnTo);
  target.searchParams.set('authError', '1');
  return target.href;
}
