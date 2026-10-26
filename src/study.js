import { HttpError } from './auth.js';

export const STUDY_RULES = {
  timezone:'Asia/Seoul',unit:'분',week_start:'월요일',
  missing:'기록하지 않은 날짜는 저장하지 않고 합계·평균에서 제외합니다. 임의로 0분으로 채우지 않으며, 직접 0분을 저장한 날은 포함합니다.',
  duplicates:'같은 날짜에 같은 값을 다시 보내면 기존 기록을 반환합니다. 다른 값의 중복 입력은 거부합니다.',
  invalid:'실제로 측정한 0~1440 사이 정수 분만 허용합니다. 빈칸·음수·소수·숫자가 아닌 값은 거부합니다.',
  rounding:'합계는 정수 분의 합입니다. 평균은 합계÷기록 일수, 소수 둘째 자리에서 반올림해 소수 첫째 자리까지 표시합니다.',
  calculation:'변경 전은 1·2일차, 변경 후는 3·4·5일차입니다. 같은 지표·분 단위·계산 규칙을 유지합니다. 평균 차이는 5일 완료 후 변경 후 평균−변경 전 평균을 반올림합니다.',
  dates:'날짜와 저장 시각은 서버가 정합니다. 서울 기준 서로 다른 실제 날짜 5일만 저장하며 이전 날짜로 입력할 수 없습니다. 연속 5일을 강제하지 않습니다.',
  measurement:'실제 시작·종료 시간을 확인해 측정한 활동 구간을 가장 가까운 정수 분으로 기록하세요. 하루에 여러 구간이면 각 구간을 반올림해 합산하고 같은 구간을 중복해서 더하지 마세요.'
};
export function seoulDate(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(k=>parts.find(x=>x.type===k).value).join('-');
}
const rounded=value=>Math.round((value+Number.EPSILON)*10)/10;
export function studySummary(entries) {
  const sorted=[...entries].sort((a,b)=>a.record_date.localeCompare(b.record_date));
  const group=rows=>({days:rows.length,sum:rows.reduce((n,r)=>n+r.value,0),mean:rows.length?rounded(rows.reduce((n,r)=>n+r.value,0)/rows.length):null});
  const total=group(sorted),before=group(sorted.slice(0,2)),after=group(sorted.slice(2));
  return {total,before,after,complete:sorted.length===5,mean_difference:sorted.length===5?rounded(after.sum/after.days-before.sum/before.days):null};
}
export async function studySnapshot(db,userId,now=new Date()) {
  const study=await db.prepare('SELECT id,question,metric_name,unit,initial_rule,created_at FROM studies WHERE user_id=?').bind(userId).first();
  let entries=[],change=null;
  if(study) {
    entries=(await db.prepare('SELECT id,study_id,record_date,value,recorded_at FROM study_entries WHERE study_id=? ORDER BY record_date,id').bind(study.id).all()).results;
    change=await db.prepare('SELECT * FROM study_rule_changes WHERE study_id=?').bind(study.id).first();
  }
  return {study,entries,rule_change:change,rules:STUDY_RULES,today:seoulDate(now),summary:studySummary(entries)};
}
const text=(value,max)=>typeof value==='string'&&value.trim().length<=max?value.trim():'';
export async function studyAction(db,userId,path,method,input={},now=new Date()) {
  const snapshot=await studySnapshot(db,userId,now),stamp=now.toISOString(),today=seoulDate(now);
  if(path==='/api/study'&&method==='GET')return {data:snapshot,status:200};
  if(path==='/api/study/config'&&(method==='POST'||method==='PATCH')) {
    const question=text(input.question,500),metric=text(input.metric_name,100),rule=text(input.initial_rule,1000);
    if(!question||!metric||!rule)throw new HttpError('질문·관찰할 시간 지표·처음 계획 규칙을 모두 적어 주세요.');
    if(input.unit!==undefined&&input.unit!=='분')throw new HttpError('이 기록의 단위는 분으로 고정합니다.');
    if(method==='POST') {
      if(snapshot.study)throw new HttpError('이미 5일 기록 설정이 있습니다.',409);
      try {await db.prepare('INSERT INTO studies VALUES (?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),userId,question,metric,'분',rule,stamp).run();}
      catch(error) {if(await db.prepare('SELECT id FROM studies WHERE user_id=?').bind(userId).first())throw new HttpError('이미 5일 기록 설정이 있습니다.',409);throw error;}
      return {data:await studySnapshot(db,userId,now),status:201};
    }
    if(!snapshot.study)throw new HttpError('먼저 5일 기록 설정을 저장해 주세요.',404);
    const updated=await db.prepare('UPDATE studies SET question=?,metric_name=?,initial_rule=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM study_entries WHERE study_id=?)')
      .bind(question,metric,rule,snapshot.study.id,snapshot.study.id).run();
    if(!updated.meta?.changes)throw new HttpError('1일차 기록 후에는 질문·지표·최초 규칙을 바꿀 수 없습니다.',409);
    return {data:await studySnapshot(db,userId,now),status:200};
  }
  if(!snapshot.study)throw new HttpError('먼저 5일 기록 설정을 저장해 주세요.',409);
  const id=snapshot.study.id;
  if(path==='/api/study/entries'&&method==='POST') {
    if(['record_date','recorded_at','date'].some(k=>k in input))throw new HttpError('기록 날짜와 시각은 서버가 정합니다.');
    if(!Number.isInteger(input.value)||input.value<0||input.value>1440)throw new HttpError('실제 측정한 시간을 0~1440 사이 정수 분으로 입력해 주세요.');
    const existing=snapshot.entries.find(e=>e.record_date===today);
    if(existing) {
      if(existing.value!==input.value)throw new HttpError('오늘은 이미 다른 값이 저장됐습니다. 중복으로 바꾸지 않습니다.',409);
      return {data:{...snapshot,duplicate:true},status:200};
    }
    if(snapshot.entries.length>=5)throw new HttpError('서로 다른 날짜 5일의 기록을 완료했습니다.',409);
    if(snapshot.entries.at(-1)?.record_date>=today)throw new HttpError('이전 날짜로 기록할 수 없습니다.',409);
    if(snapshot.entries.length===2&&!snapshot.rule_change)throw new HttpError('2일차 뒤의 계획 규칙 변경을 먼저 저장한 다음 3일차를 기록해 주세요.',409);
    if(snapshot.rule_change&&stamp<=snapshot.rule_change.changed_at)throw new HttpError('규칙 변경을 저장한 이후에 기록해 주세요.',409);
    const added=await db.prepare(`INSERT INTO study_entries SELECT ?,id,?,?,? FROM studies WHERE id=? AND user_id=?
      AND (SELECT COUNT(*) FROM study_entries WHERE study_id=?)<5
      AND NOT EXISTS(SELECT 1 FROM study_entries WHERE study_id=? AND record_date>=?)
      AND ((SELECT COUNT(*) FROM study_entries WHERE study_id=?)<2 OR EXISTS(SELECT 1 FROM study_rule_changes WHERE study_id=?))`)
      .bind(crypto.randomUUID(),today,input.value,stamp,id,userId,id,id,today,id,id).run();
    if(!added.meta?.changes) {
      const latest=await studySnapshot(db,userId,now),same=latest.entries.find(e=>e.record_date===today);
      if(same?.value===input.value)return {data:{...latest,duplicate:true},status:200};
      throw new HttpError('기록 상태가 바뀌었습니다. 새로고침 후 확인해 주세요.',409);
    }
    return {data:await studySnapshot(db,userId,now),status:201};
  }
  if(path==='/api/study/rule-change'&&method==='POST') {
    if(snapshot.entries.length!==2||snapshot.rule_change)throw new HttpError('규칙은 2일차 기록 뒤, 3일차 기록 전에 한 번 변경합니다.',409);
    const after=text(input.after_rule,1000),reason=text(input.reason,1000);
    if(!after||!reason||after===snapshot.study.initial_rule)throw new HttpError('기존과 다른 새 규칙과 1·2일차를 근거로 한 이유를 적어 주세요.');
    const [day1,day2]=snapshot.entries;
    if(stamp<=day2.recorded_at)throw new HttpError('2일차 기록 이후에 변경해 주세요.',409);
    const changed=await db.prepare(`INSERT INTO study_rule_changes SELECT ?,id,?,?,?,?,?,?,?,? FROM studies WHERE id=? AND user_id=?
      AND (SELECT COUNT(*) FROM study_entries WHERE study_id=?)=2
      AND NOT EXISTS(SELECT 1 FROM study_rule_changes WHERE study_id=?)`)
      .bind(crypto.randomUUID(),snapshot.study.initial_rule,after,reason,day1.id,day2.id,JSON.stringify(day1),JSON.stringify(day2),stamp,id,userId,id,id).run();
    if(!changed.meta?.changes)throw new HttpError('변경 상태가 바뀌었습니다. 새로고침 후 확인해 주세요.',409);
    return {data:await studySnapshot(db,userId,now),status:201};
  }
  throw new HttpError('요청한 기능을 찾을 수 없습니다.',404);
}
