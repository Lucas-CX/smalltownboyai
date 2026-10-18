import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  LOCAL_TEST_CREDITS,
  realDancePermit,
  submitRealDance,
  validateRealDancePermit,
} from '../src/core/ai/dance-acceptance';
import { KieDanceClient } from '../src/core/ai/dance-kie';
import { deletePrivate, savePrivate } from '../src/core/storage/dance-private';
import { danceTemplate } from '../src/lib/dance-template';

const now = 1_000;
const permit = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'test-user',
  resolution: '720P',
  maxCalls: 1,
  budgetCents: 224,
  expiresAt: 2_000,
  templateVersion: danceTemplate.version,
};
test('720p permit covers both input and output duration', () => {
  assert.equal(LOCAL_TEST_CREDITS, 448);
  assert.equal(
    validateRealDancePermit(permit, 'test-user', '720P', now).resolution,
    '720P'
  );
});
test('reject wrong owner, resolution, budget, expiration and reusable permits', () => {
  for (const change of [
    { userId: 'other' },
    { resolution: '480P' },
    { maxCalls: 2 },
    { budgetCents: 223 },
    { budgetCents: 301 },
    { expiresAt: now },
    { expiresAt: null },
    { expiresAt: 'tomorrow' },
    { templateVersion: 'old' },
    { id: '../../invalid' },
  ])
    assert.throws(() =>
      validateRealDancePermit(
        { ...permit, ...change },
        'test-user',
        '720P',
        now
      )
    );
  assert.throws(() =>
    validateRealDancePermit(permit, 'test-user', '480P', now)
  );
  assert.throws(() => validateRealDancePermit(null, 'test-user', '720P', now));
});

test('concurrent submissions and restart cannot reuse the single paid-call permit', async () => {
  const cwd = process.cwd();
  const root = path.resolve(cwd, 'output');
  await mkdir(root, { recursive: true });
  const temp = await mkdtemp(path.join(root, 'permit-test-'));
  const env = {
    mode: process.env.DANCE_GENERATION_MODE,
    sandbox: process.env.DANCE_SANDBOX,
    node: process.env.NODE_ENV,
  };
  const original = {
    fetch: globalThis.fetch,
    balance: KieDanceClient.prototype.balance,
    upload: KieDanceClient.prototype.uploadReference,
    submit: KieDanceClient.prototype.submit,
  };
  const photos = [
    await savePrivate(Buffer.from('fixture-a')),
    await savePrivate(Buffer.from('fixture-b')),
  ];
  let submissions = 0;
  try {
    process.chdir(temp);
    process.env.DANCE_GENERATION_MODE = 'kie';
    process.env.DANCE_SANDBOX = 'true';
    process.env.NODE_ENV = 'development';
    await mkdir('data/dance-acceptance', { recursive: true });
    await mkdir('public/media/smalltown-duo-v1', { recursive: true });
    await writeFile(
      'public/media/smalltown-duo-v1/reference.mp4',
      'fixture-reference'
    );
    await writeFile(
      'data/dance-acceptance/permit.json',
      JSON.stringify({ ...permit, expiresAt: Date.now() + 60000 })
    );
    KieDanceClient.prototype.balance = async () => 1000;
    KieDanceClient.prototype.uploadReference = async () => ({
      url: 'https://example.test/reference.mp4',
      durationSeconds: 14,
    });
    KieDanceClient.prototype.submit = async (
      _images,
      _reference,
      resolution
    ) => {
      assert.equal(resolution, '720P');
      submissions++;
      return 'single-provider-task';
    };
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          code: 200,
          data: { downloadUrl: 'https://example.test/photo.jpg' },
        })
      );
    const job = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'test-user',
      resolution: '720P',
      photos: JSON.stringify(photos),
    };
    const results = await Promise.allSettled([
      submitRealDance(job, 'fixture-key'),
      submitRealDance(job, 'fixture-key'),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(submissions, 1);
    await assert.rejects(
      () => realDancePermit('test-user', '720P'),
      /already submitted/
    );
    const lock = JSON.parse(
      await readFile(`data/dance-acceptance/${permit.id}.lock`, 'utf8')
    );
    assert.equal(lock.estimatedCents, 224);
    assert.equal(lock.jobId, job.id);
  } finally {
    process.chdir(cwd);
    globalThis.fetch = original.fetch;
    KieDanceClient.prototype.balance = original.balance;
    KieDanceClient.prototype.uploadReference = original.upload;
    KieDanceClient.prototype.submit = original.submit;
    for (const [key, value] of Object.entries({
      DANCE_GENERATION_MODE: env.mode,
      DANCE_SANDBOX: env.sandbox,
      NODE_ENV: env.node,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all(photos.map(deletePrivate));
    if (path.dirname(temp) !== root) throw Error('Invalid cleanup path');
    await rm(temp, { recursive: true, force: true });
  }
});
