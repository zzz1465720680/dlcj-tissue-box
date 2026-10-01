import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, realpathSync, lstatSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve, dirname, isAbsolute, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ApiError, createAuth, enforceOrigin, clientIp } from './auth.mjs';
import { createProviders, drainEmailOutbox } from './providers.mjs';
import { createObjectStore, CHUNK_BYTES } from './objects.mjs';
import { loadIngressConfig, createIngressVerifier } from './ingress.mjs';

const PREFIX = '/api/store';
const JSON_LIMIT = 64_000;
const mutation = method => !['GET', 'HEAD', 'OPTIONS'].includes(method);
function json(res, status, data, extra = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    ...extra,
  });
  res.end(JSON.stringify(data));
}
async function body(req, maximum, raw = false) {
  const media = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (media !== (raw ? 'application/octet-stream' : 'application/json')) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 415, '请求格式不受支持。');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new ApiError('UNSUPPORTED_ENCODING', 415);
  const announced = req.headers['content-length'];
  if (announced && (!/^\d+$/.test(announced) || Number(announced) > maximum)) throw new ApiError('PAYLOAD_TOO_LARGE', 413, '上传内容超过限制。');
  const chunks = []; let bytes = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > maximum) throw new ApiError('PAYLOAD_TOO_LARGE', 413, '上传内容超过限制。');
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  if (raw) return data;
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed;
  } catch { throw new ApiError('INVALID_JSON', 400, '请求数据无法读取。'); }
}

function listPage(url, total) {
  const rawLimit = url.searchParams.get('limit') ?? '100'; const rawOffset = url.searchParams.get('offset') ?? '0';
  if (!/^\d{1,3}$/.test(rawLimit) || !/^\d{1,9}$/.test(rawOffset)) throw new ApiError('INVALID_PAGE', 400, '分页参数无效。');
  const limit = Number(rawLimit); const offset = Number(rawOffset);
  if (limit < 1 || limit > 100) throw new ApiError('INVALID_PAGE', 400, '每页最多 100 条记录。');
  return { limit, offset, total, hasMore: offset + limit < total };
}

/** Used in tests with injected in-memory dependencies. Never supplies an authentication bypass. */
export function createStoreServer({ store, origin = 'http://localhost:5173', secret, providers,
  now = Date.now, production = false, testMode = false, trustedProxies = [], ingress, providerEnv = process.env, logger = () => {} }) {
  if (production && (testMode || providers)) throw new Error('Production dependency injection is prohibited');
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || !['http:', 'https:'].includes(parsedOrigin.protocol) || (production && parsedOrigin.protocol !== 'https:')) throw new Error('Invalid STORE_PUBLIC_ORIGIN');
  const providerSet = providers || createProviders(providerEnv);
  const auth = createAuth({ db: store.db, store, secret, sms: providerSet.sms, now, production, testMode });
  const objects = createObjectStore({ db: store.db, store, now });
  const verifyIngress = createIngressVerifier(ingress, now);
  const server = createServer({ maxHeaderSize: 16_384 }, async (req, res) => {
    const requestId = randomUUID();
    try {
      const url = new URL(req.url, origin); const path = url.pathname;
      if (!path.startsWith(`${PREFIX}/`) || url.origin !== origin) throw new ApiError('NOT_FOUND', 404, '接口不存在。');
      verifyIngress(req);
      enforceOrigin(req, origin);
      const ip = clientIp(req, trustedProxies);
      auth.limit('http-ip', ip, 600, 60000);
      // All routes are explicit. No generic domain invocation; verified financial event methods are never exposed.
      if (req.method === 'GET' && path === `${PREFIX}/health`) return json(res, 200, { status: 'ok' });
      if (req.method === 'GET' && path === `${PREFIX}/session`) return json(res, 200, {
        user: auth.session(req), capabilities: { sms: providerSet.sms.available, orders: true, payment: false },
      });
      if (req.method === 'GET' && path === `${PREFIX}/gallery`) {
        const pagination = listPage(url, store.getGalleryCount());
        return json(res, 200, { gallery: store.listGallery(pagination), pagination });
      }
      if (req.method === 'POST' && path === `${PREFIX}/auth/otp/request`) {
        const input = await body(req, 2000); return json(res, 202, await auth.requestOtp({ phone: input.phone, ip }));
      }
      if (req.method === 'POST' && path === `${PREFIX}/auth/otp/verify`) {
        const input = await body(req, 2000);
        const result = auth.verifyOtp({ challengeId: input.challengeId, phone: input.phone, code: input.code, inviteCode: auth.referral(req) || input.inviteCode, ip });
        return json(res, 200, { user: result.user }, { 'set-cookie': result.cookie });
      }
      if (req.method === 'POST' && path === `${PREFIX}/auth/logout`) {
        await body(req, 2000); return json(res, 200, { ok: true }, { 'set-cookie': auth.logout(req) });
      }
      if (req.method === 'POST' && path === `${PREFIX}/referral/capture`) {
        const input = await body(req, 2000); auth.limit('referral-ip', ip, 30, 3600000);
        return json(res, 200, { captured: true }, { 'set-cookie': auth.captureReferral(req, input.inviteCode) });
      }
      const user = auth.requireUser(req, path.startsWith(`${PREFIX}/admin/`));
      if (req.method === 'POST' && path === `${PREFIX}/auth/logout-all`) {
        await body(req, 2000); auth.revokeAll(user.id);
        return json(res, 200, { ok: true }, { 'set-cookie': auth.logout(req) });
      }
      if (mutation(req.method)) auth.limit('mutation-user', user.id, 200, 60000);
      if (req.method === 'POST' && path === `${PREFIX}/uploads`) return json(res, 201, objects.begin(user, await body(req, 3000)));
      let match;
      if (req.method === 'PUT' && (match = path.match(/^\/api\/store\/uploads\/([\w-]+)\/chunks\/(\d+)$/))) {
        return json(res, 200, objects.chunk(user, match[1], Number(match[2]), await body(req, CHUNK_BYTES, true)));
      }
      if (req.method === 'POST' && (match = path.match(/^\/api\/store\/uploads\/([\w-]+)\/complete$/))) {
        await body(req, 2000); return json(res, 200, await objects.complete(user, match[1]));
      }
      if (req.method === 'GET' && (match = path.match(/^\/api\/store\/objects\/([\w-]+)$/))) {
        const object = objects.read(user, match[1]);
        res.writeHead(200, { 'content-type': object.contentType, 'content-length': object.bytes.length,
          'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox", 'content-disposition': 'inline' });
        return res.end(object.bytes);
      }
      if (req.method === 'GET' && path === `${PREFIX}/designs`) {
        const pagination = listPage(url, store.getListCounts(user.id).designs);
        return json(res, 200, { designs: store.listDesigns(user.id, pagination), pagination });
      }
      if ((match = path.match(/^\/api\/store\/designs\/([\w-]+)$/))) {
        if (req.method === 'GET') return json(res, 200, { design: store.getDesign(user.id, match[1]) });
        if (req.method === 'DELETE' && typeof store.archiveDesign === 'function') {
          const input = await body(req, 2000); return json(res, 200, { design: store.archiveDesign(user.id, { designId: match[1], operationKey: input.operationKey }) });
        }
      }
      if (req.method === 'POST' && (match = path.match(/^\/api\/store\/designs\/([\w-]+)\/consent$/))) {
        const input = await body(req, 2000);
        return json(res, 200, { design: store.setGalleryConsent(user.id, { designId: match[1], version: input.version, consent: input.consent }) });
      }
      if (req.method === 'GET' && path === `${PREFIX}/coupons`) {
        const pagination = listPage(url, store.getListCounts(user.id).coupons);
        return json(res, 200, { coupons: store.listCoupons(user.id, pagination), pagination });
      }
      if (req.method === 'GET' && path === `${PREFIX}/referral`) return json(res, 200, { referral: store.getReferralSummary(user.id) });
      if (req.method === 'GET' && path === `${PREFIX}/orders`) {
        const pagination = listPage(url, store.getListCounts(user.id).orders);
        return json(res, 200, { orders: store.listOrders(user.id, pagination), pagination });
      }
      if (req.method === 'POST' && path === `${PREFIX}/orders`) {
        const input = await body(req, JSON_LIMIT);
        // Explicit whitelist prevents a client body from conveying paid status, totals, owner, role or provider events.
        const order = store.createOrder(user.id, { operationKey: input.operationKey, kind: input.kind, stockId: input.stockId,
          designId: input.designId, designVersion: input.designVersion, quantity: input.quantity,
          checkout: input.checkout, useCoupons: input.useCoupons });
        return json(res, 201, { order });
      }
      if (req.method === 'GET' && (match = path.match(/^\/api\/store\/orders\/([\w-]+)$/))) return json(res, 200, { order: store.getOrder(user.id, match[1]) });
      if (req.method === 'POST' && (match = path.match(/^\/api\/store\/orders\/([\w-]+)\/(cancel|material\/accept|shipping\/accept|quote\/accept)$/))) {
        const input = await body(req, 3000); let order;
        if (match[2] === 'cancel') order = store.cancelOrder(user.id, { orderId: match[1], operationKey: input.operationKey });
        if (match[2] === 'material/accept') order = store.acceptMaterial(user.id, { orderId: match[1], version: input.version });
        if (match[2] === 'shipping/accept') order = store.acceptShippingQuote(user.id, { orderId: match[1], version: input.version });
        if (match[2] === 'quote/accept') order = store.acceptQuote(user.id, { orderId: match[1], version: input.version, useCoupons: input.useCoupons, operationKey: input.operationKey });
        return json(res, 200, { order });
      }
      if (req.method === 'GET' && path === `${PREFIX}/admin/orders`) {
        const pagination = listPage(url, store.getAdminListCounts(user.id).orders);
        return json(res, 200, { orders: store.listAdminOrders(user.id, pagination), pagination });
      }
      if (req.method === 'GET' && path === `${PREFIX}/admin/designs`) {
        const pagination = listPage(url, store.getAdminListCounts(user.id).designs);
        return json(res, 200, { designs: store.listAdminDesigns(user.id, pagination), pagination });
      }
      if (req.method === 'GET' && path === `${PREFIX}/admin/coupons`) {
        const pagination = listPage(url, store.getAdminListCounts(user.id).coupons);
        return json(res, 200, { coupons: store.listAdminCoupons(user.id, pagination), pagination });
      }
      if (req.method === 'GET' && (match = path.match(/^\/api\/store\/admin\/orders\/([\w-]+)$/))) return json(res, 200, { order: store.getAdminOrder(user.id, match[1]) });
      if (req.method === 'POST' && (match = path.match(/^\/api\/store\/admin\/orders\/([\w-]+)\/(material|production|dispatch|shipping|quote)$/))) {
        const input = await body(req, JSON_LIMIT); let order; const orderId = match[1];
        if (match[2] === 'material') order = store.proposeMaterial(user.id, { orderId, note: input.note, photoRefs: objects.assertPhotoRefs(user, input.photoRefs) });
        if (match[2] === 'production') order = store.startProduction(user.id, { orderId });
        if (match[2] === 'dispatch') order = store.dispatchOrder(user.id, { orderId, carrier: input.carrier, tracking: input.tracking });
        if (match[2] === 'quote') order = store.adminSetQuote(user.id, { orderId, unitPriceFen: input.unitPriceFen });
        if (match[2] === 'shipping') order = store.adminSetShippingQuote(user.id, { orderId, shippingFen: input.shippingFen, note: input.note });
        return json(res, 200, { order });
      }
      if (req.method === 'POST' && path === `${PREFIX}/admin/coupons`) {
        const input = await body(req, 5000);
        return json(res, 201, { coupon: store.adminGrantCoupon(user.id, { userId: input.userId, amountFen: input.amountFen,
          expiresAt: input.expiresAt, reason: input.reason, operationKey: input.operationKey }) });
      }
      if (req.method === 'POST' && (match = path.match(/^\/api\/store\/admin\/coupons\/([\w-]+)\/revoke$/))) {
        const input = await body(req, 3000); return json(res, 200, { coupon: store.adminRevokeCoupon(user.id, { couponId: match[1], reason: input.reason }) });
      }
      if (req.method === 'POST' && path === `${PREFIX}/admin/gallery`) {
        const input = await body(req, 3000); return json(res, 200, { gallery: store.publishGallery(user.id, { designId: input.designId, version: input.version, published: input.published }) });
      }
      throw new ApiError('NOT_FOUND', 404, '接口不存在。');
    } catch (error) {
      const known = error instanceof ApiError || (error?.name === 'DomainError' && Number.isInteger(error.status));
      const status = known ? error.status : 500;
      // Deliberately no URL, request headers, body, phone, code, session, or provider error.
      if (status >= 500) logger({ event: 'request_failed', requestId, code: known ? error.code : 'INTERNAL_ERROR' });
      if (!req.complete) { res.shouldKeepAlive = false; req.resume(); }
      if (!res.headersSent && !res.destroyed) json(res, status, { error: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务暂时不可用，请稍后重试。', requestId });
    }
  });
  server.headersTimeout = 10000; server.requestTimeout = 30000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 50;
  server.on('clientError', (_error, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); });
  return { server, auth, objects, providers: providerSet };
}

function canonicalPath(filename) {
  let current = resolve(filename); const missing = [];
  while (true) {
    try { return resolve(realpathSync(current), ...missing); }
    catch (error) {
      if (error.code !== 'ENOENT' || dirname(current) === current) throw new Error('STORE_DB_PATH cannot be resolved safely');
      if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('STORE_DB_PATH contains an unresolved symbolic link');
      missing.unshift(current.slice(dirname(current).length + (dirname(current).endsWith(sep) ? 0 : 1)));
      current = dirname(current);
    }
  }
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origin = env.STORE_PUBLIC_ORIGIN || (production ? '' : 'http://localhost:5173');
  const secret = env.STORE_AUTH_SECRET || (production ? '' : randomBytes(32).toString('hex'));
  const suppliedFilename = env.STORE_DB_PATH || (production ? '' : resolve('.store-data/store.sqlite'));
  if (!origin || !suppliedFilename || Buffer.byteLength(secret) < 32 || !isAbsolute(suppliedFilename)) throw new Error('Configure STORE_PUBLIC_ORIGIN, STORE_AUTH_SECRET (32+ bytes), and absolute STORE_DB_PATH');
  const filename = canonicalPath(suppliedFilename);
  const url = new URL(origin);
  if (url.origin !== origin || (production && url.protocol !== 'https:')) throw new Error('Production STORE_PUBLIC_ORIGIN must be a canonical HTTPS origin');
  for (const base of [process.cwd(), fileURLToPath(new URL('..', import.meta.url))]) {
    for (const exposed of ['public', 'dist', 'dist-netlify', 'dist-netlify-preview', '.next']) {
      const root = canonicalPath(resolve(base, exposed));
      if (filename === root || filename.startsWith(`${root}${sep}`)) throw new Error('STORE_DB_PATH must be outside served/static directories');
    }
  }
  const port = Number(env.STORE_PORT || 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid STORE_PORT');
  const host = env.STORE_HOST || '127.0.0.1';
  const trustedProxies = (env.STORE_TRUSTED_PROXY_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (host !== 'localhost' && !isIP(host)) throw new Error('STORE_HOST must be a literal IP address or localhost');
  if (trustedProxies.some(value => !isIP(value))) throw new Error('STORE_TRUSTED_PROXY_IPS must contain exact IP addresses, not wildcards or ranges');
  return { production, origin, secret, filename, port, host,
    ingress: loadIngressConfig(env),
    trustedProxies };
}

export async function startServer(env = process.env) {
  const config = loadConfig(env);
  createProviders(env); // Validate approved provider configuration before creating private storage.
  process.umask(0o077);
  mkdirSync(dirname(config.filename), { recursive: true, mode: 0o700 });
  const { createStore } = await import('./domain.mjs');
  const store = createStore({ filename: config.filename });
  chmodSync(config.filename, 0o600);
  let app;
  try {
    app = createStoreServer({ store, ...config, providerEnv: env, logger: event => process.stderr.write(`${JSON.stringify(event)}\n`) });
    await new Promise((resolveListen, reject) => { app.server.once('error', reject); app.server.listen(config.port, config.host, resolveListen); });
  } catch (error) { app?.server.close(); store.close(); throw error; }
  // Retry outbox only when an approved email adapter is enabled. Disabled delivery leaves jobs pending.
  let draining = false;
  const timer = setInterval(async () => {
    if (draining || !app.providers.email.available) return;
    draining = true;
    try {
      const result = await drainEmailOutbox({ store, email: app.providers.email });
      if (result.held) process.stderr.write('Store email delivery needs operator review; uncertain notices will not retry automatically.\n');
    }
    catch { process.stderr.write('Store email worker paused an attempt; inspect held notices before retrying.\n'); }
    finally { draining = false; }
  }, 30000);
  timer.unref();
  const close = () => { clearInterval(timer); app.server.close(() => store.close()); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
  process.stdout.write(`Store API listening on ${config.host}:${config.port}; payment endpoints disabled\n`);
  return { ...app, store, close };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().catch(() => { process.stderr.write('Store API refused startup: check private storage and required configuration.\n'); process.exitCode = 1; });
}
