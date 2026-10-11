import assert from 'node:assert/strict';
import test from 'node:test';

import { CloudflareEmailProvider } from '../src/core/email/cloudflare';
import { emailConfigurationHealth } from '../src/core/email/config';
import { danceNoticeDraft } from '../src/core/email/dance-notices';

test('missing or unsupported providers cannot report healthy; no secrets returned', () => {
  assert.equal(emailConfigurationHealth({}).configured, false);
  assert.equal(
    emailConfigurationHealth({ email_provider: 'unknown' }).configured,
    false
  );
  const health = emailConfigurationHealth({
    resend_api_key: 'private-secret',
    resend_sender_email: 'Support <support@example.com>',
  });
  assert.equal(health.configured, true);
  assert.equal(health.deliveryVerified, false);
  assert.equal(health.notificationsEnabled, false);
  assert.equal(JSON.stringify(health).includes('private-secret'), false);
  assert.equal(
    emailConfigurationHealth({
      resend_api_key: 'x',
      resend_sender_email: 'bad\r\naddress',
    }).configured,
    false
  );
});
test('Workers binding needs only sender and forwards all recipients with a real ID', async () => {
  assert.equal(
    emailConfigurationHealth(
      {
        email_provider: 'cloudflare',
        cloudflare_email_sender_email: 'notifications@example.com',
      },
      true
    ).configured,
    true
  );
  assert.equal(
    emailConfigurationHealth(
      {
        email_provider: 'cloudflare',
        cloudflare_email_sender_email: 'notifications@example.com',
      },
      false
    ).configured,
    false
  );
  let captured: Record<string, unknown> = {};
  const provider = new CloudflareEmailProvider({
    defaultFrom: 'notifications@example.com',
    binding: {
      async send(message) {
        captured = message;
        return { messageId: 'test-message-id' };
      },
    },
  });
  const result = await provider.sendEmail({
    to: ['one@example.com', 'two@example.com'],
    subject: 'Test',
    text: 'Test',
  });
  assert.equal(result.success, true);
  assert.equal(result.messageId, 'test-message-id');
  assert.deepEqual(captured.to, ['one@example.com', 'two@example.com']);
});
test('provider failures are never reported as successful delivery', async () => {
  const provider = new CloudflareEmailProvider({
    binding: {
      async send() {
        throw new Error('E_SENDER_NOT_VERIFIED');
      },
    },
  });
  const result = await provider.sendEmail({
    to: 'one@example.com',
    subject: 'Test',
    text: 'Test',
  });
  assert.equal(result.success, false);
  assert.equal(result.messageId, undefined);
});
test('recovery drafts preserve expiry, privacy deletion and compensation facts', () => {
  const ready = danceNoticeDraft(
    'delivery-restored',
    'Test App',
    'https://example.com'
  );
  assert.match(ready.text, /original download expiry/);
  assert.match(ready.text, /did not charge you again/);
  const credits = danceNoticeDraft(
    'credits-compensated',
    'Test App',
    'https://example.com'
  );
  assert.match(credits.text, /100 support credits/);
  assert.match(credits.text, /not a cash refund/);
  assert.match(credits.text, /kept the deleted task deleted/);
  assert.throws(() =>
    danceNoticeDraft('delivery-restored', 'Test App', 'http://example.com')
  );
});
