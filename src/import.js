import { HttpError, digest, boundedText } from './auth.js';

// A backup is always imported under the authenticated account. Old IDs are mapped to new UUIDs;
// the immutable original JSON is retained as evidence, and can be exported with the account.
export async function importBackup(request, db, userId) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError('JSON 파일이 필요합니다.');
  const text = await boundedText(request, 2 * 1024 * 1024);
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw new HttpError('가져오기 파일은 2MB 이하여야 합니다.');
  const data = JSON.parse(text);
  const names = ['plans', 'plan_revisions', 'tasks', 'execution_logs', 'reflections', 'task_completions', 'reflection_links'];
  if (!data || data.schema_version !== 'pds-schema-v2' || names.some(k => !Array.isArray(data[k]))) {
    throw new HttpError('과제 6 JSON 내보내기 파일인지 확인해 주세요.');
  }
  const counts = Object.fromEntries(names.map(k => [k, data[k].length]));
  if (Object.values(counts).reduce((a,b) => a+b, 0) > 500) throw new HttpError('한 번에 가져올 수 있는 기록은 합계 500건입니다.');
  const fingerprint = await digest(text);
  const existing = await db.prepare('SELECT id, counts_json FROM imports WHERE user_id=? AND source_digest=?').bind(userId, fingerprint).first();
  if (existing) return { id: existing.id, duplicate: true, counts: JSON.parse(existing.counts_json) };
  const bad = () => { throw new HttpError('백업의 값 또는 연결 관계를 확인해 주세요. 전체 가져오기를 취소했습니다.'); };
  const string = (value, max=1000) => typeof value === 'string' && value.length <= max;
  const date = value => string(value,10) && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const time = value => string(value,40) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && date(value.slice(0,10)) && +value.slice(11,13)<24 && +value.slice(14,16)<60 && +value.slice(17,19)<60 && !Number.isNaN(Date.parse(value));
  const minutes = value => Number.isInteger(value) && value>=0 && value<=1000000;
  const priority = value => ['낮음','보통','높음'].includes(value);
  const status = value => ['todo','doing','done','blocked'].includes(value);
  function mapIds(rows, key) {
    const map = new Map();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !string(row[key],80) || !row[key] || map.has(row[key])) bad();
      map.set(row[key], crypto.randomUUID());
    }
    return map;
  }
  const plans = mapIds(data.plans,'id'), tasks = mapIds(data.tasks,'id');
  const revisions = mapIds(data.plan_revisions,'id'), logs = mapIds(data.execution_logs,'id');
  const statements = [], now = new Date().toISOString();
  for (const p of data.plans) {
    if (!string(p.title,120)||!p.title.trim()||!date(p.start_date)||!date(p.end_date)||p.end_date<p.start_date||!priority(p.priority)||!string(p.success_criteria)||!p.success_criteria.trim()||!minutes(p.expected_minutes)||!time(p.created_at)||!time(p.updated_at)) bad();
    statements.push(db.prepare('INSERT INTO plans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(plans.get(p.id),p.title,p.start_date,p.end_date,p.priority,p.success_criteria,p.expected_minutes,p.created_at,p.updated_at));
    statements.push(db.prepare('INSERT INTO plan_owners VALUES (?, ?)').bind(plans.get(p.id),userId));
  }
  for (const r of data.plan_revisions) {
    if (!plans.has(r.plan_id)||!string(r.snapshot_json,20000)||!time(r.recorded_at)) bad();
    let snapshot; try { snapshot = JSON.parse(r.snapshot_json); } catch { bad(); }
    if (!snapshot || snapshot.id!==r.plan_id || !string(snapshot.title,120) || !date(snapshot.start_date) || !date(snapshot.end_date) || snapshot.end_date<snapshot.start_date || !priority(snapshot.priority) || !minutes(snapshot.expected_minutes) || !string(snapshot.success_criteria)) bad();
    statements.push(db.prepare('INSERT INTO plan_revisions VALUES (?, ?, ?, ?)').bind(revisions.get(r.id),plans.get(r.plan_id),JSON.stringify({...snapshot,id:plans.get(r.plan_id)}),r.recorded_at));
  }
  for (const t of data.tasks) {
    if (!plans.has(t.plan_id)||!string(t.title,160)||!t.title.trim()||!(t.due_at===null||time(t.due_at))||!priority(t.priority)||!string(t.category,50)||!t.category.trim()||!minutes(t.expected_minutes)||!status(t.status)||!string(t.blocked_reason,500)||(t.status==='blocked'&&!t.blocked_reason.trim())||!(t.deleted_at===null||time(t.deleted_at))||!time(t.created_at)||!time(t.updated_at)) bad();
    statements.push(db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(tasks.get(t.id),plans.get(t.plan_id),t.title,t.due_at,t.priority,t.category,t.expected_minutes,t.status,t.blocked_reason,t.deleted_at,t.created_at,t.updated_at));
  }
  const requestIds = new Set();
  for (const l of data.execution_logs) {
    if (!tasks.has(l.task_id)||!string(l.request_id,80)||!l.request_id||requestIds.has(l.request_id)||!time(l.started_at)||!time(l.ended_at)||Date.parse(l.ended_at)<Date.parse(l.started_at)||l.actual_minutes!==Math.round((Date.parse(l.ended_at)-Date.parse(l.started_at))/60000)||!string(l.difference_reason,500)||!time(l.created_at)) bad();
    requestIds.add(l.request_id);
    statements.push(db.prepare('INSERT INTO execution_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(logs.get(l.id),`${userId}:${crypto.randomUUID()}`,tasks.get(l.task_id),l.started_at,l.ended_at,l.actual_minutes,l.difference_reason,l.created_at));
  }
  const reflectionPlans=new Set(), completionTasks=new Set(), targetPlans=new Set();
  for (const r of data.reflections) {
    if (!plans.has(r.plan_id)||reflectionPlans.has(r.plan_id)||!string(r.next_step,500)||!time(r.updated_at)) bad();
    reflectionPlans.add(r.plan_id);
    statements.push(db.prepare('INSERT INTO reflections VALUES (?, ?, ?)').bind(plans.get(r.plan_id),r.next_step,r.updated_at));
  }
  for (const c of data.task_completions) {
    if (!tasks.has(c.task_id)||completionTasks.has(c.task_id)||!time(c.completed_at)||!['existing_status','status_transition'].includes(c.source)) bad();
    completionTasks.add(c.task_id);
    statements.push(db.prepare('INSERT INTO task_completions VALUES (?, ?, ?)').bind(tasks.get(c.task_id),c.completed_at,c.source));
  }
  for (const l of data.reflection_links) {
    if (!plans.has(l.target_plan_id)||!plans.has(l.source_plan_id)||targetPlans.has(l.target_plan_id)||!string(l.carried_text,500)||!time(l.created_at)) bad();
    targetPlans.add(l.target_plan_id);
    statements.push(db.prepare('INSERT INTO reflection_links VALUES (?, ?, ?, ?)').bind(plans.get(l.target_plan_id),plans.get(l.source_plan_id),l.carried_text,l.created_at));
  }
  const id=crypto.randomUUID();
  const mappings = {plans:Object.fromEntries(plans),tasks:Object.fromEntries(tasks),plan_revisions:Object.fromEntries(revisions),execution_logs:Object.fromEntries(logs)};
  statements.push(db.prepare('INSERT INTO imports VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id,userId,fingerprint,JSON.stringify(counts),text,JSON.stringify(mappings),now));
  try { await db.batch(statements); }
  catch (error) {
    const race = await db.prepare('SELECT id, counts_json FROM imports WHERE user_id=? AND source_digest=?').bind(userId,fingerprint).first();
    if (race) return {id:race.id,duplicate:true,counts:JSON.parse(race.counts_json)};
    throw error;
  }
  return { id, duplicate:false, counts };
}
