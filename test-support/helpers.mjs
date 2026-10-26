import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { randomBytes, createHash } from 'node:crypto';

class D1Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new D1Statement(this.db, this.sql, params); }
  run() { const result = this.db.prepare(this.sql).run(...this.params); return { meta: { changes: result.changes } }; }
  first() { return this.db.prepare(this.sql).get(...this.params) || null; }
  all() { return { results: this.db.prepare(this.sql).all(...this.params) }; }
}
export function makeEnv({ anonymous = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../schema-auth.sql', import.meta.url), 'utf8'));
  const token = randomBytes(32).toString('hex');
  if (!anonymous) {
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run('fixture-user', 'fixture_user', 'fixture-not-a-password', new Date().toISOString());
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), 'fixture-user', new Date().toISOString(), new Date(Date.now()+86400000).toISOString());
  }
  return {
    AUTH_PEPPER: randomBytes(32).toString('hex'),
    TEST_COOKIE: anonymous ? '' : `__Host-aleph_session=${token}`,
    DB: {
      raw: db,
      prepare(sql) { return new D1Statement(db, sql); },
      async batch(items) {
        db.exec('BEGIN');
        try { const results = items.map(item => item.run()); db.exec('COMMIT'); return results; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      }
    },
    ASSETS: { fetch: () => new Response('index') }
  };
}
export async function call(env, path, method = 'GET', data, extraHeaders = {}) {
  const request = new Request(`https://example.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-requested-with':'aleph-diary', cookie:env.TEST_COOKIE, ...extraHeaders },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const result = await worker.fetch(request, env);
  return { status: result.status, headers:result.headers, data: await result.json() };
}

