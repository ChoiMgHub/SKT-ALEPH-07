import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv } from '../test-support/helpers.mjs';
import { verifyAuth } from '../scripts/verify-auth.mjs';

function options(env,broken=false) {
  return {
    baseUrl:'https://example.test',
    fetchImpl:async(url,init)=>{
      const response=await worker.fetch(new Request(url,init),env);
      // Simulate a server wrongly accepting a cross-account PATCH. The verifier must fail.
      if(broken&&init.method==='PATCH'&&new URL(url).pathname.startsWith('/api/tasks/')&&response.status===404) {
        return new Response(JSON.stringify({incorrectly_accepted:true}),{status:200,headers:{'content-type':'application/json'}});
      }
      return response;
    },
    readHashes:async usernames=>env.DB.raw.prepare('SELECT username,password_hash FROM users WHERE username IN (?,?) ORDER BY username').all(...usernames)
  };
}
test('HTTP verifier records paired access checks, redacts credentials and deletes only its temporary accounts',async()=>{
  const env=makeEnv();
  const before=env.DB.raw.prepare('SELECT * FROM users').all();
  const report=await verifyAuth(options(env));
  assert.equal(report.passed,true,JSON.stringify(report.errors));
  assert.equal(report.cleanup.length,2);assert.ok(report.checks.every(c=>c.pass));
  assert.ok(report.requests.some(r=>r.label.includes('→')&&r.response.status===404));
  assert.equal(report.password_storage.rows.length,2);
  for(const row of report.requests) {
    if(row.request.headers.cookie)assert.equal(row.request.headers.cookie,'[REDACTED]');
    for(const [key,value] of Object.entries(row.request.body||{}))if(/password/i.test(key))assert.equal(value,'[REDACTED]');
    if(row.response.set_cookie)assert.equal(row.response.set_cookie,'[REDACTED]');
  }
  assert.deepEqual(env.DB.raw.prepare('SELECT * FROM users').all(),before);
});
test('HTTP verifier fails on an accepted cross-account write and still cleans up its own accounts',async()=>{
  const env=makeEnv({anonymous:true});
  const report=await verifyAuth(options(env,true));
  assert.equal(report.passed,false);
  assert.ok(report.checks.some(c=>c.name.includes('수정 거부')&&!c.pass));
  assert.equal(report.cleanup.filter(c=>c.deleted).length,2);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
});
