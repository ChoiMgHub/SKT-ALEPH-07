import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { newDemo, addDemoEntry, changeDemoRule, demoSummary } from '../public/study-demo-model.js';
import { studySummary } from '../src/study.js';
test('one-day simulation keeps actual timestamps, separate labels, evidence snapshots and production arithmetic',()=>{
  const now=new Date('2026-10-26T08:00:00Z');let s=newDemo();
  for(const v of [20,30])s=addDemoEntry(s,v,now);
  const original=s;s=changeDemoRule(s,'두 번 나누기','앞선 두 합성값을 비교한다.',now);
  for(const v of [30,40,50])s=addDemoEntry(s,v,now);
  assert.equal(s.actual_five_day_use,false);assert.ok(s.entries.every(e=>e.synthetic&&e.observed_at===now.toISOString()&&!('record_date' in e)));
  assert.deepEqual(s.rule_change.source_snapshots,original.entries);assert.notEqual(s.rule_change.source_snapshots[0],original.entries[0]);
  assert.deepEqual(demoSummary(s),studySummary(s.entries.map((e,i)=>({...e,record_date:`2026-10-${26+i}`}))));
  assert.deepEqual(demoSummary(s).total,{days:5,sum:170,mean:34});
});
test('one-day simulation refuses invalid values, a third step before change and a sixth step',()=>{
  let s=newDemo();for(const v of [-1,1.5,NaN,'30',null,1441])assert.throws(()=>addDemoEntry(s,v));
  assert.throws(()=>changeDemoRule(s,'r','reason'));
  s=addDemoEntry(addDemoEntry(s,0),31);assert.equal(demoSummary(s).total.mean,15.5);
  assert.throws(()=>addDemoEntry(s,30));assert.throws(()=>changeDemoRule(s,'','reason'));
  s=changeDemoRule(s,'r','reason');assert.throws(()=>changeDemoRule(s,'r2','reason'));
  for(const n of [1,2,3])s=addDemoEntry(s,n);assert.throws(()=>addDemoEntry(s,4));
});
test('public one-day UI completes without any account API and renders input as text',t=>{
  const dom=new JSDOM(readFileSync(new URL('../public/one-day-demo.html',import.meta.url),'utf8'),{url:'https://example.test/one-day-demo.html',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;w.fetch=()=>assert.fail('simulation must never access account APIs');
  w.eval(readFileSync(new URL('../public/study-demo-model.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\n'+readFileSync(new URL('../public/study-demo.js',import.meta.url),'utf8').replace(/^import .*;\n/,''));
  const submit=(form)=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));const entry=d.querySelector('#demo-entry');
  for(const v of [20,30]){entry.elements.namedItem('value').value=String(v);submit(entry);}
  assert.equal(entry.querySelector('button').disabled,true);
  const change=d.querySelector('#demo-change');change.elements.namedItem('after_rule').value='<img src=x onerror=alert(1)>';change.elements.namedItem('reason').value='두 합성 기록에 근거';submit(change);
  assert.equal(d.querySelector('#demo-rule img'),null);
  for(const v of [30,40,50]){entry.elements.namedItem('value').value=String(v);submit(entry);}
  assert.ok(d.querySelector('#demo-status').textContent.includes('실제 5일 사용 증거가 아닙니다.'));assert.ok(d.querySelector('#demo-status').textContent.includes('5/5구간 완료'));
  assert.ok(d.querySelector('#demo-summary').textContent.includes('170분'));assert.equal(entry.hidden,true);
  d.querySelector('#demo-reset').click();assert.ok(d.querySelector('#demo-status').textContent.includes('0/5구간'));assert.equal(d.querySelector('#demo-rule').hidden,true);
});
