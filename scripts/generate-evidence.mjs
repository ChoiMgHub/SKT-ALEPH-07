// Public evidence from isolated workerd/D1. Never reads an existing user's secrets or data.
import * as miniflare from 'miniflare';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { verifyAuth } from './verify-auth.mjs';
const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8');
const pepper=randomBytes(32).toString('hex');
const options={modules:true,scriptPath:fileURLToPath(new URL('dist/worker.js',root)),compatibilityDate:'2026-10-21',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{AUTH_PEPPER:pepper}};
const mf=new miniflare.Miniflare(miniflare.convertV4MiniflareOptions?miniflare.convertV4MiniflareOptions(options):options);
const secrets=new Set([pepper]);
try {
  const db=await mf.getD1Database('DB');
  for(const file of ['schema.sql','schema-auth.sql','schema-study.sql'])for(const sql of read(file).replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
  let report=await verifyAuth({baseUrl:'https://example.test',fetchImpl:async(url,init)=>{
    if(init.body)for(const [k,v] of Object.entries(JSON.parse(init.body)))if(/password/i.test(k)&&typeof v==='string')secrets.add(v);
    if(init.headers.cookie)secrets.add(init.headers.cookie.split('=')[1]);
    const response=await mf.dispatchFetch(url.toString(),init);const cookie=response.headers.get('set-cookie');
    if(cookie){const token=cookie.split(';')[0].split('=')[1];if(token)secrets.add(token);}
    return response;
  },readHashes:async names=>(await db.prepare('SELECT username,password_hash FROM users WHERE username IN (?,?) ORDER BY username').bind(...names).all()).results});
  assert.equal(report.passed,true,'evidence verification must pass');
  report.evidence_environment={kind:'isolated-workerd-d1',created_by:'AI automated verification',production_deployment:false,notice:'AI가 격리된 workerd/D1의 임시 계정으로 생성한 실제 실행 요청·응답입니다. example.test는 시험 주소이며 공개 Cloudflare 배포 점검이나 사용자의 실제 사용 기록이 아닙니다.'};
  const privateJson=JSON.stringify(report,null,2)+'\n';
  for(const value of secrets)if(value)assert.ok(!privateJson.includes(value),'credential found in evidence');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n,0);
  mkdirSync(new URL('.private/',root),{recursive:true,mode:0o700});
  writeFileSync(new URL('.private/auth-evidence-ai.json',root),privateJson,{mode:0o600});
  const ids=new Map(),users=new Map(report.accounts.map(a=>[a.username.toLowerCase(),a.label]));
  const anonymousText=value=>value.replace(/verify_[a-z0-9_]+/gi,v=>`[${users.get(v.toLowerCase())||'temporary_account'}]`)
    .replace(/absent_[a-z0-9_]+/gi,'[unknown_account]')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,v=>{if(!ids.has(v))ids.set(v,`[ID_${ids.size+1}]`);return ids.get(v);});
  report=JSON.parse(privateJson,(key,value)=>{
    if(/password_hash|content_sha256/.test(key))return '[REDACTED: private evidence only]';
    if(typeof value==='string')return anonymousText(value);
    if(value&&typeof value==='object'&&!Array.isArray(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[anonymousText(k),v]));
    return value;
  });
  report.public_redaction='계정명·자료 ID는 일관된 익명 표지로 바꾸고 저장 해시·내용 해시는 공개하지 않았습니다. 원본은 .private/auth-evidence-ai.json에 비공개로 보관합니다.';
  const json=JSON.stringify(report,null,2)+'\n';
  assert.ok(!/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|verify_[a-z0-9_]+|pbkdf2-sha512\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}/i.test(json),'original identifiers or hashes remain in public evidence');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const block=(title,data)=>`<details class="panel"><summary>${escape(title)}</summary><pre>${escape(JSON.stringify(data,null,2))}</pre></details>`;
  const requests=report.requests;
  const sections=[
    ['① 가입·로그인·중복·동일 실패 문구',requests.filter(r=>/가입|틀린 비밀번호|없는 아이디/.test(r.label)||/^[AB] 로그인$/.test(r.label))],
    ['② 같은 임시 비밀번호의 서로 다른 저장 해시·salt',report.password_storage],
    ['③ 같은 주소·방식의 로그인 전후·로그아웃 재전송',requests.filter(r=>/로그아웃 전|로그아웃 뒤|A 로그아웃|익명 자료 화면|익명 \/api\/state/.test(r.label))],
    ['④ A↔B 조회·수정·삭제 거부와 소유자의 허용',requests.filter(r=>/→|본인 자료/.test(r.label))],
    ['⑤ 거절 전후 피해 자료의 건수·내용·해시와 소유자 위조',report.checks.filter(c=>/행 수와 내용|위조|소유자 연결/.test(c.name))],
    ['⑥ 비밀번호 변경 뒤 이전 세션 거부·새 비밀번호 허용',requests.filter(r=>/이전 세션|비밀번호 변경|새 비밀번호/.test(r.label))]
  ];
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>인증 검증 증거 · 플랜두씨</title><link rel="stylesheet" href="/style.css"></head><body><div class="shell"><header class="hero"><div><p class="eyebrow">SKT ALEPH · VERIFICATION</p><h1>로그인 없이 읽는 인증 검증 증거</h1></div></header><nav class="steps"><a href="/">내 다이어리</a><a href="/one-day-demo.html">하루 모의 체험</a><a href="/verification.json" download>익명화한 검증 JSON</a></nav><aside class="notice"><strong>격리된 실행 환경의 증거</strong><span>${escape(report.evidence_environment.notice)}</span></aside><main><section class="section"><div class="panel"><h2>검증 결과</h2><p>${report.checks.length}개 점검 통과 · 임시 계정 ${report.cleanup.length}/2개 정리 완료</p><p>실행 시각 ${escape(report.started_at)} ~ ${escape(report.finished_at)} (UTC)</p><p>비밀번호·쿠키·세션 원문·pepper가 결과에 없는지 검사했습니다. ${escape(report.public_redaction)}</p><p>공개 배포에서 사용자가 실행한 원격 49개 PASS와는 별도입니다. 그 원격 상세 JSON은 아직 이 페이지에 포함하지 않았습니다. 실제 5일 사용 조건도 미충족입니다.</p></div>${sections.map(([title,data])=>block(title,data)).join('')}${block('전체 PASS 목록과 임시 계정 정리', {checks:report.checks.map(c=>({name:c.name,pass:c.pass})),cleanup:report.cleanup})}<p>테스트 통과는 확인한 범위의 결과이며 실제 5일 사용 또는 상용 보안 인증이 아닙니다.</p></section></main></div></body></html>\n`;
  writeFileSync(new URL('public/verification.json',root),json);
  writeFileSync(new URL('public/verification.html',root),html);
  const markdown='# 인증 검증 상세 증거\n\n'+report.evidence_environment.notice+'\n\n실행 시각: '+report.started_at+' ~ '+report.finished_at+' (UTC). 결과: '+report.checks.length+' PASS, 임시 계정 정리 2/2.\n\n비밀번호·쿠키·세션 원문·pepper는 가렸다. '+report.public_redaction+' 사용자가 공개 배포에서 실행한 원격 보고서와 구분한다.\n\n'+sections.map(([title,data])=>'## '+title+'\n\n```json\n'+JSON.stringify(data,null,2)+'\n```\n').join('\n')+'\n전체 요청·응답과 점검 목록: [검증 JSON](../public/verification.json).\n';
  writeFileSync(new URL('docs/auth-evidence.md',root),markdown);
  console.log(`Public evidence saved: ${report.checks.length} PASS, cleanup 2/2, credential redaction verified.`);
} finally {await mf.dispose();}
