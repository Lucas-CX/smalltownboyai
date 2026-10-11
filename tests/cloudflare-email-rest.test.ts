import assert from 'node:assert/strict';
import test from 'node:test';

import { CloudflareEmailProvider } from '../src/core/email/cloudflare';

test('Cloudflare REST uses documented recipient arrays, reply_to and message_id', async (t) => {
  let request: Record<string, unknown> = {};
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: unknown, init: RequestInit) => {
      request = JSON.parse(String(init.body));
      return Response.json({
        success: true,
        result: {
          message_id: '<accepted@example.com>',
          delivered: [],
          queued: ['recipient@example.com'],
          permanent_bounces: [],
        },
      });
    }
  );
  const provider = new CloudflareEmailProvider({
    apiToken: 'test-only',
    accountId: 'test-account',
    defaultFrom: 'notifications@example.com',
  });
  const result = await provider.sendEmail({
    to: 'recipient@example.com',
    cc: 'copy@example.com',
    bcc: ['hidden@example.com'],
    replyTo: 'support@example.com',
    subject: 'Verification',
    text: 'Test message',
  });
  assert.deepEqual(request.to, ['recipient@example.com']);
  assert.deepEqual(request.cc, ['copy@example.com']);
  assert.deepEqual(request.bcc, ['hidden@example.com']);
  assert.equal(request.reply_to, 'support@example.com');
  assert.equal('replyTo' in request, false);
  assert.equal(result.success, true);
  assert.equal(result.messageId, '<accepted@example.com>');
});
