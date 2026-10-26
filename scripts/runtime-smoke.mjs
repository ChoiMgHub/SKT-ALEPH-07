// Integration smoke check using Wrangler's installed Miniflare and real workerd/D1.
// All accounts/passwords/pepper/session values are generated in memory and never printed.
import * as miniflare from 'miniflare';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const options = { modules:true, scriptPath:new URL('../dist/worker.js',import.meta.url).pathname,
  compatibilityDate:'2026-10-21', compatibilityFlags:['nodejs_compat'], d1Databases:['DB'],
  bindings:{AUTH_PEPPER:randomBytes(32).toString('hex')} };
// fileURLToPath is required for Windows drive letters and paths containing spaces.
const { fileURLToPath } = await import('node:url');
options.scriptPath=fileURLToPath(new URL('../dist/worker.js',import.meta.url));
const mf=new miniflare.Miniflare(miniflare.convertV4MiniflareOptions ? miniflare.convertV4MiniflareOptions(options) : options);
try {
  const db=await mf.getD1Database('DB');
  for(const file of ['schema.sql','schema-auth.sql']) {
    const sql=readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/--[^\n]*/g,'');
    for(const part of sql.split(';').filter(x=>x.trim())) await db.prepare(part).run();
  }
  const password=randomBytes(24).toString('base64url');
  const send=(path,data,cookie='')=>mf.dispatchFetch('https://example.test'+path,{method:data?'POST':'GET',redirect:'manual',headers:{'content-type':'application/json','x-requested-with':'aleph-diary',cookie},...(data?{body:JSON.stringify(data)}:{})});
  const created=await send('/api/auth/signup',{username:'runtime_user',password});assert.equal(created.status,201);
  const logged=await send('/api/auth/login',{username:'runtime_user',password});assert.equal(logged.status,200);
  const cookie=logged.headers.get('set-cookie').split(';')[0];
  assert.equal((await send('/api/state',null,cookie)).status,200);
  assert.equal((await send('/api/state')).status,401);
  assert.equal((await send('/diary',null,cookie)).status,200);
  const missing=await send('/diary');assert.equal(missing.status,303);
  await send('/api/auth/logout',{},cookie);
  assert.equal((await send('/api/state',null,cookie)).status,401);
  console.log('workerd/D1: signup, login, protected API/page, anonymous denial and logout replay passed.');
} finally { await mf.dispose(); }
