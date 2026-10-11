// Cloud-only runtime primitives. Bindings contain no browser-visible credentials.
export function cloudBindings(): any {
  return (globalThis as any).__CF_ENV__ ?? (globalThis as any).__env__;
}
export function cloudDanceEnabled() {
  return (
    process.env.DANCE_CLOUD_ENABLED === 'true' &&
    process.env.DATABASE_PROVIDER === 'd1' &&
    !!cloudBindings()?.DB
  );
}
export function danceD1(): any {
  if (!cloudDanceEnabled()) throw new Error('Cloud dance unavailable');
  return cloudBindings().DB;
}
