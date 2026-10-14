import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { googleAnalyticsBootstrap } from '../src/lib/analytics-policy';
import { cleanDanceCampaign } from '../src/lib/dance-campaign';
import { funnelParamsSchema } from '../src/lib/dance-funnel-contract';

test('diagnostic entry suppresses initial GA even when browser storage is blocked', () => {
  for (const blocked of [false, true]) {
    const values = new Map<string, string>();
    const context: Record<string, any> = {
      URL,
      URLSearchParams,
      location: new URL('https://example.test/?diagnostic=1'),
      document: { cookie: '', referrer: '' },
      sessionStorage: {
        getItem: (key: string) => values.get(key),
        setItem: (key: string, value: string) => {
          if (blocked) throw new Error('storage blocked');
          values.set(key, value);
        },
      },
    };
    context.window = context;
    vm.runInNewContext(googleAnalyticsBootstrap('G-TEST'), context);
    assert.equal(context['ga-disable-G-TEST'], true);
    assert.equal(
      context.dataLayer.some((row: unknown[]) => row[0] === 'config'),
      false
    );
    context.location = new URL('https://example.test/zh');
    vm.runInNewContext(googleAnalyticsBootstrap('G-TEST'), context);
    assert.equal(
      context['ga-disable-G-TEST'],
      true,
      'cookie preserves exclusion on return'
    );
  }
});

test('campaign attribution allows only labels, strips sensitive inputs and validates at ingestion', () => {
  const clean = cleanDanceCampaign({
    utm_source: 'instagram',
    utm_medium: 'social',
    utm_campaign: 'launch_20261014',
    token: 'secret',
    email: 'private@example.test',
    utm_content: 'private',
  });
  assert.deepEqual(clean, {
    utm_source: 'instagram',
    utm_medium: 'social',
    utm_campaign: 'launch_20261014',
  });
  assert.deepEqual(funnelParamsSchema.parse(clean), clean);
  assert.deepEqual(
    cleanDanceCampaign({
      utm_source: 'https://example.test/?token=secret',
      utm_campaign: 'x'.repeat(81),
    }),
    {}
  );
});
