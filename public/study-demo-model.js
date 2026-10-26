// Deliberately separate from real account records: no API, credentials or date override.
export const DEMO_NOTICE = '하루 모의 체험 · 실제 5일 사용 증거가 아닙니다.';
export function newDemo() { return { kind:'one-day-simulation', actual_five_day_use:false, entries:[], rule_change:null }; }
function time(now) { const stamp=new Date(now).toISOString(); return stamp; }
export function addDemoEntry(state,value,now=new Date()) {
  if(!Number.isInteger(value)||value<0||value>1440)throw new Error('0~1440 사이 정수 분을 입력하세요.');
  if(state.entries.length>=5)throw new Error('모의 체험 5구간을 완료했습니다.');
  if(state.entries.length===2&&!state.rule_change)throw new Error('두 구간을 근거로 규칙을 변경한 뒤 계속하세요.');
  const number=state.entries.length+1;
  return {...state,entries:[...state.entries,{id:`simulation-${number}`,segment:number,value,observed_at:time(now),synthetic:true}]};
}
export function changeDemoRule(state,after,reason,now=new Date()) {
  if(state.entries.length!==2||state.rule_change)throw new Error('규칙은 2구간 뒤, 3구간 전에 한 번 변경합니다.');
  if(typeof after!=='string'||!after.trim()||after.length>1000||typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new Error('새 규칙과 두 구간에 근거한 이유를 적어 주세요.');
  return {...state,rule_change:{after_rule:after.trim(),reason:reason.trim(),changed_at:time(now),source_ids:state.entries.map(e=>e.id),source_snapshots:state.entries.map(e=>({...e}))}};
}
export function demoSummary(state) {
  const group=rows=>({days:rows.length,sum:rows.reduce((s,e)=>s+e.value,0),mean:rows.length?Math.round((rows.reduce((s,e)=>s+e.value,0)/rows.length+Number.EPSILON)*10)/10:null});
  const total=group(state.entries),before=group(state.entries.slice(0,2)),after=group(state.entries.slice(2));
  return {total,before,after,complete:state.entries.length===5,mean_difference:state.entries.length===5?Math.round((after.sum/after.days-before.sum/before.days+Number.EPSILON)*10)/10:null};
}
