import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('published evidence identifies its isolated environment and includes paired requests, stored hashes and redaction',()=>{
  const report=JSON.parse(readFileSync(new URL('../public/verification.json',import.meta.url),'utf8'));
  assert.equal(report.passed,true);assert.equal(report.evidence_environment.production_deployment,false);assert.equal(report.checks.length,49);
  assert.equal(report.cleanup.filter(c=>c.deleted&&c.old_session_rejected).length,2);
  const hashes=report.password_storage.rows.map(r=>r.password_hash);assert.equal(hashes.length,2);
  for(const h of hashes)assert.equal(h,'[REDACTED: private evidence only]');
  assert.equal(report.password_storage.pass,true);assert.equal(report.password_storage.same_test_password,true);
  assert.ok(!JSON.stringify(report).match(/verify_[a-z0-9_]+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i));
  const before=report.requests.find(r=>r.label==='로그아웃 전 같은 쿠키 조회'),after=report.requests.find(r=>r.label==='로그아웃 뒤 원래 쿠키 재전송');
  assert.equal(before.url,after.url);assert.equal(before.method,after.method);assert.equal(before.response.status,200);assert.equal(after.response.status,401);
  for(const row of report.requests){
    if(row.request.headers.cookie)assert.equal(row.request.headers.cookie,'[REDACTED]');
    if(row.response.set_cookie)assert.equal(row.response.set_cookie,'[REDACTED]');
    for(const [k,v] of Object.entries(row.request.body||{}))if(/password/i.test(k))assert.equal(v,'[REDACTED]');
  }
  assert.equal(report.checks.filter(c=>/행 수와 내용 불변/.test(c.name)&&c.pass).length,2);
});
