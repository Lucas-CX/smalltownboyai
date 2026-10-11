// Local-only acceptance; never creates an account or modifies roles remotely.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';

import { envConfigs } from '../src/config';
import { db } from '../src/core/db';

assert.equal(envConfigs.database_provider, 'sqlite');
assert.ok(envConfigs.database_url.startsWith('file:data/'));
const base = 'http://localhost:3000';
const flowId = randomUUID();
async function send(
  path: string,
  body?: unknown,
  cookie = `dance_flow=${flowId}`,
  origin = base
) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    json: await response.json(),
    cookies: response.headers.getSetCookie(),
  };
}
const event = {
  id: randomUUID(),
  event: 'dance_generate_clicked',
  locale: 'it',
  params: {},
};
assert.equal(
  (await send('/api/admin/dance-funnel?includeTests=1')).status,
  403
);
assert.equal(
  (
    await send(
      '/api/dance/events',
      { flowId, events: [event] },
      '',
      'https://invalid.example'
    )
  ).status,
  403
);
assert.equal(
  (await send('/api/dance/events', { flowId, events: [event] })).status,
  200
);
await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(
  (
    await send('/api/dance/events', {
      flowId,
      events: [{ ...event, event: 'server_payment_verified' }],
    })
  ).status,
  400
);
const email = `funnel-${randomUUID()}@example.test`,
  password = randomUUID() + 'Local9!';
const signup = await send('/api/auth/sign-up/email', {
  name: 'Local funnel QA',
  email,
  password,
});
assert.equal(signup.status, 200);
const id = signup.json.user.id;
const cookie =
  signup.cookies.map((value) => value.split(';')[0]).join('; ') +
  `; dance_flow=${flowId}`;
assert.equal(
  (await send('/api/admin/dance-funnel?includeTests=1', undefined, cookie))
    .status,
  403
);
await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(
  (
    await send(
      '/api/dance/events',
      {
        flowId,
        events: [
          event,
          {
            id: randomUUID(),
            event: 'dance_purchase_shown',
            locale: 'it',
            params: {},
          },
        ],
      },
      cookie
    )
  ).status,
  200
);
// Local read-only analytics role, no payment/config permissions.
const roleId = randomUUID();
await db().run(
  sql`INSERT INTO role(id,name,title,status) VALUES (${roleId},${'funnel-qa-' + roleId},'Local funnel QA','active')`
);
// RBAC permission codes need to be existing canonical values; link existing permissions.
await db().run(
  sql`INSERT INTO role_permission(id,role_id,permission_id) SELECT ${randomUUID()} || ':' || id,${roleId},id FROM permission WHERE code IN ('admin.access','admin.ai-tasks.read')`
);
await db().run(
  sql`INSERT INTO user_role(id,user_id,role_id) VALUES (${randomUUID()},${id},${roleId})`
);
const report = await send(
  `/api/admin/dance-funnel?includeTests=1&flowId=${flowId}`,
  undefined,
  cookie
);
assert.equal(report.status, 200);
const timeline = report.json.data.timeline;
assert.ok(timeline.some((row: any) => row.event === 'server_registered'));
assert.ok(timeline.some((row: any) => row.event === 'server_session_created'));
assert.equal(timeline.filter((row: any) => row.id === event.id).length, 1);
assert.equal(
  timeline.find((row: any) => row.event === 'server_session_created').source,
  'server'
);
assert.equal(
  (await send(`/api/admin/dance-funnel?flowId=${flowId}`, undefined, cookie))
    .json.data.timeline.length,
  0
);
mkdirSync('data/tests', { recursive: true });
writeFileSync(
  'data/tests/funnel-browser-account.json',
  JSON.stringify({ email, password, flowId })
);
console.log(
  'Local HTTP acceptance passed: origin, authorization, deduplication, registration/session stitching, audience filter.'
);
