import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = resolve(root, '.dev.vars');
const previous = existsSync(target) ? readFileSync(target,'utf8') : '';
const match = /^AUTH_PEPPER=([a-f0-9]{64})\s*$/m.exec(previous);
if (/^AUTH_PEPPER=/m.test(previous) && !match) throw new Error('기존 AUTH_PEPPER 설정을 확인해 주세요. 자동 교체하지 않았습니다.');
const pepper = match?.[1] || randomBytes(32).toString('hex');
if (!match) writeFileSync(target, `${previous}${previous.endsWith('\n')||!previous?'':'\n'}AUTH_PEPPER=${pepper}\n`,{mode:0o600});
mkdirSync(resolve(root,'.private'),{recursive:true,mode:0o700});
writeFileSync(resolve(root,'.private/worker-secrets.json'),JSON.stringify({AUTH_PEPPER:pepper}),{mode:0o600});
console.log('로컬 인증 설정 준비 완료. 비밀값은 출력하지 않았습니다.');
console.log('기존 값은 유지했습니다. .dev.vars와 .private/는 Git에 올리지 마세요.');
