/** Persistent pricing and merchant login for Netlify. No customer/order/payment adapter. */
import {createHash, randomBytes, randomUUID, pbkdf2 as deriveKey, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {isIP} from 'node:net';

const pbkdf2 = promisify(deriveKey);
const COOKIE = '__Host-dlcj_merchant';
const SESSION_MS = 8 * 60 * 60 * 1000;
const ITERATIONS = 600000;
const hash = value => createHash('sha256').update(value).digest('hex');
class HttpError extends Error {
  constructor(code, status, message, extra = {}) {super(message); this.code = code; this.status = status; this.extra = extra;}
}
const fail = (code, status, message, extra) => {throw new HttpError(code, status, message, extra);};
const date = value => value == null ? null : new Date(value).toISOString();
function pricing(row) {
  if (!row) fail('SERVICE_UNAVAILABLE', 503, '商品价格暂时无法读取，请稍后重试。');
  return {currency: 'CNY', version: row.version, standardFen: row.standard_fen, customFen: row.custom_fen, updatedAt: date(row.updated_at)};
}
function passwordSpec(value) {
  if (typeof value !== 'string') return null;
  const match = /^pbkdf2-sha256\$600000\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return null;
  const salt = Buffer.from(match[1], 'base64url'), key = Buffer.from(match[2], 'base64url');
  return salt.length === 16 && key.length === 32 ? {salt, key} : null;
}
/** Called only by the operator's local password form or synthetic tests. */
export async function hashMerchantPassword(password, {minimumLength=16} = {}) {
  if (!Number.isInteger(minimumLength) || minimumLength < 6 || typeof password !== 'string' || password.length < minimumLength || password.length > 128 || Buffer.byteLength(password) > 256) throw new Error(`网站密码请使用 ${minimumLength}–128 个字符。`);
  const salt = randomBytes(16);
  const key = await pbkdf2(password, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2-sha256$${ITERATIONS}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
function adminConfig(env) {
  const email = String(env.STORE_ADMIN_EMAIL || '').trim().toLowerCase();
  const login = String(env.STORE_ADMIN_USERNAME || email).trim().toLowerCase();
  const spec = passwordSpec(env.STORE_ADMIN_PASSWORD_HASH);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !/^[A-Za-z0-9._@+-]{3,254}$/.test(login) || !spec) return null;
  return {email, login, spec, id: 'merchant-' + hash(email).slice(0,24), version: hash(email + ':' + login + ':' + env.STORE_ADMIN_PASSWORD_HASH)};
}
function response(body, status = 200, headers = {}) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer', ...headers}});
}
async function readBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || (request.headers.get('content-encoding') && request.headers.get('content-encoding') !== 'identity')) fail('INVALID_REQUEST', 415, '请求格式不受支持。');
  const announced = request.headers.get('content-length');
  if (announced && (!/^\d+$/.test(announced) || Number(announced) > 4096)) fail('PAYLOAD_TOO_LARGE', 413, '请求内容过大。');
  const reader = request.body?.getReader(); const chunks = []; let bytes = 0;
  if (!reader) fail('INVALID_REQUEST', 400, '请求内容无效。');
  try {
    for (;;) {const {done, value} = await reader.read(); if (done) break; bytes += value.length; if (bytes > 4096) {await reader.cancel(); fail('PAYLOAD_TOO_LARGE', 413, '请求内容过大。');} chunks.push(value);}
    const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {if (error instanceof HttpError) throw error; fail('INVALID_REQUEST', 400, '请求内容无效。');}
  finally {reader.releaseLock();}
}
export function createNetlifyStore({db, env = process.env, now = Date.now}) {
  const runtimeInstanceId = randomUUID();
  // A pool's connect()/query() contract keeps every price change on one SQL connection.
  async function transaction(action) {
    const client = await db.connect();
    try {await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result;}
    catch (error) {await client.query('ROLLBACK').catch(() => {}); throw error;}
    finally {client.release();}
  }
  const readPricing = async client => pricing((await client.query('SELECT * FROM dlcj_pricing WHERE id=1')).rows[0]);
  const capabilities = () => ({sms:false, orders:false, payment:false, cloudDesigns:false, gallery:false, merchantPassword:Boolean(adminConfig(env)), pricing:true, mode:'netlify-pricing'});
  function origin(request) {
    let configured;
    const expected = env.CONTEXT && env.CONTEXT !== 'production' ? env.DEPLOY_PRIME_URL : env.STORE_PUBLIC_ORIGIN;
    try {configured = new URL(expected);} catch {fail('SERVICE_UNAVAILABLE', 503, '店铺入口尚未配置。');}
    if (configured.protocol !== 'https:' || configured.origin !== expected || request.headers.get('origin') !== expected) fail('ORIGIN_DENIED', 403, '此操作需要从店铺页面发起。');
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) fail('ORIGIN_DENIED', 403, '此操作需要从店铺页面发起。');
  }
  async function session(request) {
    const admin = adminConfig(env); if (!admin) return null;
    const cookies = (request.headers.get('cookie') || '').split(';').map(c => c.trim()).filter(c => c.startsWith(COOKIE + '='));
    if (cookies.length !== 1) return null;
    const token = cookies[0].slice(COOKIE.length + 1); if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const result = await db.query('SELECT token_hash FROM dlcj_merchant_sessions WHERE token_hash=$1 AND credential_version=$2 AND expires_at>$3', [hash(token), admin.version, new Date(now())]);
    return result.rows.length ? admin : null;
  }
  async function requireAdmin(request) {
    if (!adminConfig(env)) fail('ADMIN_NOT_CONFIGURED', 503, '商家登录尚未配置，请店铺负责人完成安全设置。');
    const admin = await session(request); if (!admin) fail('AUTH_REQUIRED', 401, '请先使用商家账号登录。');
    return admin;
  }
  async function limitLogin(ip) {
    if (typeof ip !== 'string' || !isIP(ip)) fail('SERVICE_UNAVAILABLE', 503, '登录服务暂时不可用。');
    // IP comes only from Netlify's Context, never user-controlled forwarding headers.
    for (const [bucket, windowMs, maximum] of [['ip:' + hash(ip), 900000, 6], ['merchant-global', 3600000, 60]]) {
      const start = Math.floor(now() / windowMs) * windowMs;
      const row = (await db.query('INSERT INTO dlcj_merchant_login_limits(bucket,window_start,attempts) VALUES($1,$2,1) ON CONFLICT(bucket) DO UPDATE SET window_start=EXCLUDED.window_start, attempts=CASE WHEN dlcj_merchant_login_limits.window_start=EXCLUDED.window_start THEN dlcj_merchant_login_limits.attempts+1 ELSE 1 END RETURNING attempts', [bucket, start])).rows[0];
      if (row.attempts > maximum) fail('RATE_LIMITED', 429, '登录尝试过多，请稍后重试。', {retryAfterSeconds:Math.ceil((start + windowMs - now()) / 1000)});
    }
  }
  async function savePrice(request) {
    const admin = await requireAdmin(request), input = await readBody(request);
    const {standardFen, customFen, expectedVersion, operationKey} = input;
    if (![standardFen, customFen].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 1000000) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || typeof operationKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(operationKey)) fail('INVALID_PRICE', 422, '单价请填写 0.01–10000 元，最多两位小数，并刷新后重试。');
    const payloadHash = hash(JSON.stringify({standardFen, customFen, expectedVersion}));
    return transaction(async client => {
      const before = pricing((await client.query('SELECT * FROM dlcj_pricing WHERE id=1 FOR UPDATE')).rows[0]);
      const previous = (await client.query('SELECT payload_hash,result FROM dlcj_pricing_operations WHERE actor_id=$1 AND operation_key=$2', [admin.id, operationKey])).rows[0];
      if (previous) {if (previous.payload_hash !== payloadHash) fail('IDEMPOTENCY_CONFLICT', 409, '此操作编号已经使用，请刷新后重试。'); return previous.result;}
      if (before.version !== expectedVersion) fail('PRICE_CHANGED', 409, '商品价格已更新，请核对最新价格后重新保存。', {pricing:before});
      const at = new Date(now()).toISOString();
      const after = pricing((await client.query('UPDATE dlcj_pricing SET version=version+1,standard_fen=$1,custom_fen=$2,updated_at=$3 WHERE id=1 RETURNING *', [standardFen, customFen, at])).rows[0]);
      await client.query('INSERT INTO dlcj_pricing_audit(id,actor_id,actor_label,at,before_price,after_price) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)', [randomUUID(), admin.id, '店铺管理员', at, JSON.stringify(before), JSON.stringify(after)]);
      const result = {pricing:after};
      await client.query('INSERT INTO dlcj_pricing_operations(actor_id,operation_key,payload_hash,result) VALUES($1,$2,$3,$4::jsonb)', [admin.id, operationKey, payloadHash, JSON.stringify(result)]);
      return result;
    });
  }
  return async (request, context = {}) => {
    try {
      const path = new URL(request.url).pathname.replace(/\/+$/, '');
      if (!path.startsWith('/api/store/')) return response({error:'NOT_FOUND', message:'没有找到此接口。'},404);
      if (!['GET','POST'].includes(request.method)) return response({error:'METHOD_NOT_ALLOWED', message:'不支持此操作。'},405,{'Allow':'GET, POST'});
      if (request.method === 'POST') origin(request);
      if (request.method === 'GET' && path === '/api/store/health') {await db.query('SELECT id FROM dlcj_pricing WHERE id=1'); return response({status:'ok', storage:'netlify-postgres', runtimeInstanceId, capabilities:capabilities()});}
      if (request.method === 'GET' && path === '/api/store/pricing') return response({pricing:await readPricing(db)});
      if (request.method === 'GET' && path === '/api/store/session') {
        const admin = await session(request);
        return response({user:admin ? {id:admin.id,role:'admin',phoneMasked:admin.login.includes('@') ? admin.login.replace(/^(.).+(@.*)$/, '$1***$2') : '商家 ' + admin.login} : null, capabilities:capabilities()});
      }
      if (request.method === 'POST' && path === '/api/store/auth/admin/login') {
        const admin = adminConfig(env); if (!admin) fail('ADMIN_NOT_CONFIGURED', 503, '商家登录尚未配置，请店铺负责人完成安全设置。');
        await limitLogin(context.ip);
        const input = await readBody(request);
        const login = input.username ?? input.email;
        if (typeof login !== 'string' || typeof input.password !== 'string' || login.length > 254 || input.password.length > 128 || Buffer.byteLength(input.password) > 256) fail('LOGIN_FAILED', 401, '账号或密码不正确。');
        const key = await pbkdf2(input.password, admin.spec.salt, ITERATIONS, 32, 'sha256');
        if (!timingSafeEqual(key, admin.spec.key) || login.trim().toLowerCase() !== admin.login) fail('LOGIN_FAILED', 401, '账号或密码不正确。');
        const token = randomBytes(32).toString('base64url');
        await db.query('DELETE FROM dlcj_merchant_sessions WHERE expires_at<=$1', [new Date(now())]);
        await db.query('INSERT INTO dlcj_merchant_sessions(token_hash,credential_version,expires_at) VALUES($1,$2,$3)', [hash(token), admin.version, new Date(now() + SESSION_MS)]);
        await db.query('DELETE FROM dlcj_merchant_login_limits WHERE window_start<$1', [now() - 7200000]);
        return response({ok:true},200,{'Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS/1000}`});
      }
      if (request.method === 'POST' && path === '/api/store/auth/logout') {
        const tokens = (request.headers.get('cookie') || '').split(';').map(c => c.trim()).filter(c => c.startsWith(COOKIE + '='));
        for (const token of tokens) {const value = token.slice(COOKIE.length + 1); if (/^[A-Za-z0-9_-]{43}$/.test(value)) await db.query('DELETE FROM dlcj_merchant_sessions WHERE token_hash=$1',[hash(value)]);}
        return response({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`});
      }
      if (request.method === 'GET' && path === '/api/store/admin/pricing') {
        await requireAdmin(request);
        const audit = (await db.query('SELECT id,actor_id,actor_label,at,before_price,after_price FROM dlcj_pricing_audit ORDER BY at DESC,id DESC LIMIT 50')).rows.map(row => ({id:row.id,actorId:row.actor_id,actorLabel:row.actor_label,at:date(row.at),before:row.before_price,after:row.after_price}));
        return response({pricing:await readPricing(db),audit});
      }
      if (request.method === 'POST' && path === '/api/store/admin/pricing') return response(await savePrice(request));
      if (path.startsWith('/api/store/auth/otp/')) fail('SMS_UNAVAILABLE',503,'短信登录暂未开通。可继续浏览和保存本机设计。');
      if (path === '/api/store/gallery') fail('GALLERY_UNAVAILABLE',503,'云端作品集暂未开放。');
      fail('FEATURE_UNAVAILABLE',503,'此服务暂未开通。可继续浏览、在本机保存方案，或联系商家确认。');
    } catch (error) {
      if (error instanceof HttpError) return response({error:error.code,message:error.message,...error.extra},error.status,error.extra.retryAfterSeconds ? {'Retry-After':String(error.extra.retryAfterSeconds)} : {});
      // Never echo database errors, connection strings, passwords, or request bodies.
      return response({error:'SERVICE_UNAVAILABLE',message:'服务暂时不可用，请稍后重试。'},503);
    }
  };
}
