import { createHmac, timingSafeEqual } from 'node:crypto';

// Per-job capability: no provider/account secret appears in the callback URL.
// The receiver still fetches the authoritative result from Kie; it never trusts
// callback status or media URLs. Job expiry limits this capability's usefulness.
function signature(jobId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('Callback signing unavailable');
  return createHmac('sha256', secret)
    .update(`kie-dance-callback:v1:${jobId}`)
    .digest('hex');
}
export function danceCallbackUrl(jobId: string) {
  if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new Error('Invalid callback job');
  const url = new URL('/api/dance/kie-callback', process.env.VITE_APP_URL);
  if (url.protocol !== 'https:') throw new Error('HTTPS callback required');
  url.searchParams.set('job', jobId);
  url.searchParams.set('token', signature(jobId));
  return url.href;
}
export function verifyDanceCallback(url: URL): string | null {
  const jobId = url.searchParams.get('job') || '';
  const token = url.searchParams.get('token') || '';
  if (!/^[a-f0-9-]{36}$/.test(jobId) || !/^[a-f0-9]{64}$/.test(token))
    return null;
  return timingSafeEqual(
    Buffer.from(token, 'hex'),
    Buffer.from(signature(jobId), 'hex')
  )
    ? jobId
    : null;
}
export async function readCallbackTaskId(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing callback');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 64 * 1024) {
      await reader.cancel();
      throw new Error('Callback too large');
    }
    chunks.push(part.value);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const taskId =
    body?.data?.taskId ?? body?.data?.task_id ?? body?.taskId ?? body?.task_id;
  if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(taskId))
    throw new Error('Invalid callback task');
  return taskId;
}
