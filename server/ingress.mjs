import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from './auth.mjs';

const contexts = new Set(['production', 'deploy-preview', 'branch-deploy']);
function canonicalHttps(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value; } catch { return false; }
}

/** Configuration only: no credentials are generated and no requests are sent. */
export function loadIngressConfig(env = process.env) {
  const mode = env.STORE_INGRESS_MODE || 'direct';
  if (mode === 'direct') {
    if (Object.keys(env).some(key => key.startsWith('STORE_NETLIFY_') && env[key])) throw new Error('STORE_INGRESS_MODE must explicitly enable configured Netlify verification');
    return { mode };
  }
  if (mode !== 'netlify-signed') throw new Error('Invalid STORE_INGRESS_MODE');
  const secret = env.STORE_NETLIFY_PROXY_SECRET;
  const siteId = env.STORE_NETLIFY_SITE_ID;
  const siteUrl = env.STORE_NETLIFY_SITE_URL;
  const deployContexts = (env.STORE_NETLIFY_DEPLOY_CONTEXTS || 'production').split(',').map(value => value.trim());
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('STORE_NETLIFY_PROXY_SECRET requires at least 32 bytes');
  if (typeof siteId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) throw new Error('Invalid STORE_NETLIFY_SITE_ID');
  if (!canonicalHttps(siteUrl)) throw new Error('STORE_NETLIFY_SITE_URL requires a canonical HTTPS origin');
  if (!deployContexts.length || deployContexts.some(value => !contexts.has(value))) throw new Error('Invalid STORE_NETLIFY_DEPLOY_CONTEXTS');
  return { mode, secret, siteId, siteUrl, deployContexts: [...new Set(deployContexts)] };
}

function decodePart(value, maximum) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid JWS encoding');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length > maximum || bytes.toString('base64url') !== value) throw new Error('Invalid JWS encoding');
  return bytes;
}

/** Netlify JWS proves the configured ingress site/context, not a customer or a signed request body/IP. */
export function createIngressVerifier(config = { mode: 'direct' }, now = Date.now) {
  if (config.mode === 'direct') return () => {};
  if (config.mode !== 'netlify-signed') throw new Error('Invalid STORE_INGRESS_MODE');
  // Revalidate explicitly supplied server configuration as well as environment configuration.
  const checked = loadIngressConfig({ STORE_INGRESS_MODE: config.mode, STORE_NETLIFY_PROXY_SECRET: config.secret,
    STORE_NETLIFY_SITE_ID: config.siteId, STORE_NETLIFY_SITE_URL: config.siteUrl,
    STORE_NETLIFY_DEPLOY_CONTEXTS: config.deployContexts?.join(',') });
  return req => {
    try {
      const token = req.headers['x-nf-sign'];
      if (typeof token !== 'string' || token.length > 8192) throw new Error();
      // Reject duplicates, including headers Node would otherwise combine or discard.
      if (req.rawHeaders && req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'x-nf-sign').length !== 1) throw new Error();
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error();
      const header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodePart(parts[0], 1024)));
      if (!header || typeof header !== 'object' || Array.isArray(header) || header.alg !== 'HS256' ||
          (header.typ !== undefined && header.typ !== 'JWT') || header.crit !== undefined || header.b64 !== undefined) throw new Error();
      const signature = decodePart(parts[2], 32);
      const expected = createHmac('sha256', checked.secret).update(`${parts[0]}.${parts[1]}`).digest();
      if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error();
      const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodePart(parts[1], 4096)));
      const seconds = Math.floor(now() / 1000);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.iss !== 'netlify' ||
          payload.netlify_id !== checked.siteId || payload.site_url !== checked.siteUrl ||
          !checked.deployContexts.includes(payload.deploy_context) || !Number.isSafeInteger(payload.exp) || payload.exp <= seconds ||
          (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > seconds))) throw new Error();
    } catch {
      // Never echo the header, claims, signing key, request data or a verification-library error.
      throw new ApiError('INGRESS_REJECTED', 403, '请求入口无效。');
    }
  };
}
