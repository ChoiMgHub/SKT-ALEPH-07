const $ = id => document.getElementById(id);
const planForm = $('plan-form'), taskForm = $('task-form'), logForm = $('log-form'), reflectionForm = $('reflection-form');
let state = { plans: [], plan_revisions: [], tasks: [], execution_logs: [], reflections: [], task_completions: [], reflection_links: [], summary: {}, summaries: {} };
let selectedPlanId = null;
let reviewPlanId = null;
let newPlanMode = false;
let evidenceKind = null;
let pendingLogRequestId = null;
let sessionUser = null;
let sessionExpiryTimer = null;
let studyState = null;

function node(tag, className = '', content = '') {
  const result = document.createElement(tag);
  if (className) result.className = className;
  result.textContent = content;
  return result;
}
function add(parent, ...children) { parent.append(...children); return parent; }
function formValue(form, key) { return form.elements.namedItem(key).value; }
function setFormValue(form, key, value) { form.elements.namedItem(key).value = value ?? ''; }
function minutesText(n) { const value = Number(n || 0); return value >= 60 ? `${Math.floor(value / 60)}시간 ${value % 60}분` : `${value}분`; }
function differenceText(n) { const value = Number(n || 0); return `${value > 0 ? '+' : value < 0 ? '−' : ''}${minutesText(Math.abs(value))}`; }
function dateText(value) { return value ? new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '마감 없음'; }
function dateOnlyText(value) { return value || '날짜 없음'; }
function localInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function show(message, error = false) {
  const box = $('message'); box.textContent = message; box.classList.toggle('error', error); box.hidden = false;
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-requested-with': 'aleph-diary', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) clearSessionView();
    throw new Error(data.error || `요청 실패 (${response.status})`);
  }
  return data;
}
async function refresh() {
  state = await api('/api/state');
  if (!state.plans.some(p => p.id === selectedPlanId)) selectedPlanId = state.plans[0]?.id || null;
  if (!state.plans.some(p => p.id === reviewPlanId)) reviewPlanId = selectedPlanId;
  renderAll();
}
async function run(action, success) {
  try { await action(); await refresh(); show(success); }
  catch (error) { show(error.message || '요청을 처리하지 못했습니다.', true); }
}
function empty(container, text) { container.replaceChildren(node('p', 'muted', text)); }
function badge(text, className = '') { return node('span', `badge ${className}`, text); }
function planName(id) { return state.plans.find(p => p.id === id)?.title || '삭제된 계획'; }
function taskName(id) { return state.tasks.find(t => t.id === id)?.title || '삭제된 할 일'; }
function activeTasks() { return state.tasks.filter(t => !t.deleted_at); }
function isOverdue(task) { return task.status !== 'done' && task.due_at && Date.parse(task.due_at) < Date.parse(state.evaluated_at); }
function reviewTasks() { return activeTasks().filter(t => t.plan_id === reviewPlanId); }
function recordLink(label, id) {
  const link = node('a', 'record-link', label); link.href = `#${id}`;
  link.addEventListener('click', event => {
    event.preventDefault();
    if (id.startsWith('task-')) { $('task-search').value = ''; $('task-filter').value = 'all'; renderTasks(); }
    const target = $(id);
    if (target) { target.scrollIntoView({ block: 'center' }); target.focus(); }
  });
  return link;
}
function statusText(status) { return { todo: '할 일', doing: '진행 중', done: '완료', blocked: '막힘' }[status] || status; }
function button(text, className, handler) { const b = node('button', className, text); b.type = 'button'; b.addEventListener('click', handler); return b; }

function fillPlan(plan) {
  setFormValue(planForm, 'id', plan?.id);
  setFormValue(planForm, 'source_reflection_plan_id', '');
  $('source-reflection-note').hidden = true;
  setFormValue(planForm, 'title', plan?.title);
  setFormValue(planForm, 'start_date', plan?.start_date || localInput(new Date().toISOString()).slice(0, 10));
  setFormValue(planForm, 'end_date', plan?.end_date || localInput(new Date().toISOString()).slice(0, 10));
  setFormValue(planForm, 'priority', plan?.priority || '보통');
  setFormValue(planForm, 'success_criteria', plan?.success_criteria);
  setFormValue(planForm, 'expected_minutes', plan?.expected_minutes ?? 120);
}
function renderPlans() {
  const list = $('plan-list'); list.replaceChildren();
  if (!state.plans.length) empty(list, '아직 계획이 없습니다. 첫 계획을 저장해 주세요.');
  for (const plan of state.plans) {
    const card = node('article', 'item');
    card.id = `plan-${plan.id}`; card.tabIndex = -1;
    const top = node('div', 'item-top');
    add(top, node('strong', '', plan.title), badge(plan.priority));
    add(card, top, node('p', '', `${dateOnlyText(plan.start_date)} ~ ${dateOnlyText(plan.end_date)} · 예상 ${minutesText(plan.expected_minutes)}`),
      node('p', '', `성공 기준: ${plan.success_criteria}`));
    const source = state.reflection_links.find(x => x.target_plan_id === plan.id);
    if (source) add(card, node('p', '', `이전 돌아보기에서 가져온 한 줄: ${source.carried_text}`),
      recordLink(`이전 계획: ${planName(source.source_plan_id)}`, `plan-${source.source_plan_id}`));
    const actions = node('div', 'actions');
    add(actions, button(plan.id === selectedPlanId ? '선택됨' : '선택·수정', 'tiny', () => { selectedPlanId = plan.id; newPlanMode = false; renderAll(); $('plans').scrollIntoView(); }));
    card.append(actions); list.append(card);
  }
  const revisions = $('revision-list'); revisions.replaceChildren();
  const rows = state.plan_revisions.filter(r => r.plan_id === selectedPlanId);
  if (!rows.length) empty(revisions, '선택한 계획의 수정 전 내용은 아직 없습니다.');
  for (const revision of rows) {
    let old; try { old = JSON.parse(revision.snapshot_json); } catch { continue; }
    const card = node('article', 'item');
    add(card, node('strong', '', old.title), node('p', '', `${old.start_date} ~ ${old.end_date} · ${old.priority} · 예상 ${minutesText(old.expected_minutes)}`),
      node('p', '', `성공 기준: ${old.success_criteria}`), node('p', 'muted', `수정 전 저장: ${dateText(revision.recorded_at)}`));
    revisions.append(card);
  }
  if (!newPlanMode) fillPlan(state.plans.find(p => p.id === selectedPlanId));
}

function option(value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }
function renderSelects() {
  const planSelect = $('task-plan'), reflectionSelect = $('reflection-plan'), logSelect = $('log-task');
  const oldTaskPlan = planSelect.value, oldReflection = reflectionSelect.value, oldLog = logSelect.value;
  planSelect.replaceChildren(...state.plans.map(p => option(p.id, p.title)));
  reflectionSelect.replaceChildren(...state.plans.map(p => option(p.id, p.title)));
  planSelect.value = state.plans.some(p => p.id === oldTaskPlan) ? oldTaskPlan : selectedPlanId || '';
  reflectionSelect.value = state.plans.some(p => p.id === oldReflection) ? oldReflection : selectedPlanId || '';
  logSelect.replaceChildren(...activeTasks().map(t => option(t.id, `${t.title} · ${planName(t.plan_id)}`)));
  if (activeTasks().some(t => t.id === oldLog)) logSelect.value = oldLog;
  $('review-plan').replaceChildren(...state.plans.map(p => option(p.id, p.title)));
  $('review-plan').value = reviewPlanId || '';
}
function resetTaskForm() {
  taskForm.reset(); setFormValue(taskForm, 'id', '');
  setFormValue(taskForm, 'expected_minutes', 30);
  setFormValue(taskForm, 'category', '과제');
  setFormValue(taskForm, 'plan_id', selectedPlanId);
  $('task-form-title').textContent = '할 일 추가';
}
function editTask(task) {
  setFormValue(taskForm, 'id', task.id); setFormValue(taskForm, 'plan_id', task.plan_id);
  setFormValue(taskForm, 'title', task.title); setFormValue(taskForm, 'due_at', localInput(task.due_at));
  setFormValue(taskForm, 'priority', task.priority); setFormValue(taskForm, 'category', task.category);
  setFormValue(taskForm, 'expected_minutes', task.expected_minutes); setFormValue(taskForm, 'status', task.status);
  setFormValue(taskForm, 'blocked_reason', task.blocked_reason);
  $('task-form-title').textContent = '할 일 수정';
  $('task-form').scrollIntoView();
}
function filteredTasks() {
  const search = $('task-search').value.trim().toLocaleLowerCase();
  const filter = $('task-filter').value;
  const sort = $('task-sort').value;
  const priorities = { 높음: 0, 보통: 1, 낮음: 2 };
  const rows = activeTasks().filter(t =>
    (!search || `${t.title} ${t.category}`.toLocaleLowerCase().includes(search)) &&
    (filter === 'all' || (filter === 'overdue' ? isOverdue(t) : t.status === filter))
  );
  rows.sort((a, b) => {
    const due = () => (a.due_at || '9999').localeCompare(b.due_at || '9999');
    const name = () => a.title.localeCompare(b.title, 'ko');
    const id = () => a.id.localeCompare(b.id);
    if (sort === 'priority') return priorities[a.priority] - priorities[b.priority] || due() || name() || id();
    if (sort === 'created') return b.created_at.localeCompare(a.created_at) || name() || id();
    if (sort === 'title') return name() || id();
    return due() || name() || id();
  });
  return rows;
}
function renderTasks() {
  const list = $('task-list'); list.replaceChildren();
  const rows = filteredTasks();
  $('task-result-label').textContent = `정렬: ${$('task-sort').selectedOptions[0].textContent} · 결과 ${rows.length}개`;
  $('task-sort-rule').textContent = {
    due: '동률: 이름순 → ID순. 마감이 없으면 마지막에 표시합니다.',
    priority: '높음 → 보통 → 낮음. 동률: 마감 빠른 순 → 이름순 → ID순.',
    created: '동률: 이름순 → ID순.', title: '한글 이름순. 동률: ID순.'
  }[$('task-sort').value];
  if (!rows.length) empty(list, '조건에 맞는 할 일이 없습니다.');
  for (const task of rows) {
    const card = node('article', 'item'); card.id = `task-${task.id}`;
    card.tabIndex = -1;
    const top = node('div', 'item-top'); add(top, node('strong', '', task.title), badge(statusText(task.status), task.status));
    const badges = node('div', 'meta');
    add(badges, badge(task.category), badge(task.priority), badge(`예상 ${minutesText(task.expected_minutes)}`));
    if (isOverdue(task)) badges.append(badge('지연', 'overdue'));
    add(card, top, badges, node('p', '', `${planName(task.plan_id)} · ${dateText(task.due_at)}`));
    if (task.blocked_reason) card.append(node('p', '', `막힌 이유: ${task.blocked_reason}`));
    const actions = node('div', 'actions');
    add(actions, button('수정', 'tiny', () => editTask(task)));
    if (task.status !== 'done') actions.append(button('완료', 'tiny', event => changeStatus(task, 'done', event.currentTarget)));
    if (task.status === 'done') actions.append(button('진행 중으로', 'tiny', event => changeStatus(task, 'doing', event.currentTarget)));
    actions.append(button('기록 연결', 'tiny', () => { $('log-task').value = task.id; $('execution').scrollIntoView(); }));
    actions.append(button('삭제', 'tiny danger', async () => {
      if (!confirm(`“${task.title}” 할 일을 삭제할까요? 기록은 내보내기에 남습니다.`)) return;
      await run(() => api(`/api/tasks/${task.id}`, { method: 'DELETE' }), '할 일을 삭제했습니다.');
    }));
    card.append(actions); list.append(card);
  }
}
async function changeStatus(task, status, btn) {
  btn.disabled = true;
  await run(() => api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    status === 'done' ? '완료로 바꿨습니다.' : '진행 중으로 되돌렸습니다.');
}
function renderLogs() {
  const list = $('log-list'); list.replaceChildren();
  if (!state.execution_logs.length) empty(list, '아직 실행 기록이 없습니다.');
  for (const log of state.execution_logs) {
    const card = node('article', 'item'); card.id = `log-${log.id}`;
    card.tabIndex = -1;
    add(card, node('strong', '', taskName(log.task_id)), node('p', '', `${dateText(log.started_at)} → ${dateText(log.ended_at)}`));
    const meta = node('div', 'meta'); meta.append(badge(`실제 ${minutesText(log.actual_minutes)}`)); card.append(meta);
    if (log.difference_reason) card.append(node('p', '', `달랐던 이유: ${log.difference_reason}`));
    list.append(card);
  }
  const completions = $('completion-list'); completions.replaceChildren();
  if (!state.task_completions.length) empty(completions, '아직 완료 이력이 없습니다.');
  for (const completion of state.task_completions) {
    const card = node('article', 'item');
    add(card, node('strong', '', taskName(completion.task_id)), node('p', '', dateText(completion.completed_at)),
      node('p', 'muted', completion.source === 'existing_status' ? '기존 완료 상태와 마지막 수정 시각에서 복원한 이력' : '최초 완료 처리 이력'));
    if (activeTasks().some(t => t.id === completion.task_id)) card.append(recordLink('할 일 원본 보기', `task-${completion.task_id}`));
    completions.append(card);
  }
}
function evidenceRows(kind) {
  const active = reviewTasks();
  const taskRow = (t, text) => ({ text, target: `task-${t.id}` });
  if (kind === 'plans') return state.plans.filter(p => p.id === reviewPlanId).map(p => ({text:p.title, target:`plan-${p.id}`}));
  if (kind === 'open_tasks') return active.map(t => taskRow(t, `${t.title} · ${statusText(t.status)}`));
  if (kind === 'completed') return active.filter(t => t.status === 'done').map(t => taskRow(t, t.title));
  if (kind === 'overdue') return active.filter(isOverdue).map(t => taskRow(t, `${t.title} · 마감 ${dateText(t.due_at)}`));
  if (kind === 'blocked') return active.filter(t => t.blocked_reason.trim()).map(t => taskRow(t, `${t.title} · ${t.blocked_reason}`));
  const estimates = active.map(t => taskRow(t, `${t.title} · 예상 ${minutesText(t.expected_minutes)}`));
  const actuals = state.execution_logs.filter(l => active.some(t => t.id === l.task_id))
    .map(l => ({text:`${taskName(l.task_id)} · 실제 ${minutesText(l.actual_minutes)} · ${dateText(l.started_at)} → ${dateText(l.ended_at)}`, target:`log-${l.id}`}));
  if (kind === 'expected_minutes') return estimates;
  if (kind === 'actual_minutes') return actuals;
  if (kind === 'difference_minutes') return [...estimates, ...actuals];
  return [];
}
function renderEvidence() {
  const root = $('evidence'); root.replaceChildren();
  root.append(node('h3', '', evidenceKind ? `숫자의 근거 · ${evidenceKind.label}` : '숫자의 근거'));
  if (!evidenceKind) { root.append(node('p', 'muted', '위 숫자를 눌러 근거 기록을 확인하세요.')); return; }
  const rows = evidenceRows(evidenceKind.key);
  if (!rows.length) { root.append(node('p', 'muted', '해당하는 기록이 없습니다.')); return; }
  const list = node('div', 'list');
  rows.forEach(row => { const item = node('div', 'item'); item.append(recordLink(row.text, row.target)); list.append(item); });
  root.append(list);
}
function renderSummary() {
  const root = $('summary'); root.replaceChildren();
  $('review-evaluated-at').textContent = `집계 기준 시각: ${dateText(state.evaluated_at)} · 새로고침하면 다시 판정합니다.`;
  const summary = state.summaries[reviewPlanId] || {};
  const items = [
    ['plans', '계획 묶음', `${summary.plans || 0}개`],
    ['open_tasks', '계획 수(할 일)', `${summary.open_tasks || 0}개`],
    ['completed', '완료', `${summary.completed || 0}개`],
    ['overdue', '지연', `${summary.overdue || 0}개`],
    ['blocked', '막힘', `${summary.blocked || 0}개`],
    ['expected_minutes', '할 일 예상 시간', minutesText(summary.expected_minutes)],
    ['actual_minutes', '실행한 시간', minutesText(summary.actual_minutes)],
    ['difference_minutes', '차이(실제 − 예상)', differenceText(summary.difference_minutes)]
  ];
  for (const [key, label, value] of items) {
    const b = node('button', 'stat'); b.type = 'button';
    add(b, node('span', '', label), node('strong', '', value));
    b.addEventListener('click', () => { evidenceKind = { key, label }; renderEvidence(); $('evidence').scrollIntoView(); $('evidence').focus(); });
    root.append(b);
  }
  renderEvidence();
}
function renderReflections() {
  const list = $('reflection-list'); list.replaceChildren();
  if (!state.reflections.length) { empty(list, '아직 다음 계획을 위한 한 줄이 없습니다.'); return; }
  for (const r of state.reflections) {
    const card = node('article', 'item');
    add(card, node('strong', '', planName(r.plan_id)), node('p', '', r.next_step || '아직 정하지 않았습니다.'));
    const links = state.reflection_links.filter(x => x.source_plan_id === r.plan_id);
    for (const link of links) card.append(recordLink(`이어진 다음 계획: ${planName(link.target_plan_id)}`, `plan-${link.target_plan_id}`));
    if (r.next_step.trim()) card.append(button('이 한 줄로 다음 계획 작성', 'tiny', () => {
      newPlanMode = true; fillPlan(null);
      setFormValue(planForm, 'source_reflection_plan_id', r.plan_id);
      setFormValue(planForm, 'success_criteria', r.next_step);
      $('source-reflection-note').textContent = `“${planName(r.plan_id)}”의 돌아보기를 가져왔습니다. 다음 계획의 이름·기간·예상 시간을 직접 정한 뒤 저장하세요.`;
      $('source-reflection-note').hidden = false;
      $('plans').scrollIntoView(); planForm.elements.namedItem('title').focus();
    }));
    list.append(card);
  }
}
function renderAll() { renderSelects(); renderPlans(); renderTasks(); renderLogs(); renderSummary(); renderReflections(); }

$('new-plan').addEventListener('click', () => { newPlanMode = true; fillPlan(null); planForm.elements.namedItem('title').focus(); });
$('cancel-task').addEventListener('click', resetTaskForm);
for (const id of ['task-search', 'task-filter', 'task-sort']) $(id).addEventListener(id === 'task-search' ? 'input' : 'change', renderTasks);
$('review-plan').addEventListener('change', () => { reviewPlanId = $('review-plan').value; renderSummary(); });

planForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = formValue(planForm, 'id');
  const data = Object.fromEntries(new FormData(planForm)); delete data.id;
  data.expected_minutes = Number(data.expected_minutes);
  await run(async () => {
    const result = await api(id ? `/api/plans/${id}` : '/api/plans', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    selectedPlanId = result.id; reviewPlanId = result.id; newPlanMode = false;
  }, id ? '계획을 저장했습니다. 이전 값은 이력에서 확인할 수 있습니다.' : '계획을 만들었습니다.');
});
taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = formValue(taskForm, 'id');
  const data = Object.fromEntries(new FormData(taskForm)); delete data.id;
  data.expected_minutes = Number(data.expected_minutes);
  data.due_at = data.due_at ? new Date(data.due_at).toISOString() : null;
  await run(() => api(id ? `/api/tasks/${id}` : '/api/tasks', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }),
    id ? '할 일을 수정했습니다.' : '할 일을 만들었습니다.');
  if (!$('message').classList.contains('error')) resetTaskForm();
});
logForm.addEventListener('input', () => { pendingLogRequestId = null; });
logForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(logForm));
  if (new Date(data.ended_at) < new Date(data.started_at)) { show('종료 시각은 시작 시각보다 빠를 수 없습니다.', true); return; }
  if (!pendingLogRequestId) pendingLogRequestId = crypto.randomUUID();
  data.request_id = pendingLogRequestId;
  data.started_at = new Date(data.started_at).toISOString();
  data.ended_at = new Date(data.ended_at).toISOString();
  const submit = logForm.querySelector('button[type="submit"]'); submit.disabled = true;
  try {
    await api('/api/logs', { method: 'POST', body: JSON.stringify(data) });
    pendingLogRequestId = null; logForm.reset(); await refresh(); show('실행 기록을 남겼습니다.');
  } catch (error) { show(error.message || '기록 저장에 실패했습니다.', true); }
  finally { submit.disabled = false; }
});
reflectionForm.addEventListener('submit', async event => {
  event.preventDefault();
  const planId = formValue(reflectionForm, 'plan_id');
  await run(() => api(`/api/reflections/${planId}`, { method: 'PUT', body: JSON.stringify({ next_step: formValue(reflectionForm, 'next_step') }) }),
    '다음 계획을 위한 한 줄을 저장했습니다.');
});

bootstrapSession();


function clearSessionView() {
  clearTimeout(sessionExpiryTimer); sessionExpiryTimer = null;
  sessionUser = null;
  studyState = null;
  for (const id of ['study-config-view','study-change-view','study-summary','study-records','study-rules','study-status']) $(id).replaceChildren();
  $('study-change-evidence').textContent = '';
  $('study-today').textContent = '';
  $('study-value-label').textContent = '실제로 측정한 시간(분)';
  $('source-reflection-note').textContent = '';
  $('study-config-form').hidden = false;
  $('study-config-view').hidden = true;
  $('study-entry-form').hidden = true;
  $('study-change-form').hidden = true;
  $('study-change-view').hidden = true;
  state = { plans: [], plan_revisions: [], tasks: [], execution_logs: [], reflections: [], task_completions: [], reflection_links: [], summary: {}, summaries: {} };
  selectedPlanId = null; reviewPlanId = null; newPlanMode = false; evidenceKind = null; pendingLogRequestId = null;
  $('diary-panel').hidden = true; $('auth-panel').hidden = false;
  $('account-name').textContent = ''; $('session-expiry').textContent = '';
  $('import-history').replaceChildren();
  for (const form of document.querySelectorAll('form')) form.reset();
  renderAll();
}
async function activateSession(data) {
  clearSessionView();
  sessionUser = data.user;
  $('account-name').textContent = `${data.user.username} 님의 다이어리`;
  $('session-expiry').textContent = `로그인 만료: ${dateText(data.expires_at)} (로그인부터 24시간)`;
  await refresh();
  const history = await api('/api/imports');
  $('import-history').replaceChildren(...history.map(row => node('p', 'hint', `가져오기 ${dateText(row.imported_at)} · ${row.counts_json}`)));
  await refreshStudy();
  $('auth-panel').hidden = true; $('diary-panel').hidden = false;
  const remaining = Date.parse(data.expires_at) - Date.now();
  if (remaining <= 0) { clearSessionView(); show('로그인이 만료됐습니다. 다시 로그인해 주세요.'); return; }
  sessionExpiryTimer = setTimeout(() => { clearSessionView(); show('로그인이 만료됐습니다. 다시 로그인해 주세요.'); }, remaining);
}
async function bootstrapSession() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) { clearSessionView(); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '인증 서버를 확인해 주세요.');
    await activateSession(data);
  } catch (error) { clearSessionView(); show(error.message, true); }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, submit = form.querySelector('button'); submit.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
    form.reset(); await activateSession(result); show('로그인했습니다. 본인 계정의 자료만 표시합니다.');
  } catch (error) { form.elements.namedItem('password').value = ''; show(error.message, true); }
  finally { submit.disabled = false; }
});
$('signup-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, submit = form.querySelector('button'); submit.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    const result = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) });
    form.reset(); $('login-form').elements.namedItem('username').value = result.user.username;
    show('가입했습니다. 위 로그인 폼에서 로그인해 주세요.');
    $('login-form').elements.namedItem('password').focus();
  } catch (error) { form.elements.namedItem('password').value = ''; show(error.message, true); }
  finally { submit.disabled = false; }
});
$('logout').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method:'POST' }); clearSessionView(); show('로그아웃했습니다.'); }
  catch (error) { show(error.message,true); }
});
$('password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api('/api/auth/password', {method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});
    clearSessionView(); show('비밀번호가 변경됐습니다. 모든 기기에서 다시 로그인해 주세요.');
  } catch (error) { show(error.message,true); }
  finally { form.reset(); }
});
$('delete-account-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!confirm('계정과 연결된 모든 자료를 삭제합니다. 필요한 JSON을 먼저 내보냈나요? 삭제를 계속할까요?')) return;
  try {
    await api('/api/auth/account', {method:'DELETE',body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});
    clearSessionView(); show('계정과 연결된 자료를 삭제했습니다.');
  } catch (error) { show(error.message,true); }
});
$('import-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = $('import-file').files[0];
  if (!file) return;
  if (file.size>2*1024*1024) {show('파일은 2MB 이하여야 합니다.',true);return;}
  const submit = event.currentTarget.querySelector('button'); submit.disabled = true;
  try {
    const text = await file.text(); JSON.parse(text);
    const result = await api('/api/import', {method:'POST',body:text});
    await bootstrapSession();
    show(result.duplicate ? '이미 가져온 파일입니다. 자료를 중복 생성하지 않았습니다.' : `내 계정으로 가져왔습니다. 계획 ${result.counts.plans}건 · 할 일 ${result.counts.tasks}건 · 실행 기록 ${result.counts.execution_logs}건`);
    $('import-form').reset();
  } catch (error) { show(error instanceof SyntaxError ? 'JSON 파일을 읽을 수 없습니다.' : error.message,true); }
  finally { submit.disabled = false; }
});
window.addEventListener('pageshow', event => { if(event.persisted) { clearSessionView(); bootstrapSession(); } });

function studyDateTime(value) { return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'medium'}); }
async function refreshStudy() {
  studyState = await api('/api/study');
  renderStudy();
}
function renderStudy() {
  const s=studyState;if(!s)return;
  const configured=Boolean(s.study),count=s.entries.length,today=s.entries.find(e=>e.record_date===s.today);
  const config=$('study-config-form');config.hidden=configured&&count>0;
  if(configured&&count===0)for(const key of ['question','metric_name','initial_rule'])setFormValue(config,key,s.study[key]);
  const view=$('study-config-view');view.replaceChildren();view.hidden=!configured;
  if(configured)add(view,node('h3','',s.study.question),node('p','',`관찰 지표: ${s.study.metric_name} · 단위: ${s.study.unit}`),node('p','',`최초 계획 규칙: ${s.study.initial_rule}`));
  $('study-status').textContent=!configured?'먼저 질문·시간 지표·계획 규칙을 직접 정해 저장하세요.':count===5?'서로 다른 날짜 5일 기록을 완료했습니다.':count===2&&!s.rule_change?'2일차까지 기록했습니다. 규칙 변경을 저장한 뒤 3일차를 기록하세요.':today?`오늘(${s.today}, 서울) 기록 완료 · 전체 ${count}/5일`:`오늘은 ${s.today}(서울)입니다. 실제 활동 뒤 ${count+1}일차를 기록하세요. 현재 ${count}/5일`;
  const entry=$('study-entry-form');entry.hidden=!configured||count===5;
  $('study-today').textContent=`서버 기준 서울 날짜: ${s.today} · 날짜는 직접 바꾸지 않습니다.`;
  $('study-value-label').textContent=configured?`${s.study.metric_name}(분)`:'실제로 측정한 시간(분)';
  entry.querySelector('button').disabled=Boolean(today)||(count===2&&!s.rule_change);
  if(today)setFormValue(entry,'value',today.value);
  const change=$('study-change-form');change.hidden=count!==2||Boolean(s.rule_change);
  if(count>=2)$('study-change-evidence').textContent=`1일차 ${s.entries[0].record_date}: ${s.entries[0].value}분, 2일차 ${s.entries[1].record_date}: ${s.entries[1].value}분. 저장 시 이 두 기록의 번호와 내용을 함께 보존합니다.`;
  const changeView=$('study-change-view');changeView.replaceChildren();changeView.hidden=!s.rule_change;
  if(s.rule_change) {
    const c=s.rule_change;
    add(changeView,node('h3','','저장된 계획 규칙 변경'),node('p','',`변경 전: ${c.before_rule}`),node('p','',`변경 후: ${c.after_rule}`),node('p','',`이유: ${c.reason}`),node('p','hint',`변경 시각: ${studyDateTime(c.changed_at)} (서울)`));
    const detail=node('details');add(detail,node('summary','','변경 근거 기록 번호'),node('p','hint',`1일차: ${c.day1_entry_id}`),node('p','hint',`2일차: ${c.day2_entry_id}`));changeView.append(detail);
  }
  const summary=$('study-summary');summary.replaceChildren();
  if(configured) {
    const value=n=>n===null?'아직 없음':`${n}분`;
    for(const [label,n] of [[`기록된 ${count}일 합계`,s.summary.total.sum],[`기록된 ${count}일 평균`,s.summary.total.mean],[`변경 전 평균 (${s.summary.before.days}/2일)`,s.summary.before.mean],[`변경 후 평균 (${s.summary.after.days}/3일)`,s.summary.after.mean],['5일 완료 뒤 평균 차이',s.summary.mean_difference]]) {
      const card=node('div','stat');add(card,node('span','',label),node('strong','',value(n)));summary.append(card);
    }
  }
  const records=$('study-records');records.replaceChildren(node('h3','','실제 날짜별 기록'));
  if(!count)records.append(node('p','hint','아직 실제 날짜 기록이 없습니다. 예시 숫자로 채우지 않습니다.'));
  for(const [i,e] of s.entries.entries()) {
    const card=node('article','item');card.id=`study-day-${e.id}`;
    add(card,node('strong','',`${i+1}일차 · ${e.record_date} · ${e.value}분`));
    const detail=node('details');add(detail,node('summary','','기록 근거'),node('p','hint',`기록 번호: ${e.id}`),node('p','hint',`서버 저장 시각: ${studyDateTime(e.recorded_at)} (서울)`));card.append(detail);records.append(card);
  }
  $('study-rules').replaceChildren(...Object.entries(s.rules).map(([key,value])=>node('li','hint',`${({timezone:'날짜 기준',unit:'단위',week_start:'주 시작',missing:'누락',duplicates:'중복',invalid:'유효값',rounding:'반올림',calculation:'계산',dates:'날짜',measurement:'측정'})[key]||key}: ${value}`)));
}
async function studySubmit(form,path,method,data,message) {
  const button=form.querySelector('button');button.disabled=true;
  try {await api(path,{method,body:JSON.stringify(data)});form.reset();await refreshStudy();show(message);}
  catch(error){show(error.message,true);}
  finally {button.disabled=false;if(studyState)renderStudy();}
}
$('study-config-form').addEventListener('submit',event=>{
  event.preventDefault();studySubmit(event.currentTarget,'/api/study/config',studyState?.study?'PATCH':'POST',Object.fromEntries(new FormData(event.currentTarget)),'5일 기록 설정을 저장했습니다. 실제 활동 뒤 오늘의 기록을 남겨 주세요.');
});
$('study-entry-form').addEventListener('submit',event=>{
  event.preventDefault();const field=event.currentTarget.elements.namedItem('value');
  if(field.value.trim()===''){show('실제로 측정한 시간을 입력해 주세요.',true);return;}
  studySubmit(event.currentTarget,'/api/study/entries','POST',{value:field.valueAsNumber},'오늘의 실제 기록을 저장했습니다.');
});
$('study-change-form').addEventListener('submit',event=>{
  event.preventDefault();studySubmit(event.currentTarget,'/api/study/rule-change','POST',Object.fromEntries(new FormData(event.currentTarget)),'두 기록의 근거와 계획 규칙 변경을 저장했습니다. 다음 실제 날짜에 3일차를 기록해 주세요.');
});
