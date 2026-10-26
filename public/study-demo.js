import { newDemo, addDemoEntry, changeDemoRule, demoSummary, DEMO_NOTICE } from './study-demo-model.js';
let demo=newDemo();
const el=id=>document.getElementById(id);
const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
const minutes=value=>value===null?'아직 없음':`${value}분`;
function renderDemo() {
  const n=demo.entries.length,s=demoSummary(demo);
  el('demo-status').textContent=`${DEMO_NOTICE} 모의 체험 ${n}/5구간${n===5?' 완료':''}`;
  el('demo-entry').hidden=n===5;
  el('demo-entry').querySelector('button').disabled=n===2&&!demo.rule_change;
  el('demo-change').hidden=n!==2||Boolean(demo.rule_change);
  el('demo-evidence').textContent=demo.entries.slice(0,2).map(e=>`${e.id}: ${e.value}분`).join(' / ');
  el('demo-summary').replaceChildren(...[['모의 합계',s.total.sum],['모의 전체 평균',s.total.mean],['변경 전 평균',s.before.mean],['변경 후 평균',s.after.mean],['5구간 뒤 평균 차이',s.mean_difference]].map(([title,value])=>{const card=node('div','');card.className='panel';card.append(node('p',title),node('h3',minutes(value)));return card;}));
  el('demo-records').replaceChildren(node('h2','합성 시험 기록'));
  for(const e of demo.entries)el('demo-records').append(node('p',`${e.id} · ${e.segment}구간 · ${e.value}분 · 실제 조작 시각 ${e.observed_at}`));
  const change=demo.rule_change;el('demo-rule').hidden=!change;el('demo-rule').replaceChildren();
  if(change)el('demo-rule').append(node('h2','모의 규칙 변경'),node('p',change.after_rule),node('p',change.reason),node('p',`근거 ${change.source_ids.join(', ')} · 실제 변경 시각 ${change.changed_at}`));
}
el('demo-entry').addEventListener('submit',event=>{event.preventDefault();try{demo=addDemoEntry(demo,event.currentTarget.elements.namedItem('value').valueAsNumber);el('demo-message').textContent='합성 구간을 추가했습니다.';renderDemo();}catch(error){el('demo-message').textContent=error.message;}});
el('demo-change').addEventListener('submit',event=>{event.preventDefault();try{const form=event.currentTarget;demo=changeDemoRule(demo,form.elements.namedItem('after_rule').value,form.elements.namedItem('reason').value);el('demo-message').textContent='두 구간의 사본과 모의 규칙 변경을 저장했습니다.';renderDemo();}catch(error){el('demo-message').textContent=error.message;}});
el('demo-export').addEventListener('click',()=>{const data={...demo,notice:DEMO_NOTICE,exported_at:new Date().toISOString(),summary:demoSummary(demo)};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a','');a.href=url;a.download='one-day-simulation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
el('demo-reset').addEventListener('click',()=>{demo=newDemo();el('demo-entry').reset();el('demo-change').reset();el('demo-message').textContent='모의 체험을 초기화했습니다.';renderDemo();});
renderDemo();
