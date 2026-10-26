import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import worker from '../src/worker.js';
import { makeEnv, call } from '../test-support/helpers.mjs';
const password = () => randomBytes(24).toString('base64url');
const cookieOf = result => result.headers.get('set-cookie').split(';')[0];
const as = (env,cookie,path,method='GET',data,headers={}) => call(env,path,method,data,{cookie,...headers});
async function account(env, username, pw=password()) {
  const created=await as(env,'','/api/auth/signup','POST',{username,password:pw});
  assert.equal(created.status,201);
  const logged=await as(env,'','/api/auth/login','POST',{username,password:pw});
  assert.equal(logged.status,200);
  return {username,pw,id:created.data.user.id,cookie:cookieOf(logged)};
}
async function records(env, user) {
  const plan=await as(env,user.cookie,'/api/plans','POST',{title:`${user.username}의 검증용 계획`,start_date:'2026-10-26',end_date:'2026-10-30',priority:'보통',success_criteria:'자동 검증',expected_minutes:30});
  assert.equal(plan.status,201);
  const task=await as(env,user.cookie,'/api/tasks','POST',{plan_id:plan.data.id,title:'자동 검증용 할 일',priority:'보통',category:'검증',expected_minutes:30,status:'todo'});
  assert.equal(task.status,201);
  return {plan:plan.data.id,task:task.data.id};
}
const collections = state => Object.fromEntries(['plans','plan_revisions','tasks','execution_logs','task_completions','reflections','reflection_links'].map(k=>[k,state[k]]));

test('T07 signup/login: normalized duplicate IDs, salted hashes and identical failed-login responses',async()=>{
  const env=makeEnv({anonymous:true}),pw=password();
  const a=await account(env,'tester_a',pw),b=await account(env,'tester_b',pw);
  const dup=await as(env,'','/api/auth/signup','POST',{username:'TESTER_A',password:password()});
  assert.equal(dup.status,409);
  const bad=await as(env,'','/api/auth/login','POST',{username:a.username,password:password()});
  const absent=await as(env,'','/api/auth/login','POST',{username:'absent_user',password:password()});
  assert.equal(bad.status,401);assert.equal(absent.status,401);assert.deepEqual(bad.data,absent.data);
  const hashes=env.DB.raw.prepare('SELECT password_hash FROM users ORDER BY username').all().map(x=>x.password_hash);
  assert.equal(hashes.length,2);assert.notEqual(hashes[0],hashes[1]);
  for(const hash of hashes) {assert.match(hash,/^pbkdf2-sha512\$100000\$/);assert.ok(!hash.includes(pw));}
  assert.match((await as(env,a.cookie,'/api/auth/me')).data.user.username,/tester_a/);
  const exported=JSON.stringify((await as(env,b.cookie,'/api/export')).data);
  assert.ok(!exported.includes(pw));assert.ok(!exported.includes(hashes[0]));assert.ok(!exported.includes(b.cookie.split('=')[1]));
});

test('T07 session: HttpOnly/Secure/SameSite, anonymous/private redirect, logout replay, exact expiration',async()=>{
  const env=makeEnv({anonymous:true}),a=await account(env,'session_user');
  const login=await as(env,'','/api/auth/login','POST',{username:a.username,password:a.pw});
  const set=login.headers.get('set-cookie');
  for(const flag of ['__Host-aleph_session=','HttpOnly','Secure','SameSite=Strict','Max-Age=86400']) assert.ok(set.includes(flag));
  for(const path of ['/api/state','/api/export','/api/auth/me','/api/imports']) assert.equal((await as(env,'',path)).status,401);
  const direct=await worker.fetch(new Request('https://example.test/diary'),env);
  assert.equal(direct.status,303);assert.equal(direct.headers.get('location'),'https://example.test/?login=required');
  assert.equal((await as(env,a.cookie,'/api/state')).status,200);
  assert.equal((await as(env,a.cookie,'/api/auth/logout','POST')).status,200);
  assert.equal((await as(env,a.cookie,'/api/state')).status,401);
  const current=cookieOf(login);
  env.DB.raw.prepare('UPDATE sessions SET expires_at=?').run(new Date().toISOString());
  assert.equal((await as(env,current,'/api/state')).status,401);
});

test('T07 authorization: both directions deny read/update/delete; victim counts and contents unchanged',async()=>{
  const env=makeEnv({anonymous:true}),a=await account(env,'owner_a'),b=await account(env,'owner_b');
  const ra=await records(env,a),rb=await records(env,b);
  for(const [attacker,victim,target] of [[a,b,rb],[b,a,ra]]) {
    const before=collections((await as(env,victim.cookie,'/api/state')).data);
    const attempts=[
      [`/api/tasks/${target.task}`,'GET',undefined],
      [`/api/tasks/${target.task}`,'PATCH',{title:'바뀌면 안 됨'}],
      [`/api/tasks/${target.task}`,'DELETE',undefined],
      [`/api/plans/${target.plan}`,'GET',undefined],
      [`/api/plans/${target.plan}`,'PATCH',{title:'바뀌면 안 됨'}],
      ['/api/tasks','POST',{plan_id:target.plan,title:'삽입 금지',priority:'보통',category:'검증',expected_minutes:0}],
      ['/api/logs','POST',{task_id:target.task,request_id:'attack',started_at:'2026-10-26T01:00:00Z',ended_at:'2026-10-26T01:10:00Z'}],
      [`/api/reflections/${target.plan}`,'PUT',{next_step:'금지'}]
    ];
    for(const [path,method,data] of attempts) assert.equal((await as(env,attacker.cookie,path,method,data)).status,404,`${method} ${path}`);
    const after=collections((await as(env,victim.cookie,'/api/state')).data);
    assert.deepEqual(after,before);
    const list=JSON.stringify((await as(env,attacker.cookie,`/api/state?user_id=${victim.id}`,'GET',undefined,{'x-user-id':victim.id})).data);
    assert.ok(!list.includes(target.plan));assert.ok(!list.includes(target.task));
  }
  const own=await as(env,a.cookie,`/api/tasks/${ra.task}`,'PATCH',{title:'본인 수정 허용',user_id:b.id});
  assert.equal(own.status,200);
  assert.equal((await as(env,b.cookie,`/api/tasks/${ra.task}`)).status,404);
  assert.equal((await as(env,a.cookie,`/api/tasks/${ra.task}`,'DELETE')).status,200);
});

test('T07 spoofed owners and execution request IDs cannot cross accounts',async()=>{
  const env=makeEnv({anonymous:true}),a=await account(env,'spoof_a'),b=await account(env,'spoof_b');
  const ra=await records(env,a),rb=await records(env,b);
  const input={request_id:'same-request-id',started_at:'2026-10-26T01:00:00Z',ended_at:'2026-10-26T01:05:00Z'};
  const la=await as(env,a.cookie,'/api/logs','POST',{...input,task_id:ra.task,user_id:b.id});
  const lb=await as(env,b.cookie,'/api/logs','POST',{...input,task_id:rb.task,user_id:a.id});
  assert.equal(la.status,201);assert.equal(lb.status,201);assert.notEqual(la.data.id,lb.data.id);
  assert.equal((await as(env,a.cookie,'/api/state')).data.execution_logs.length,1);
  assert.equal((await as(env,b.cookie,'/api/state')).data.execution_logs.length,1);
  const extra=await as(env,a.cookie,'/api/plans','POST',{title:'소유자 위조 시험',start_date:'2026-10-26',end_date:'2026-10-26',priority:'보통',success_criteria:'검증',expected_minutes:0,user_id:b.id,owner_id:b.id});
  assert.equal(extra.status,201);
  assert.equal(env.DB.raw.prepare('SELECT user_id FROM plan_owners WHERE plan_id=?').get(extra.data.id).user_id,a.id);
});

test('T07 password change invalidates all prior sessions and accepts only the new password',async()=>{
  const env=makeEnv({anonymous:true}),a=await account(env,'password_user');
  const second=await as(env,'','/api/auth/login','POST',{username:a.username,password:a.pw});
  const pw=password();
  const changed=await as(env,a.cookie,'/api/auth/password','POST',{current_password:a.pw,new_password:pw});
  assert.equal(changed.status,200);
  for(const c of [a.cookie,cookieOf(second)]) assert.equal((await as(env,c,'/api/state')).status,401);
  assert.equal((await as(env,'','/api/auth/login','POST',{username:a.username,password:a.pw})).status,401);
  assert.equal((await as(env,'','/api/auth/login','POST',{username:a.username,password:pw})).status,200);
});

test('T07 CSRF and missing server configuration fail closed',async()=>{
  const env=makeEnv({anonymous:true});
  assert.equal((await as(env,'','/api/auth/signup','POST',{username:'csrf_user',password:password()},{origin:'https://evil.test'})).status,403);
  assert.equal((await as(env,'','/api/auth/signup','POST',{username:'csrf_user',password:password()},{'x-requested-with':''})).status,403);
  delete env.AUTH_PEPPER;
  assert.equal((await as(env,'','/api/auth/signup','POST',{username:'csrf_user',password:password()})).status,503);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM users').get().n,0);
});

test('T07 backup import is atomic, deduplicated, account-scoped and preserves source evidence',async()=>{
  const source=makeEnv(),sourceRecords=await records(source,{username:'source',cookie:source.TEST_COOKIE});
  await call(source,'/api/logs','POST',{task_id:sourceRecords.task,request_id:'original-request',started_at:'2026-10-22T01:00:00Z',ended_at:'2026-10-22T01:15:00Z',difference_reason:'자동 검증'});
  const backup=(await call(source,'/api/export')).data;
  const env=makeEnv({anonymous:true}),a=await account(env,'import_a'),b=await account(env,'import_b');
  const first=await as(env,a.cookie,'/api/import','POST',backup);assert.equal(first.status,201);assert.equal(first.data.duplicate,false);
  const again=await as(env,a.cookie,'/api/import','POST',backup);assert.equal(again.data.duplicate,true);
  const exported=(await as(env,a.cookie,'/api/export')).data;
  assert.equal(exported.plans.length,1);assert.equal(exported.execution_logs[0].actual_minutes,15);
  assert.equal(exported.plans[0].title,backup.plans[0].title);assert.notEqual(exported.plans[0].id,backup.plans[0].id);
  assert.deepEqual(JSON.parse(exported.imports[0].source_json),backup);
  assert.equal(JSON.parse(exported.imports[0].mappings_json).plans[backup.plans[0].id],exported.plans[0].id);
  assert.equal((await as(env,b.cookie,'/api/state')).data.plans.length,0);
  const broken=structuredClone(backup);broken.tasks[0].plan_id='not-in-backup';
  assert.equal((await as(env,b.cookie,'/api/import','POST',broken)).status,400);
  assert.equal((await as(env,b.cookie,'/api/state')).data.plans.length,0);
  assert.equal((await as(env,b.cookie,'/api/imports')).data.length,0);
});

test('T07 deleting an account removes its records and sessions while preserving another account',async()=>{
  const env=makeEnv({anonymous:true}),a=await account(env,'delete_a'),b=await account(env,'delete_b');
  const ra=await records(env,a);await records(env,b);
  await as(env,a.cookie,'/api/logs','POST',{task_id:ra.task,request_id:'delete-log',started_at:'2026-10-26T01:00:00Z',ended_at:'2026-10-26T01:01:00Z'});
  await as(env,a.cookie,`/api/tasks/${ra.task}`,'PATCH',{status:'done'});
  await as(env,a.cookie,`/api/reflections/${ra.plan}`,'PUT',{next_step:'회고 삭제 검증'});
  const before=collections((await as(env,b.cookie,'/api/state')).data);
  assert.equal((await as(env,a.cookie,'/api/auth/account','DELETE',{confirm_username:a.username})).status,200);
  assert.equal((await as(env,a.cookie,'/api/state')).status,401);
  assert.equal(env.DB.raw.prepare('SELECT * FROM users WHERE id=?').get(a.id),undefined);
  assert.equal(env.DB.raw.prepare('SELECT * FROM plans WHERE id=?').get(ra.plan),undefined);
  assert.equal(env.DB.raw.prepare('SELECT * FROM tasks WHERE id=?').get(ra.task),undefined);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM execution_logs').get().n,0);
  assert.deepEqual(collections((await as(env,b.cookie,'/api/state')).data),before);
});

test('T07 old unowned records are never assigned to the first signup; migrations are repeatable',async()=>{
  const env=makeEnv({anonymous:true});
  env.DB.raw.prepare('INSERT INTO plans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('legacy','미할당 자료','2026-10-22','2026-10-22','보통','검증',0,'2026-10-22T00:00:00Z','2026-10-22T00:00:00Z');
  const migration=readFileSync(new URL('../schema-auth.sql',import.meta.url),'utf8');env.DB.raw.exec(migration);env.DB.raw.exec(migration);
  const a=await account(env,'first_user');
  assert.equal((await as(env,a.cookie,'/api/state')).data.plans.length,0);
  assert.equal((await as(env,a.cookie,'/api/plans/legacy')).status,404);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM plans').get().n,1);
});

test('T07 UI shows login first and erases private rendered records on logout',async t=>{
  const env=makeEnv({anonymous:true});let browserCookie='';
  const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url:'https://example.test/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window,d=w.document;
  w.Element.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.fetch=async(path,options={})=>{
    const result=await worker.fetch(new Request(new URL(path,w.location.href),{...options,headers:{...options.headers,cookie:browserCookie}}),env);
    const value=result.headers.get('set-cookie');if(value) browserCookie=value.split(';')[0];
    return result;
  };
  const until=async predicate=>{for(let n=0;n<250;n++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}assert.fail('UI did not settle');};
  const submit=form=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  w.eval(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'));
  await until(()=>!d.querySelector('#auth-panel').hidden);
  assert.equal(d.querySelector('#diary-panel').hidden,true);
  const pw=password(),signup=d.querySelector('#signup-form');
  signup.elements.namedItem('username').value='ui_user';signup.elements.namedItem('password').value=pw;submit(signup);
  await until(()=>d.querySelector('#message').textContent.includes('가입했습니다'));
  const login=d.querySelector('#login-form');login.elements.namedItem('username').value='ui_user';login.elements.namedItem('password').value=pw;submit(login);
  await until(()=>!d.querySelector('#diary-panel').hidden);
  const user=(await as(env,browserCookie,'/api/auth/me')).data.user;await records(env,{...user,cookie:browserCookie});
  // Reloading the authenticated view obtains only this account's records.
  w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));
  await until(()=>!d.querySelector('#diary-panel').hidden&&d.querySelectorAll('#plan-list article').length===1);
  const old=browserCookie;d.querySelector('#logout').click();
  await until(()=>d.querySelector('#diary-panel').hidden&&d.querySelector('#message').textContent.includes('로그아웃'));
  assert.equal(d.querySelectorAll('#plan-list article').length,0);
  assert.equal((await as(env,old,'/api/state')).status,401);
});
