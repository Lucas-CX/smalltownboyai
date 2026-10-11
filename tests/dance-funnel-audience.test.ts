import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

import { funnelAudience } from '../src/modules/dance-funnel/service';

test('audience excludes entire test visits and active admins while preserving expired roles', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await client.executeMultiple(`
      CREATE TABLE dance_funnel_event(flow_id TEXT NOT NULL,user_id TEXT,diagnostic INTEGER,mode TEXT);
      CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT);
      CREATE TABLE user_role(user_id TEXT,role_id TEXT,expires_at INTEGER);
      CREATE TABLE role(id TEXT PRIMARY KEY,name TEXT);
      INSERT INTO user VALUES ('admin','owner@real.invalid'),('test','qa@example.test'),('expired','past@real.invalid');
      INSERT INTO role VALUES ('a','admin');
      INSERT INTO user_role VALUES ('admin','a',NULL),('expired','a',50);
      INSERT INTO dance_funnel_event VALUES
      ('real',NULL,0,'unknown'),('admin-visit',NULL,0,'unknown'),('admin-visit','admin',0,'stripe-live'),
      ('test-visit',NULL,0,'unknown'),('test-visit','test',0,'unknown'),
      ('diagnostic',NULL,1,'unknown'),('mock',NULL,0,'mock'),('test-payment',NULL,0,'stripe-test'),
      ('expired-admin','expired',0,'stripe-live');
    `);
    const dialect = new SQLiteSyncDialect();
    const query = (includeTests: boolean) =>
      dialect.sqlToQuery(
        sql`SELECT flow_id FROM dance_funnel_event WHERE ${funnelAudience(includeTests, 100)} ORDER BY flow_id`
      );
    const filtered = query(false);
    assert.deepEqual(
      (
        await client.execute({
          sql: filtered.sql,
          args: filtered.params as any[],
        })
      ).rows.map((r) => r.flow_id),
      ['expired-admin', 'real']
    );
    const all = query(true);
    assert.equal(
      (await client.execute({ sql: all.sql, args: all.params as any[] })).rows
        .length,
      9
    );
    const plan = await client.execute({
      sql: 'EXPLAIN QUERY PLAN ' + filtered.sql,
      args: filtered.params as any[],
    });
    assert.ok(
      !plan.rows.some((row) => String(row.detail).includes('CORRELATED')),
      'blacklist must not scan events once per outer row'
    );
  } finally {
    client.close();
  }
});
