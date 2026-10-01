import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export class ApiError extends Error {
  constructor(code, status = 400, message = '请求无法处理，请检查后重试。') {
    super(message); this.code = code; this.status = status;
  }
}
export const SESSION_COOKIE = '__Host-dlcj_session';
export function normalizePhone(phone) {
  if (typeof phone !== 'string') throw new ApiError('INVALID_PHONE', 400, '请填写有效的中国大陆手机号。');
  const clean = phone.replace(/[\s-]/g, '');
  const canonical = clean.startsWith('+86') ? clean : `+86${clean}`;
  if (!/^\+861[3-9]\d{9}$/.test(canonical)) throw new ApiError('INVALID_PHONE', 400, '请填写有效的中国大陆手机号。');
  return canonical;
}
export function clientIp(req, trustedProxies = []) {
  const direct = req.socket.remoteAddress || 'unknown';
  // Only one known ingress hop is supported. That ingress MUST replace, not append, X-Forwarded-For.
  const forwarded = req.headers['x-forwarded-for'];
  if (trustedProxies.includes(direct) && typeof forwarded === 'string' && isIP(forwarded.trim())) return forwarded.trim();
  return direct;
}
export function enforceOrigin(req, origin) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') {
      throw new ApiError('ORIGIN_REJECTED', 403, '请求来源无效，请刷新当前网站后重试。');
    }
  }
}
export function createAuth({ db, store, secret, sms, now = Date.now, production = false, testMode = false }) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('STORE_AUTH_SECRET must have at least 32 bytes');
  if (production && testMode) throw new Error('Test dependencies are prohibited in production');
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id TEXT PRIMARY KEY, phone TEXT NOT NULL, code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      consumed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_challenge_expiry ON auth_challenges(expires_at);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL, revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
  `);
  const hash = (scope, value) => createHmac('sha256', secret).update(`${scope}\0${value}`).digest('hex');
  function limit(scope, identifier, maximum, duration) {
    const t = now(); const key = hash('rate', `${scope}:${identifier}`);
    const result = db.prepare(`INSERT INTO auth_rate_limits(bucket,count,expires_at) VALUES(?,1,?)
      ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
      expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
      WHERE expires_at<=? OR count<?`).run(key, t + duration, t, t, t, maximum);
    if (result.changes !== 1) throw new ApiError('RATE_LIMITED', 429, '操作过于频繁，请稍后重试。');
  }
  function prune() {
    const cutoff = now();
    db.prepare('DELETE FROM auth_rate_limits WHERE expires_at<?').run(cutoff);
    db.prepare('DELETE FROM auth_challenges WHERE expires_at<?').run(cutoff - 3600000);
    db.prepare('DELETE FROM auth_sessions WHERE expires_at<? OR revoked_at IS NOT NULL').run(cutoff);
  }
  async function requestOtp({ phone, ip }) {
    const canonical = normalizePhone(phone);
    limit('otp-request-ip', ip, 20, 3600000);
    if (!sms?.available) throw new ApiError('SMS_UNAVAILABLE', 503, '短信验证服务尚未启用，请稍后再试；本机设计仍可继续使用。');
    limit('otp-phone-cooldown', canonical, 1, 60000);
    limit('otp-phone-hour', canonical, 5, 3600000);
    prune();
    const id = randomBytes(24).toString('base64url'); const code = String(randomInt(1000000)).padStart(6, '0');
    const t = now();
    db.prepare('UPDATE auth_challenges SET consumed=1 WHERE phone=? AND consumed=0').run(canonical);
    db.prepare('INSERT INTO auth_challenges(id,phone,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
      .run(id, canonical, hash('otp', `${id}:${code}`), t + 300000, t);
    try { await sms.sendOtp({ phone: canonical, code, expiresInSeconds: 300 }); }
    catch {
      db.prepare('UPDATE auth_challenges SET consumed=1 WHERE id=?').run(id);
      throw new ApiError('SMS_UNAVAILABLE', 503, '短信暂时无法发送，请稍后重试。');
    }
    return { challengeId: id, retryAfterSeconds: 60, expiresInSeconds: 300 };
  }
  function verifyOtp({ challengeId, phone, code, inviteCode, ip }) {
    limit('otp-verify-ip', ip, 30, 900000);
    const invalid = () => { throw new ApiError('OTP_INVALID', 401, '验证码无效或已过期，请重新获取。'); };
    let canonical;
    try { canonical = normalizePhone(phone); } catch { return invalid(); }
    if (typeof challengeId !== 'string' || challengeId.length > 80 || typeof code !== 'string' || !/^\d{6}$/.test(code)) return invalid();
    const row = db.prepare('SELECT * FROM auth_challenges WHERE id=?').get(challengeId);
    if (!row || row.consumed || row.expires_at <= now() || row.attempts >= 5 || row.phone !== canonical) return invalid();
    const submitted = Buffer.from(hash('otp', `${challengeId}:${code}`), 'hex');
    if (!timingSafeEqual(submitted, Buffer.from(row.code_hash, 'hex'))) {
      db.prepare('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=? AND consumed=0 AND attempts<5 AND expires_at>?').run(challengeId, now());
      return invalid();
    }
    // Spend the challenge before any account/session mutation; a replay never authenticates.
    const spent = db.prepare('UPDATE auth_challenges SET consumed=1,attempts=attempts+1 WHERE id=? AND consumed=0 AND attempts<5 AND expires_at>?').run(challengeId, now());
    if (spent.changes !== 1) return invalid();
    const { user } = store.registerVerifiedUser({ phone: canonical, inviteCode });
    const token = randomBytes(32).toString('base64url'); const t = now(); const age = 7 * 86400000;
    db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(hash('session', token), user.id, t + age, t);
    return { user, cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age / 1000}` };
  }
  function cookieToken(req) {
    const cookies = typeof req.headers.cookie === 'string' ? req.headers.cookie.split(';') : [];
    const candidates = cookies.map(s => s.trim()).filter(s => s.startsWith(`${SESSION_COOKIE}=`));
    if (candidates.length !== 1) return null;
    const token = candidates[0].slice(SESSION_COOKIE.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }
  function session(req) {
    const token = cookieToken(req); if (!token) return null;
    const row = db.prepare('SELECT user_id FROM auth_sessions WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL')
      .get(hash('session', token), now());
    return row ? store.getUser(row.user_id) : null;
  }
  function requireUser(req, admin = false) {
    const user = session(req);
    if (!user) throw new ApiError('AUTH_REQUIRED', 401, '请先通过短信验证登录。');
    if (admin && user.role !== 'admin') throw new ApiError('FORBIDDEN', 403, '此操作仅供商家使用。');
    return user;
  }
  function logout(req) {
    const token = cookieToken(req);
    if (token) db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE token_hash=?').run(now(), hash('session', token));
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }
  function revokeAll(userId) { db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=?').run(now(), userId); }
  const referralName = '__Host-dlcj_referral';
  function referral(req) {
    const match = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${referralName}=`));
    if (!match) return undefined;
    const token = match.slice(referralName.length + 1);
    if (token.length > 500) return undefined;
    const [payload, signature] = token.split('.');
    if (!payload || !/^[a-f0-9]{64}$/.test(signature || '')) return undefined;
    if (!timingSafeEqual(Buffer.from(hash('referral', payload), 'hex'), Buffer.from(signature, 'hex'))) return undefined;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return data.expires > now() && /^[A-Za-z0-9_-]{16}$/.test(data.code) ? data.code : undefined;
    } catch { return undefined; }
  }
  function captureReferral(req, code) {
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(code)) throw new ApiError('INVALID_INVITE', 400, '邀请码格式无效。');
    const selected = referral(req) || code;
    const payload = Buffer.from(JSON.stringify({ code: selected, expires: now() + 7 * 86400000 })).toString('base64url');
    return `${referralName}=${payload}.${hash('referral', payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
  }
  return { requestOtp, verifyOtp, session, requireUser, logout, revokeAll, limit, prune, referral, captureReferral };
}
