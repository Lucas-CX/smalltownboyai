// Separate an explicit, one-use login continuation from passive draft recovery.
const storageKey = 'dance-login-intent';
type Snapshot = {
  photos: (string | null)[];
  requestKey: string;
  resolution?: string;
  packId?: string;
};
async function fingerprint(draft: Snapshot) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(draft))
  );
  return Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, '0')
  ).join('');
}
export function clearDanceLoginIntent() {
  sessionStorage.removeItem(storageKey);
}
export async function saveDanceLoginIntent(token: string, draft: Snapshot) {
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      token,
      fingerprint: await fingerprint(draft),
      expires: Date.now() + 10 * 60_000,
    })
  );
}
export async function consumeDanceLoginIntent(
  token: string | null,
  draft: Snapshot,
  navigationType: string
) {
  const raw = sessionStorage.getItem(storageKey);
  // Consume before asynchronous work: re-renders and duplicated callbacks cannot replay it.
  clearDanceLoginIntent();
  if (!token || !raw || navigationType !== 'navigate') return false;
  try {
    const saved = JSON.parse(raw);
    return (
      saved.token === token &&
      saved.expires > Date.now() &&
      saved.fingerprint === (await fingerprint(draft))
    );
  } catch {
    return false;
  }
}
