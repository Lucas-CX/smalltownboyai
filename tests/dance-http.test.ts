import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  danceHtmlPageRequest,
  normalizeDanceNodeRequest,
} from '../src/lib/dance-http';

test('Node mutation bodies remain readable after middleware clones them', async () => {
  const controller = new AbortController();
  const original = new Request('http://localhost:3000/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'preview@local.test' }),
    signal: controller.signal,
  });
  const wrapper = {
    runtime: { node: {} },
    url: original.url,
    method: original.method,
    headers: original.headers,
    body: original.body,
    signal: original.signal,
    clone() {
      throw new Error('Do not clone the Node wrapper');
    },
  } as unknown as Request;
  const normalized = normalizeDanceNodeRequest(wrapper);
  assert.equal(normalized.url, original.url);
  assert.equal(normalized.headers.get('content-type'), 'application/json');
  assert.deepEqual(await normalized.clone().json(), {
    email: 'preview@local.test',
  });
  assert.deepEqual(await normalized.json(), { email: 'preview@local.test' });
  controller.abort();
  assert.equal(normalized.signal.aborted, true);
});

test('Native Worker requests and bodyless Node reads are unchanged', () => {
  const native = new Request('https://example.test/api', {
    method: 'POST',
    body: 'body',
  });
  assert.equal(normalizeDanceNodeRequest(native), native);
  for (const method of ['GET', 'HEAD']) {
    const read = Object.assign(
      new Request('http://localhost:3000/', { method }),
      { runtime: { node: {} } }
    );
    assert.equal(normalizeDanceNodeRequest(read), read);
  }
});

const paths = ['/', '/pricing', '/about'];
const locales = ['en', 'zh', 'it', 'ru', 'pt-BR'];
const normalize = (request: Request) =>
  danceHtmlPageRequest(request, paths, locales);

test('Request-compatible server wrappers do not require native Request internal state', () => {
  const controller = new AbortController();
  const request = {
    url: 'https://example.com/zh/pricing',
    method: 'GET',
    headers: new Headers({ accept: 'text/markdown' }),
    signal: controller.signal,
  } as Request;
  const page = normalize(request);
  assert.equal(page.headers.get('accept'), 'text/html');
  assert.equal(page.url, request.url);
  controller.abort();
  assert.equal(page.signal.aborted, true);
});

test('Markdown-preferring public readers receive an HTML request without losing context', () => {
  for (const method of ['GET', 'HEAD']) {
    for (const path of ['/', '/zh', '/zh/pricing', '/pt-BR/about']) {
      const request = new Request(
        'https://example.com' + path + '?utm_source=test',
        {
          method,
          headers: {
            accept: 'text/markdown; q=1, application/json; q=0.5',
            cookie: 'test=retained',
            'user-agent': 'test-reader',
          },
        }
      );
      const page = normalize(request);
      assert.equal(page.headers.get('accept'), 'text/html');
      assert.equal(page.url, request.url);
      assert.equal(page.method, method);
      assert.equal(page.headers.get('cookie'), 'test=retained');
      assert.equal(page.headers.get('user-agent'), 'test-reader');
      assert.equal(
        request.headers.get('accept'),
        'text/markdown; q=1, application/json; q=0.5'
      );
    }
  }
});

test('APIs, assets, discovery files, missing pages and protected pages retain their protocol', () => {
  for (const path of [
    '/api/config',
    '/api/dance/jobs',
    '/_server/fn',
    '/admin',
    '/zh/settings',
    '/sign-in',
    '/llms.txt',
    '/robots.txt',
    '/sitemap.xml',
    '/media/example.mp4',
    '/not-found',
    '/de/pricing',
  ]) {
    const request = new Request('https://example.com' + path, {
      headers: { accept: 'text/markdown' },
    });
    assert.equal(normalize(request), request, path);
  }
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const request = new Request('https://example.com/pricing', {
      method,
      headers: { accept: 'text/markdown' },
    });
    assert.equal(normalize(request), request);
  }
  const rpc = new Request('https://example.com/pricing', {
    headers: { accept: 'text/markdown', 'x-tsr-serverFn': 'true' },
  });
  assert.equal(normalize(rpc), rpc);
});

test('Ordinary HTML, wildcard, JSON and disabled Markdown preferences are untouched', () => {
  for (const accept of [
    'text/html',
    'text/markdown, text/html;q=0.5',
    '*/*',
    'text/markdown, */*;q=0.1',
    'application/json',
    'text/markdown;q=0',
  ]) {
    const request = new Request('https://example.com/', {
      headers: { accept },
    });
    assert.equal(normalize(request), request, accept);
  }
  const noAccept = new Request('https://example.com/');
  assert.equal(normalize(noAccept), noAccept);
});
