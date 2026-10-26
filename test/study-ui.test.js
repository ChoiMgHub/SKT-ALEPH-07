import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { makeEnv } from '../test-support/helpers.mjs';
import { studyAction } from '../src/study.js';
import worker from '../src/worker.js';
const cfg={question:'실제 복습 시간은 어떻게 달라지는가?',metric_name:'하루 복습 시간',initial_rule:'30분 한 번'};
async function screen(t,env) {
  const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url:'https://example.test/',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;w.Element.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  w.fetch=(path,options={})=>worker.fetch(new Request(new URL(path,w.location.href),{...options,headers:{...options.headers,cookie:env.TEST_COOKIE}}),env);
  const until=async fn=>{const end=Date.now()+5000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('study UI did not settle');};
  w.eval(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'));await until(()=>!d.querySelector('#diary-panel').hidden);
  return {w,d,until,submit:form=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))};
}
test('T07 study UI saves user-chosen configuration and today value, freezes first-day fields and clears on logout',async t=>{
  const env=makeEnv(),{w,d,until,submit}=await screen(t,env);
  const config=d.querySelector('#study-config-form');for(const [k,v] of Object.entries(cfg))config.elements.namedItem(k).value=v;
  submit(config);await until(()=>!d.querySelector('#study-config-view').hidden);
  assert.match(d.querySelector('#study-config-view').textContent,/하루 복습 시간/);
  const entry=d.querySelector('#study-entry-form');entry.elements.namedItem('value').value='7';submit(entry);
  await until(()=>d.querySelector('#study-records').textContent.includes('1일차'));
  assert.equal(config.hidden,true);assert.equal(entry.querySelector('button').disabled,true);
  assert.match(d.querySelector('#study-summary').textContent,/기록된 1일 합계7분/);
  assert.match(d.querySelector('#study-summary').textContent,/기록된 1일 평균7분/);
  d.querySelector('#logout').click();await until(()=>d.querySelector('#diary-panel').hidden);
  assert.equal(d.querySelector('#study-records').textContent,'');assert.equal(d.querySelector('#study-config-view').textContent,'');
});
test('T07 five-day UI shows hand-computed totals, before/after means and source record evidence',async t=>{
  const env=makeEnv(),action=(path,method,input,date)=>studyAction(env.DB,'fixture-user',path,method,input,new Date(date));
  await action('/api/study/config','POST',cfg,'2026-10-26T01:00:00Z');
  for(const [date,value] of [['26',20],['27',30]])await action('/api/study/entries','POST',{value},`2026-10-${date}T02:00:00Z`);
  await action('/api/study/rule-change','POST',{after_rule:'15분 두 번',reason:'두 기록에 근거한 자동 검증용 변경'},'2026-10-27T03:00:00Z');
  for(const [date,value] of [['28',30],['29',40],['30',50]])await action('/api/study/entries','POST',{value},`2026-10-${date}T02:00:00Z`);
  const {d,until}=await screen(t,env),summary=d.querySelector('#study-summary').textContent;
  for(const expected of ['기록된 5일 합계170분','기록된 5일 평균34분','변경 전 평균 (2/2일)25분','변경 후 평균 (3/3일)40분','5일 완료 뒤 평균 차이15분'])assert.ok(summary.includes(expected),expected);
  assert.equal(d.querySelectorAll('#study-records article').length,5);
  assert.match(d.querySelector('#study-change-view').textContent,/1일차:/);assert.match(d.querySelector('#study-change-view').textContent,/2일차:/);
  assert.equal(d.querySelector('#study-entry-form').hidden,true);
  d.querySelector('#logout').click();await until(()=>d.querySelector('#diary-panel').hidden);
  assert.equal(d.querySelector('#study-change-evidence').textContent,'');
  assert.equal(d.querySelector('#study-change-view').textContent,'');
});
