// Real HTTP verification. Creates only disposable verification accounts, then deletes them.
// Passwords, cookies and the server pepper are never written to the report or console.
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function verifyAuth({baseUrl='http://127.0.0.1:8787',fetchImpl=fetch,readHashes}) {
  const base=new URL(baseUrl);
  if(base.username||base.password||base.search||base.hash||base.pathname!=='/') throw new Error('앱의 기본 주소만 입력해 주세요.');
  const report={kind:'temporary-account-auth-verification',started_at:new Date().toISOString(),timezone:'Asia/Seoul',base_url:base.origin,
    scope:'자동 생성 임시 계정의 실제 요청 점검. 사용자의 기존 계정·자료 또는 실제 5일 사용 기록과 구분한다.',
    checks:[],requests:[],accounts:[],password_storage:null,cleanup:[],errors:[]};
  const check=(name,pass,details={})=>report.checks.push({name,pass,...details});
  const actors=[];
  const safeInput=data=>{
    if(data===undefined)return undefined;
    return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,/password/i.test(k)?'[REDACTED]':v]));
  };
  async function request(label,actor,path,method='GET',data,extraHeaders={}) {
    const headers={'content-type':'application/json','x-requested-with':'aleph-diary',...extraHeaders};
    if(actor?.cookie)headers.cookie=actor.cookie;
    const raw=await fetchImpl(new URL(path,base),{method,headers,redirect:'manual',signal:AbortSignal.timeout(30000),...(data===undefined?{}:{body:JSON.stringify(data)})});
    const text=await raw.text();let response;try{response=JSON.parse(text);}catch{response={non_json_response:true};}
    const set=raw.headers.get('set-cookie');
    report.requests.push({label,actor:actor?.label||'anonymous',method,url:new URL(path,base).href,
      request:{headers:{...headers,...(headers.cookie?{cookie:'[REDACTED]'}:{})},...(data===undefined?{}:{body:safeInput(data)})},
      response:{status:raw.status,body:response,...(set?{set_cookie:'[REDACTED]'}:{}),...(raw.headers.get('location')?{location:raw.headers.get('location')}:{})}});
    return {status:raw.status,body:response,cookie:set?.split(';')[0],setCookie:set};
  }
  function requireStatus(result,expected,label) {
    check(label,result.status===expected,{expected_status:expected,actual_status:result.status});
    if(result.status!==expected)throw new Error(`${label}: 예상 ${expected}, 실제 ${result.status}`);
    return result;
  }
  const collections=s=>Object.fromEntries(['plans','plan_revisions','tasks','execution_logs','reflections','task_completions','reflection_links'].map(k=>[k,s[k]]));
  const evidence=s=>({counts:Object.fromEntries(Object.entries(collections(s)).map(([k,v])=>[k,v.length])),content:collections(s),
    content_sha256:createHash('sha256').update(JSON.stringify(collections(s))).digest('hex')});
  const currentDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const planData=title=>({title,start_date:currentDate,end_date:currentDate,priority:'보통',success_criteria:'자동 접근통제 점검용 합성 자료',expected_minutes:0});
  const taskData=(planId,title)=>({plan_id:planId,title,priority:'보통',category:'자동 권한 점검',expected_minutes:0,status:'todo'});
  let sharedPassword=randomBytes(24).toString('base64url');
  try {
    const health=await request('대상 앱 확인',null,'/api/health');
    if(health.status!==200||health.body.implementation_version!=='task07-auth-v1')throw new Error('과제 7 인증 앱 주소와 서버 실행 상태를 확인해 주세요.');
    const suffix=Date.now().toString(36)+'_'+randomBytes(3).toString('hex');
    for(const label of ['A','B']) {
      const actor={label:`temporary_${label}`,username:`verify_${suffix}_${label.toLowerCase()}`,cookie:null,password:sharedPassword};
      const joined=requireStatus(await request(`${label} 가입`,null,'/api/auth/signup','POST',{username:actor.username,password:actor.password}),201,`${label} 가입 성공`);
      actor.id=joined.body.user.id;actors.push(actor);report.accounts.push({label:actor.label,username:actor.username,user_id:actor.id});
      const signed=requireStatus(await request(`${label} 로그인`,actor,'/api/auth/login','POST',{username:actor.username,password:actor.password}),200,`${label} 로그인 성공`);
      actor.cookie=signed.cookie;
      const https=base.protocol==='https:';
      check(`${label} 세션 쿠키 속성`,signed.setCookie.includes('HttpOnly')&&signed.setCookie.includes('SameSite=Strict')&&signed.setCookie.includes('Max-Age=86400')&&(!https||signed.setCookie.includes('Secure')),
        {http_only:signed.setCookie.includes('HttpOnly'),same_site_strict:signed.setCookie.includes('SameSite=Strict'),max_age_seconds:Number(/Max-Age=(\d+)/.exec(signed.setCookie)?.[1]||0),secure_present:signed.setCookie.includes('Secure'),secure_required:https});
      const p=requireStatus(await request(`${label} 테스트 계획 생성`,actor,'/api/plans','POST',planData(`[자동 권한 점검] ${label}`)),201,`${label} 본인 계획 생성`);
      actor.planId=p.body.id;
      const t=requireStatus(await request(`${label} 테스트 할 일 생성`,actor,'/api/tasks','POST',taskData(actor.planId,`[자동 권한 점검] ${label}의 할 일`)),201,`${label} 본인 할 일 생성`);
      actor.taskId=t.body.id;
      requireStatus(await request(`${label} 본인 자료 조회`,actor,`/api/tasks/${actor.taskId}`),200,`${label} 본인 조회 허용`);
      requireStatus(await request(`${label} 본인 자료 수정`,actor,`/api/tasks/${actor.taskId}`,'PATCH',{title:`[자동 권한 점검] ${label} 수정 확인`}),200,`${label} 본인 수정 허용`);
      const disposable=requireStatus(await request(`${label} 본인 삭제용 할 일 생성`,actor,'/api/tasks','POST',taskData(actor.planId,`[자동 권한 점검] ${label} 삭제 시험`)),201,`${label} 삭제 시험 자료 생성`);
      requireStatus(await request(`${label} 본인 자료 삭제`,actor,`/api/tasks/${disposable.body.id}`,'DELETE'),200,`${label} 본인 삭제 허용`);
    }
    const [a,b]=actors;
    const duplicate=await request('동일 아이디 가입 차단',null,'/api/auth/signup','POST',{username:a.username.toUpperCase(),password:sharedPassword});
    check('정규화한 중복 아이디 거부',duplicate.status===409);
    const wrong=await request('틀린 비밀번호 로그인',null,'/api/auth/login','POST',{username:a.username,password:randomBytes(24).toString('base64url')});
    const missing=await request('없는 아이디 로그인',null,'/api/auth/login','POST',{username:`absent_${suffix}`,password:randomBytes(24).toString('base64url')});
    check('로그인 실패 문구 동일',wrong.status===401&&missing.status===401&&JSON.stringify(wrong.body)===JSON.stringify(missing.body));
    for(const path of ['/api/state','/api/export','/api/imports']) check(`익명 ${path} 거부`,(await request(`익명 ${path}`,null,path)).status===401);
    check('비로그인 자료 화면은 로그인으로 이동',(await request('익명 자료 화면',null,'/diary')).status===303);
    for(const [attacker,victim] of [[a,b],[b,a]]) {
      const before=requireStatus(await request(`${victim.label} 점검 전 자료`,victim,'/api/state'),200,'피해 계정 점검 전 조회').body;
      const attempts=[
        ['조회',`/api/tasks/${victim.taskId}`,'GET',undefined],
        ['수정',`/api/tasks/${victim.taskId}`,'PATCH',{title:'차단돼야 하는 자동 점검 수정'}],
        ['삭제',`/api/tasks/${victim.taskId}`,'DELETE',undefined]
      ];
      for(const [operation,path,method,data] of attempts) {
        const result=await request(`${attacker.label} → ${victim.label} ${operation}`,attacker,path,method,data);
        check(`${attacker.label} → ${victim.label} ${operation} 거부`,result.status===404,{expected_status:404,actual_status:result.status});
      }
      const after=requireStatus(await request(`${victim.label} 점검 후 자료`,victim,'/api/state'),200,'피해 계정 점검 후 조회').body;
      const beforeEvidence=evidence(before),afterEvidence=evidence(after);
      check(`${victim.label} 행 수와 내용 불변`,beforeEvidence.content_sha256===afterEvidence.content_sha256,{before:beforeEvidence,after:afterEvidence});
      const spoof=await request(`${attacker.label} URL·헤더 소유자 위조`,attacker,`/api/state?user_id=${victim.id}`,'GET',undefined,{'x-user-id':victim.id});
      check(`${attacker.label} 목록·URL·헤더 소유자 위조 차단`,spoof.status===200&&!JSON.stringify(spoof.body).includes(victim.planId)&&!JSON.stringify(spoof.body).includes(victim.taskId));
      const moved=await request(`${attacker.label} 다른 소유자 계획으로 이동`,attacker,`/api/tasks/${attacker.taskId}`,'PATCH',{plan_id:victim.planId,user_id:victim.id});
      check(`${attacker.label} 본문의 다른 소유자 연결 거부`,moved.status===404);
    }
    try {
      if(!readHashes)throw new Error('DB 해시 확인 함수가 없습니다.');
      const rows=await readHashes(actors.map(x=>x.username));
      const hashes=rows.map(x=>x.password_hash);
      const valid=rows.length===2&&actors.every(a=>rows.some(r=>r.username===a.username))&&hashes.every(h=>/^pbkdf2-sha512\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(h)&&!h.includes(sharedPassword))&&hashes[0]!==hashes[1];
      report.password_storage={checked_at:new Date().toISOString(),same_test_password:true,rows,pass:valid};
      check('동일 비밀번호의 저장값·소금값이 다름',valid);
    } catch(error) { check('동일 비밀번호의 저장값·소금값이 다름',false,{error:error.message}); }
    const second=requireStatus(await request('A 추가 세션 로그인',null,'/api/auth/login','POST',{username:a.username,password:a.password}),200,'추가 세션 생성');
    const oldCookies=[a.cookie,second.cookie];
    const nextPassword=randomBytes(24).toString('base64url');
    requireStatus(await request('A 비밀번호 변경',a,'/api/auth/password','POST',{current_password:a.password,new_password:nextPassword}),200,'비밀번호 변경 성공');
    a.password=nextPassword;
    for(const [index,cookie] of oldCookies.entries()) check(`변경 전 세션 ${index+1} 재전송 거부`,(await request(`이전 세션 ${index+1} 재전송`,{...a,cookie},'/api/state')).status===401);
    const fresh=requireStatus(await request('새 비밀번호 로그인',null,'/api/auth/login','POST',{username:a.username,password:a.password}),200,'새 비밀번호 로그인 성공');
    a.cookie=fresh.cookie;
    requireStatus(await request('로그아웃 전 같은 쿠키 조회',a,'/api/state'),200,'로그아웃 전 조회 허용');
    const old=a.cookie;
    requireStatus(await request('A 로그아웃',a,'/api/auth/logout','POST'),200,'로그아웃 성공');
    check('로그아웃 뒤 같은 쿠키 재전송 거부',(await request('로그아웃 뒤 원래 쿠키 재전송',{...a,cookie:old},'/api/state')).status===401);
    a.cookie=null;
  } catch(error) { report.errors.push(error.message); }
  finally {
    for(const actor of actors) {
      try {
        const fresh=await request(`${actor.label} 정리용 로그인`,null,'/api/auth/login','POST',{username:actor.username,password:actor.password});
        if(fresh.status!==200)throw new Error(`정리용 로그인 실패 ${fresh.status}`);
        actor.cookie=fresh.cookie;
        const removed=await request(`${actor.label} 임시 계정·자료 삭제`,actor,'/api/auth/account','DELETE',{confirm_username:actor.username});
        if(removed.status!==200)throw new Error(`임시 계정 삭제 실패 ${removed.status}`);
        const replay=await request(`${actor.label} 삭제 뒤 세션 재전송`,actor,'/api/state');
        report.cleanup.push({username:actor.username,deleted:true,old_session_rejected:replay.status===401});
      } catch(error) { report.cleanup.push({username:actor.username,deleted:false,error:error.message}); }
      actor.password=null;actor.cookie=null;
    }
    sharedPassword=null;
  }
  report.finished_at=new Date().toISOString();
  report.passed=report.errors.length===0&&report.checks.every(c=>c.pass)&&report.cleanup.length===2&&report.cleanup.every(c=>c.deleted&&c.old_session_rejected);
  return report;
}

async function main() {
  const args=process.argv.slice(2),remote=args.includes('--remote');
  const value=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
  const baseUrl=value('--url')||'http://127.0.0.1:8787',url=new URL(baseUrl);
  const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(!remote&&!loopback)throw new Error('기본 점검은 내 컴퓨터 주소만 허용합니다.');
  if(remote&&(loopback||url.protocol!=='https:'))throw new Error('원격 점검에는 과제 7 HTTPS 주소가 필요합니다.');
  const root=fileURLToPath(new URL('../',import.meta.url));
  const config=JSON.parse(readFileSync(resolve(root,'wrangler.jsonc'),'utf8'));
  const database=config.d1_databases?.find(x=>x.binding==='DB');
  if(config.name!=='skt-aleph-07'||database?.database_name!=='aleph-diary-07')throw new Error('과제 7 Worker·DB 설정을 확인해 주세요.');
  const report=await verifyAuth({baseUrl,readHashes:async usernames=>{
    if(!usernames.every(u=>/^verify_[a-z0-9_]+$/.test(u)))throw new Error('검증 계정 이름이 잘못됐습니다.');
    const sql=`SELECT username, password_hash FROM users WHERE username IN (${usernames.map(x=>`'${x}'`).join(',')}) ORDER BY username`;
    const {stdout}=await promisify(execFile)(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'d1','execute',database.database_name,remote?'--remote':'--local','--command',sql,'--json'],{cwd:root,maxBuffer:4*1024*1024,timeout:60000,windowsHide:true});
    const parsed=JSON.parse(stdout);return parsed.flatMap(x=>x.results||[]);
  }});
  const directory=resolve(root,'.private');mkdirSync(directory,{recursive:true,mode:0o700});
  const file=resolve(directory,remote?'auth-verification-remote.json':'auth-verification-local.json');
  writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  for(const check of report.checks)console.log(`[${check.pass?'PASS':'FAIL'}] ${check.name}`);
  console.log(`임시 계정 정리: ${report.cleanup.filter(c=>c.deleted).length}/2`);
  for(const error of report.errors)console.log(`[ERROR] ${error}`);
  console.log(`결과 파일: ${file}`);
  console.log('비밀번호·쿠키·pepper는 결과 파일에 포함하지 않았습니다.');
  console.log(report.passed?'AUTH VERIFICATION PASSED':'AUTH VERIFICATION FAILED');
  if(!report.passed)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(`점검 실행 실패: ${error.message}`);process.exitCode=1;});
