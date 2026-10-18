import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

import { readDanceReference, readPrivate } from '@/core/storage/dance-private';
import { danceTemplate } from '@/lib/dance-template';

import { DANCE_PROMPT_VERSION, KieDanceClient } from './dance-kie';

// Operator-created local permit. Never derived from a browser field or an order number.
const directory = 'data/dance-acceptance';
// Kie bills reference + output seconds at 16 credits/s for 720P.
export const LOCAL_TEST_CREDITS =
  (danceTemplate.durationSeconds + danceTemplate.outputSeconds) * 16;
export function validateRealDancePermit(
  permit: any,
  userId: string,
  resolution: string,
  now = Date.now()
) {
  if (
    !permit ||
    permit.userId !== userId ||
    resolution !== '720P' ||
    permit.resolution !== resolution ||
    permit.maxCalls !== 1 ||
    !Number.isInteger(permit.budgetCents) ||
    permit.budgetCents < LOCAL_TEST_CREDITS / 2 ||
    permit.budgetCents > 300 ||
    permit.templateVersion !== danceTemplate.version ||
    !Number.isFinite(permit.expiresAt) ||
    permit.expiresAt <= now ||
    typeof permit.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(permit.id)
  )
    throw new Error('Real test authorization unavailable');
  return permit as {
    id: string;
    userId: string;
    resolution: '720P';
    maxCalls: 1;
    budgetCents: number;
    expiresAt: number;
  };
}
export async function realDancePermit(userId: string, resolution: string) {
  if (process.env.DANCE_GENERATION_MODE !== 'kie') return;
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DANCE_SANDBOX !== 'true'
  )
    throw new Error('Real test requires local sandbox');
  const permit = validateRealDancePermit(
    JSON.parse(await readFile(`${directory}/permit.json`, 'utf8')),
    userId,
    resolution
  );
  try {
    await access(`${directory}/${permit.id}.lock`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return permit;
    throw error;
  }
  throw new Error(
    'Approved test already submitted. No further paid calls are authorized.'
  );
}

export async function submitRealDance(
  job: { id: string; userId: string; resolution: string; photos: string },
  key: string
) {
  const permit = await realDancePermit(job.userId, job.resolution);
  if (!permit || !key) throw new Error('Real test configuration missing');
  const client = new KieDanceClient(key);
  const balance = await client.balance();
  if (balance < LOCAL_TEST_CREDITS)
    throw new Error('Insufficient provider balance');
  // Consume the single authorization BEFORE external side effects. A crash/timeout never resubmits.
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/${permit.id}.lock`,
    JSON.stringify({
      jobId: job.id,
      authorizedCents: permit.budgetCents,
      estimatedCents: LOCAL_TEST_CREDITS / 2,
      resolution: permit.resolution,
      templateVersion: danceTemplate.version,
      promptVersion: DANCE_PROMPT_VERSION,
      balanceBefore: balance,
      createdAt: Date.now(),
    }),
    { flag: 'wx' }
  );
  const images: string[] = [];
  for (const photo of JSON.parse(job.photos) as string[]) {
    const bytes = await readPrivate(photo);
    const form = new FormData();
    form.append(
      'file',
      new Blob([bytes], { type: 'image/jpeg' }),
      `${crypto.randomUUID()}.jpg`
    );
    form.append('uploadPath', `dance-acceptance/${job.id}`);
    const response = await fetch(
      'https://kieai.redpandaai.co/api/file-stream-upload',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
      }
    );
    if (!response.ok) throw new Error('Provider upload failed');
    const payload = await response.json();
    if (payload.code !== 200 || typeof payload.data?.downloadUrl !== 'string')
      throw new Error('Provider upload failed');
    images.push(payload.data.downloadUrl);
  }
  const reference = await client.uploadReference(await readDanceReference());
  // localhost cannot receive Kie's HTTPS callbacks. The local UI advances
  // this scoped task using the existing bounded polling; Workers keep callbacks.
  return client.submit(images, reference, permit.resolution);
}

export { downloadDanceResult } from './dance-result';
