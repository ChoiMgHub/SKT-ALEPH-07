import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, call } from '../test-support/helpers.mjs';
import { studyAction, studySnapshot, studySummary, seoulDate } from '../src/study.js';

const config={question:'계획 방식을 바꾸면 실제 복습 시간은 어떻게 달라지는가?',metric_name:'하루 실제 복습 시간',initial_rule:'30분을 한 번에 복습한다.'};
const day=n=>new Date(`2026-10-${25+n}T10:00:00Z`);
async function setup(env) {return studyAction(env.DB,'fixture-user','/api/study/config','POST',config,day(1));}
async function entry(env,value,n){return studyAction(env.DB,'fixture-user','/api/study/entries','POST',{value},day(n));}
const change=(env,now=new Date('2026-10-27T11:00:00Z'))=>studyAction(env.DB,'fixture-user','/api/study/rule-change','POST',{after_rule:'15분씩 두 번 나누어 복습한다.',reason:'1·2일차의 실제 기록을 보고 나누어 진행하기로 정했다.'},now);

test('T07 five-day records use Seoul dates, reject invalid values/backdating and preserve one record per actual date',async()=>{
  const env=makeEnv();await setup(env);
  assert.equal(seoulDate(new Date('2026-10-26T15:00:00Z')),'2026-10-27');
  for(const value of ['',null,-1,1.2,1441,'30']) await assert.rejects(()=>entry(env,value,1),e=>e.status===400);
  await assert.rejects(()=>studyAction(env.DB,'fixture-user','/api/study/entries','POST',{value:30,record_date:'2026-10-20'},day(1)),e=>e.status===400);
  const first=await entry(env,0,1);assert.equal(first.status,201);
  const duplicate=await entry(env,0,1);assert.equal(duplicate.status,200);assert.equal(duplicate.data.duplicate,true);
  await assert.rejects(()=>entry(env,30,1),e=>e.status===409);
  await assert.rejects(()=>studyAction(env.DB,'fixture-user','/api/study/entries','POST',{value:30},new Date('2026-10-25T01:00:00Z')),e=>e.status===409);
  const snap=await studySnapshot(env.DB,'fixture-user',day(1));assert.equal(snap.entries.length,1);assert.equal(snap.summary.total.mean,0);
  await assert.rejects(()=>studyAction(env.DB,'fixture-user','/api/study/config','PATCH',{...config,question:'다른 질문'},day(1)),e=>e.status===409);
});

test('T07 rule change is gated between day 2 and day 3, preserves exact source IDs and immutable snapshots',async()=>{
  const env=makeEnv();await setup(env);
  await assert.rejects(()=>change(env),e=>e.status===409);
  await entry(env,20,1);await entry(env,30,2);
  await assert.rejects(()=>entry(env,40,3),e=>e.status===409);
  await assert.rejects(()=>change(env,day(2)),e=>e.status===409);
  const result=await change(env),s=result.data;
  assert.equal(result.status,201);assert.equal(s.rule_change.day1_entry_id,s.entries[0].id);assert.equal(s.rule_change.day2_entry_id,s.entries[1].id);
  assert.deepEqual(JSON.parse(s.rule_change.day1_snapshot_json),{...s.entries[0]});
  assert.deepEqual(JSON.parse(s.rule_change.day2_snapshot_json),{...s.entries[1]});
  assert.ok(s.rule_change.changed_at>s.entries[1].recorded_at);
  await entry(env,40,3);await assert.rejects(()=>change(env,day(3)),e=>e.status===409);
});

test('T07 exactly five distinct dates, same metric/calculation, hand-computed totals/means and export/delete isolation',async()=>{
  const env=makeEnv();await setup(env);await entry(env,20,1);await entry(env,30,2);await change(env);
  for(const n of [3,4,5])await entry(env,n*10,n);
  const s=await studySnapshot(env.DB,'fixture-user',day(5));
  assert.deepEqual(s.summary,{total:{days:5,sum:170,mean:34},before:{days:2,sum:50,mean:25},after:{days:3,sum:120,mean:40},complete:true,mean_difference:15});
  await assert.rejects(()=>entry(env,60,6),e=>e.status===409);
  const exported=(await call(env,'/api/export')).data;
  assert.equal(exported.study.entries.length,5);assert.equal(exported.study.rule_change.day2_entry_id,s.entries[1].id);
  env.DB.raw.prepare('INSERT INTO users VALUES (?,?,?,?)').run('other','other_user','not-used','2026-10-26T00:00:00Z');
  const other=await studySnapshot(env.DB,'other',day(5));assert.equal(other.study,null);assert.equal(other.entries.length,0);
  const denied=await call(env,'/api/study','GET',undefined,{cookie:''});assert.equal(denied.status,401);
  env.DB.raw.exec(readFileSync(new URL('../schema-study.sql',import.meta.url),'utf8'));
  assert.equal((await studySnapshot(env.DB,'fixture-user',day(5))).entries.length,5);
  assert.equal((await call(env,'/api/auth/account','DELETE',{confirm_username:'fixture_user'})).status,200);
  for(const table of ['studies','study_entries','study_rule_changes'])assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,0);
  assert.ok(env.DB.raw.prepare('SELECT id FROM users WHERE id=?').get('other'));
});

test('T07 empty/missing-day arithmetic and same-day concurrent retries follow the stated policy',async()=>{
  assert.deepEqual(studySummary([]).total,{days:0,sum:0,mean:null});
  const env=makeEnv();await setup(env);
  const results=await Promise.all([entry(env,31,1),entry(env,31,1)]);
  assert.equal(results.filter(x=>x.status===201).length,1);assert.equal(results.filter(x=>x.status===200).length,1);
  // Skipped dates are not fabricated as zeros. A later real date becomes the next numbered day.
  await entry(env,32,3);
  const s=await studySnapshot(env.DB,'fixture-user',day(3));assert.equal(s.entries.length,2);assert.equal(s.summary.total.mean,31.5);
  assert.ok(s.rules.missing.includes('제외'));assert.equal(s.rules.week_start,'월요일');
  env.DB.raw.prepare('INSERT INTO users VALUES (?,?,?,?)').run('other','other_study','not-used','2026-10-26T00:00:00Z');
  await studyAction(env.DB,'other','/api/study/config','POST',{...config,question:'다른 계정의 비공개 질문'},day(1));
  const forged=await call(env,'/api/study?user_id=other','GET',undefined,{'x-user-id':'other'});
  assert.equal(forged.status,200);assert.equal(forged.data.study.question,config.question);
  assert.ok(!JSON.stringify(forged.data).includes('다른 계정의 비공개 질문'));
});
