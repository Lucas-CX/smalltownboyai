import { danceD1 } from '@/core/cloudflare/dance';
import { assertLiveDancePayment } from '@/core/cloudflare/dance-ledger';
import { readDanceReference, readPrivate } from '@/core/storage/dance-private';
import { isDanceResolution } from '@/lib/dance-settings';
import { danceTemplate } from '@/lib/dance-template';

import { DANCE_PROMPT_VERSION, KieDanceClient } from './dance-kie';

export { downloadDanceResult } from './dance-result';

// A new explicit approval is required to install this server-only permit.
export async function realDancePermit(userId: string, resolution: string) {
  if (process.env.DANCE_GENERATION_MODE !== 'kie') return;
  if (process.env.DANCE_PAYMENT_MODE === 'stripe-live') {
    if (!isDanceResolution(resolution)) throw new Error('Invalid resolution');
    return { live: true, id: '' };
  }
  const permit = JSON.parse(process.env.DANCE_TEST_PERMIT || '{}');
  if (
    permit.userId !== userId ||
    resolution !== '480P' ||
    permit.maxCalls !== 1 ||
    permit.budgetCents !== 150 ||
    permit.templateVersion !== danceTemplate.version ||
    !Number.isFinite(permit.expiresAt) ||
    permit.expiresAt < Date.now() ||
    !/^[a-f0-9-]{36}$/.test(permit.id || '')
  )
    throw new Error('Real generation requires operator approval');
  const used = await danceD1()
    .prepare('SELECT name FROM config WHERE name=?')
    .bind(`dance-permit:${permit.id}`)
    .first();
  if (used) throw new Error('Approved generation already submitted');
  return permit;
}
export async function submitRealDance(
  job: { id: string; userId: string; resolution: string; photos: string },
  key: string
) {
  const photos: unknown = JSON.parse(job.photos);
  if (
    !Array.isArray(photos) ||
    photos.length !== 2 ||
    !photos.every((photo) => typeof photo === 'string' && photo.length > 0)
  )
    throw new Error('Exactly two role photos required');
  const permit = await realDancePermit(job.userId, job.resolution);
  if (!permit || !key) throw new Error('Real generation unavailable');
  if (permit.live) await assertLiveDancePayment(job.id, job.userId);
  const claimKey = permit.live
    ? `dance-live-submit:${job.id}`
    : `dance-permit:${permit.id}`;
  const client = new KieDanceClient(key);
  // The provider enforces the current resolution-specific price at submission.
  if ((await client.balance()) <= 0)
    throw new Error('Insufficient provider balance');
  const claimed = await danceD1()
    .prepare(
      'INSERT INTO config(name,value) VALUES (?,?) ON CONFLICT(name) DO NOTHING RETURNING name'
    )
    .bind(
      claimKey,
      JSON.stringify({
        jobId: job.id,
        at: Date.now(),
        templateVersion: danceTemplate.version,
        promptVersion: DANCE_PROMPT_VERSION,
      })
    )
    .first();
  if (!claimed) throw new Error('Permit consumed');
  const stage = async (value: string) => {
    await danceD1()
      .prepare('UPDATE config SET value=? WHERE name=?')
      .bind(
        JSON.stringify({
          jobId: job.id,
          at: Date.now(),
          stage: value,
          templateVersion: danceTemplate.version,
          promptVersion: DANCE_PROMPT_VERSION,
        }),
        claimKey
      )
      .run();
  };
  const images: string[] = [];
  for (const photo of photos as string[]) {
    await stage(`reading-photo-${images.length + 1}`);
    const form = new FormData();
    form.append(
      'file',
      new Blob([await readPrivate(photo)], { type: 'image/jpeg' }),
      `${crypto.randomUUID()}.jpg`
    );
    form.append('uploadPath', `dance/${job.id}`);
    await stage(`uploading-photo-${images.length + 1}`);
    const response = await fetch(
      'https://kieai.redpandaai.co/api/file-stream-upload',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        // Workers rejects redirect:'error' for this upload. Inspect any redirect
        // as a non-2xx response instead; never forward the key to another host.
        redirect: 'manual',
        signal: AbortSignal.timeout(60000),
      }
    ).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : '';
      const category = /redirect/i.test(message)
        ? 'redirect'
        : /length/i.test(message)
          ? 'content-length'
          : /timeout/i.test(message)
            ? 'timeout'
            : /invocation/i.test(message)
              ? 'receiver'
              : 'network';
      await stage(`upload-error-${category}`);
      throw new Error('Provider upload failed');
    });
    await stage(`upload-http-${response.status}`);
    if (!response.ok)
      throw new Error(`Provider upload HTTP ${response.status}`);
    const value = (await response.json()) as any;
    if (value.code !== 200 || typeof value.data?.downloadUrl !== 'string')
      throw new Error('Provider upload failed');
    images.push(value.data.downloadUrl);
  }
  await stage('uploading-video-reference');
  const reference = await client.uploadReference(await readDanceReference());
  // Persist the boundary before the only paid call. An ambiguous outcome after
  // this point must be reconciled in provider logs, never automatically retried.
  await stage('submitting-generation');
  if (!isDanceResolution(job.resolution)) throw new Error('Invalid resolution');
  return client.submit(images, reference, job.resolution);
}
