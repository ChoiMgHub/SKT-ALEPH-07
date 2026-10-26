import { timingSafeEqual } from 'node:crypto';

export const SESSION_SECONDS = 24 * 60 * 60;
export const PASSWORD_ITERATIONS = 100000;
const enc = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const unhex = text => Uint8Array.from(text.match(/../g), byte => parseInt(byte, 16));
const nowText = () => new Date().toISOString();

export class HttpError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export async function boundedText(request, limit) {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new HttpError('입력 크기가 너무 큽니다.', 413);
  if (!request.body) return '';
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HttpError('입력 크기가 너무 큽니다.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  return new TextDecoder().decode(bytes);
}
export async function digest(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
function requirePepper(env) {
  if (!/^[a-f0-9]{64}$/.test(env.AUTH_PEPPER || '')) {
    throw new HttpError('인증 서버 설정이 필요합니다. 관리자에게 문의해 주세요.', 503);
  }
  return env.AUTH_PEPPER;
}
function usernameInput(value) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) {
    throw new HttpError('아이디는 영문 소문자·숫자·밑줄·하이픈으로 3~32자 입력해 주세요.');
  }
  return username;
}
export function validatePassword(value) {
  if (typeof value !== 'string' || [...value].length < 12 || enc.encode(value).length > 256) {
    throw new HttpError('비밀번호는 12자 이상, UTF-8 기준 256바이트 이하로 입력해 주세요.');
  }
  return value;
}
async function passwordKey(password, salt, env) {
  const pepper = await crypto.subtle.importKey('raw', unhex(requirePepper(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const input = await crypto.subtle.sign('HMAC', pepper, enc.encode(password));
  const key = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt, iterations: PASSWORD_ITERATIONS }, key, 256));
}
export async function hashPassword(password, env) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha512$${PASSWORD_ITERATIONS}$${hex(salt)}$${hex(await passwordKey(password, salt, env))}`;
}
export async function verifyPassword(password, encoded, env) {
  const match = /^pbkdf2-sha512\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(encoded || '');
  if (!match) throw new HttpError('인증 데이터를 확인할 수 없습니다. 관리자에게 문의해 주세요.', 503);
  return timingSafeEqual(await passwordKey(password, unhex(match[1]), env), unhex(match[2]));
}
function cookieName(request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-aleph_session' : 'aleph_session';
}
export function tokenFrom(request) {
  const parts = (request.headers.get('cookie') || '').split(';').map(x => x.trim());
  const matches = parts.filter(x => x.startsWith(`${cookieName(request)}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(matches[0].indexOf('=') + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function cookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
export function clearCookie(request) { return cookie(request, '', 0); }
export async function authenticate(request, env) {
  const token = tokenFrom(request);
  if (!token) return null;
  return await env.DB.prepare('SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?')
    .bind(await digest(token), nowText()).first();
}
export function checkWriteRequest(request) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new HttpError('HTTPS 연결이 필요합니다.', 403);
  }
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site' ||
      request.headers.get('x-requested-with') !== 'aleph-diary') {
    throw new HttpError('허용되지 않은 요청입니다.', 403);
  }
}
async function rateLimit(request, env) {
  const window = Math.floor(Date.now() / 600000);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const bucket = await digest(`${requirePepper(env)}:${ip}:${window}`);
  await env.DB.prepare('DELETE FROM auth_attempts WHERE expires_at<=?').bind(nowText()).run();
  await env.DB.prepare('INSERT INTO auth_attempts VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1')
    .bind(bucket, new Date((window + 1) * 600000).toISOString()).run();
  const row = await env.DB.prepare('SELECT attempts FROM auth_attempts WHERE bucket=?').bind(bucket).first();
  if (row.attempts > 60) throw new HttpError('요청이 많습니다. 잠시 뒤 다시 시도해 주세요.', 429);
}
async function newSession(request, env, user) {
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = nowText(), expires = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now).run();
  const inserted = await env.DB.prepare('INSERT INTO sessions SELECT ?, id, ?, ? FROM users WHERE id=? AND password_hash=?')
    .bind(await digest(raw), now, expires, user.id, user.password_hash).run();
  if (!inserted.meta?.changes) throw new HttpError('아이디 또는 비밀번호를 확인해 주세요.', 401);
  return { data: { user: { id: user.id, username: user.username }, expires_at: expires }, cookie: cookie(request, raw, SESSION_SECONDS) };
}
export async function signup(request, env, input) {
  requirePepper(env);
  await rateLimit(request, env);
  const username = usernameInput(input.username), password = validatePassword(input.password);
  const encoded = await hashPassword(password, env);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').bind(id, username, encoded, nowText()).run();
  } catch (error) {
    if (await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first()) {
      throw new HttpError('이미 사용 중인 아이디입니다.', 409);
    }
    throw error;
  }
  return { user: { id, username } };
}
export async function login(request, env, input) {
  requirePepper(env);
  await rateLimit(request, env);
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase().slice(0, 32) : '';
  const password = typeof input.password === 'string' && enc.encode(input.password).length <= 256 ? input.password : '';
  const user = await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
  // A missing user still performs the same KDF. This fixed synthetic value is not an account password.
  const dummy = `pbkdf2-sha512$100000$${'00'.repeat(16)}$${'00'.repeat(32)}`;
  const valid = await verifyPassword(password, user?.password_hash || dummy, env);
  if (!user || !valid) throw new HttpError('아이디 또는 비밀번호를 확인해 주세요.', 401);
  const old = tokenFrom(request);
  if (old) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(old)).run();
  return newSession(request, env, user);
}
export async function logout(request, env) {
  const token = tokenFrom(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
  return clearCookie(request);
}
export async function changePassword(request, env, user, input) {
  requirePepper(env);
  await rateLimit(request, env);
  const old = await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
  if (typeof input.current_password !== 'string' || enc.encode(input.current_password).length > 256 ||
      !await verifyPassword(input.current_password, old.password_hash, env)) {
    throw new HttpError('현재 비밀번호를 확인해 주세요.', 401);
  }
  const encoded = await hashPassword(validatePassword(input.new_password), env);
  const updated = await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?').bind(encoded, user.id, old.password_hash),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)
  ]);
  if (!updated[0].meta?.changes) throw new HttpError('비밀번호가 변경됐습니다. 다시 로그인해 주세요.', 401);
  return clearCookie(request);
}
