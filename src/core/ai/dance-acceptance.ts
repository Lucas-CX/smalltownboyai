import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

import { readDanceReference, readPrivate } from '@/core/storage/dance-private';
import { danceTemplate } from '@/lib/dance-template';

import { danceCallbackUrl } from './dance-callback';
import { DANCE_PROMPT_VERSION, KieDanceClient } from './dance-kie';

// Operator-created local permit. Never derived from a browser field or an order number.
const directory = 'data/dance-acceptance';
export async function realDancePermit(userId: string, resolution: string) {
  if (process.env.DANCE_GENERATION_MODE !== 'kie') return;
  const permit = JSON.parse(await readFile(`${directory}/permit.json`, 'utf8'));
  if (
    permit.userId !== userId ||
    resolution !== '480P' ||
    permit.maxCalls !== 1 ||
    permit.budgetCents !== 150 ||
    permit.templateVersion !== danceTemplate.version ||
    permit.expiresAt < Date.now() ||
    !/^[a-f0-9-]{36}$/.test(permit.id)
  )
    throw new Error('Real test authorization unavailable');
  try {
    await access(`${directory}/${permit.id}.lock`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return permit as {
        id: string;
        userId: string;
        maxCalls: number;
        budgetCents: number;
        expiresAt: number;
      };
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
  const callbackUrl = danceCallbackUrl(job.id);
  const permit = await realDancePermit(job.userId, job.resolution);
  if (!permit || !key) throw new Error('Real test configuration missing');
  const client = new KieDanceClient(key);
  const balance = await client.balance();
  if (balance < 240) throw new Error('Insufficient provider balance');
  // Consume the single authorization BEFORE external side effects. A crash/timeout never resubmits.
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/${permit.id}.lock`,
    JSON.stringify({
      jobId: job.id,
      authorizedCents: permit.budgetCents,
      estimatedCents: 120,
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
  return client.submit(images, reference, '480P', callbackUrl);
}

export { downloadDanceResult } from './dance-result';
