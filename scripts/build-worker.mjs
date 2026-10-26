import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const assets = {};
const types={html:'text/html',css:'text/css',js:'application/javascript',json:'application/json'};
for(const name of readdirSync(resolve(root,'public'))) {
  const ext=name.split('.').at(-1);
  if(types[ext])assets['/'+name]={type:types[ext]+'; charset=utf-8',body:read('public/'+name)};
}
assets['/']=assets['/index.html'];
const staticCode = `const STATIC_ASSETS = ${JSON.stringify(assets)};\n` +
  `function serveAsset(request) { const path = new URL(request.url).pathname; const asset = STATIC_ASSETS[path];` +
  ` if (!asset) return new Response('찾을 수 없습니다.', {status:404});` +
  ` return new Response(asset.body, {headers:{'content-type':asset.type,'x-content-type-options':'nosniff',` +
  `'referrer-policy':'no-referrer','x-frame-options':'DENY',` +
  `'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"}}); }\n`;
const auth = read('src/auth.js').replace(/^export /gm, '');
const importer = read('src/import.js').replace(/^import .*from '\.\/auth\.js';\n/gm, '').replace(/^export /gm, '');
const study = read('src/study.js').replace(/^import .*from '\.\/auth\.js';\n/gm, '').replace(/^export /gm, '');
const source = read('src/worker.js').replace(/^import .*from '\.\/(auth|import|study)\.js';\n/gm, '');
const original = "if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);";
if (!source.includes(original)) throw new Error('Static asset hook was not found.');
const output = staticCode + auth + '\n' + importer + '\n' + study + '\n' + source
  .replace(original, "if (!url.pathname.startsWith('/api/')) return serveAsset(request);")
  .replace("return env.ASSETS.fetch(new Request(new URL('/', url), request));", "return serveAsset(new Request(new URL('/', url), request));");
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/worker.js'), output);
console.log(`Built dist/worker.js (${Buffer.byteLength(output)} bytes)`);

