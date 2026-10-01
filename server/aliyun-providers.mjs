import { createHash, createHmac, randomUUID } from 'node:crypto';
import { ApiError } from './auth.mjs';

const encode = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const form = values => Object.keys(values).sort().map(key => `${encode(key)}=${encode(values[key])}`).join('&');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const MAIL_HOSTS = Object.freeze({ 'cn-hangzhou': 'dm.aliyuncs.com', 'ap-southeast-1': 'dm.ap-southeast-1.aliyuncs.com', 'us-east-1': 'dm.us-east-1.aliyuncs.com', 'eu-central-1': 'dm.eu-central-1.aliyuncs.com' });

/** Pure ACS3 signing; production callers use fixed service endpoints and form bodies, never OTPs in URLs. */
export function signAliyunRequest({ host, action, version, accessKeyId, accessKeySecret, securityToken,
  params, query = {}, timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), nonce = randomUUID() }) {
  const body = params === undefined ? '' : form(params);
  const queryString = form(query);
  const headers = { host, 'x-acs-action': action, 'x-acs-version': version, 'x-acs-date': timestamp,
    'x-acs-signature-nonce': nonce, 'x-acs-content-sha256': sha256(body) };
  if (params !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
  if (securityToken) headers['x-acs-security-token'] = securityToken;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map(name => `${name}:${headers[name].trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = ['POST', '/', queryString, canonicalHeaders, signedHeaders, sha256(body)].join('\n');
  const signature = createHmac('sha256', accessKeySecret).update(`ACS3-HMAC-SHA256\n${sha256(canonical)}`).digest('hex');
  headers.authorization = `ACS3-HMAC-SHA256 Credential=${accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`;
  headers.accept = 'application/json';
  return { url: `https://${host}/${queryString ? `?${queryString}` : ''}`, headers, body };
}

export function singleEmail(value, name) {
  const parts = typeof value === 'string' ? value.split('@') : [];
  const labels = parts.length === 2 ? parts[1].split('.') : [];
  if (typeof value !== 'string' || value.length > 254 || value.trim() !== value || parts.length !== 2 ||
      !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/.test(parts[0]) || parts[0].startsWith('.') ||
      parts[0].endsWith('.') || parts[0].includes('..') || labels.length < 2 ||
      labels.some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    throw new Error(`Email delivery requires one private ${name} address`);
  }
  return value;
}

function required(env, key, maximum = 256) {
  const value = env[key];
  if (typeof value !== 'string' || !value || value.length > maximum || value.trim() !== value || /[\r\n\0]/.test(value)) throw new Error(`${key} is required`);
  return value;
}
function credentials(env, prefix) {
  return { accessKeyId: required(env, `${prefix}_ALI_ACCESS_KEY_ID`), accessKeySecret: required(env, `${prefix}_ALI_ACCESS_KEY_SECRET`),
    ...(env[`${prefix}_ALI_SECURITY_TOKEN`] ? { securityToken: required(env, `${prefix}_ALI_SECURITY_TOKEN`, 4096) } : {}) };
}
function providerError(uncertain = false) {
  const error = new ApiError(uncertain ? 'DELIVERY_UNCERTAIN' : 'PROVIDER_UNAVAILABLE', 503, '通知服务暂时不可用。');
  error.deliveryUncertain = uncertain;
  return error;
}
async function boundedJson(response) {
  if (!response.body || Number(response.headers.get('content-length') || 0) > 65536) { await response.body?.cancel(); throw providerError(true); }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw providerError(true); } chunks.push(Buffer.from(value)); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}
async function invoke(request, accept) {
  try {
    const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.body,
      redirect: 'error', signal: AbortSignal.timeout(10000) });
    const data = await boundedJson(response);
    if (response.ok && accept(data)) return;
    // An explicit service rejection is safe to retry later. Transport/5xx/unknown outcomes need review.
    if (response.status < 500 && typeof data?.Code === 'string' && data.Code !== 'OK') throw providerError(false);
    throw providerError(true);
  } catch (error) {
    if (error instanceof ApiError && typeof error.deliveryUncertain === 'boolean') throw error;
    // Never propagate URLs, request headers, provider messages or response bodies to logs/outbox.
    throw providerError(true);
  }
}

export function aliyunSms(env) {
  const auth = credentials(env, 'STORE_SMS');
  const signName = required(env, 'STORE_SMS_ALI_SIGN_NAME', 100);
  const templateCode = required(env, 'STORE_SMS_ALI_TEMPLATE_CODE', 100);
  const codeVariable = env.STORE_SMS_ALI_CODE_VARIABLE || 'code';
  const minutesVariable = env.STORE_SMS_ALI_MINUTES_VARIABLE;
  if (!/^SMS_[A-Za-z0-9]+$/.test(templateCode) || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(codeVariable) ||
      (minutesVariable && (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(minutesVariable) || minutesVariable === codeVariable))) throw new Error('Invalid approved SMS template configuration');
  if (env.STORE_SMS_ALI_MAINLAND_EGRESS_CONFIRMED !== 'true') throw new Error('Aliyun domestic SMS requires confirmed mainland-China egress');
  return async ({ phone, code, expiresInSeconds }) => {
    if (!/^\+861[3-9]\d{9}$/.test(phone) || !/^\d{4,8}$/.test(code) || !Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) throw new ApiError('INVALID_OTP', 400);
    const variables = { [codeVariable]: code, ...(minutesVariable ? { [minutesVariable]: String(Math.ceil(expiresInSeconds / 60)) } : {}) };
    await invoke(signAliyunRequest({ ...auth, host: 'dysmsapi.aliyuncs.com', action: 'SendSms', version: '2017-05-25',
      params: { PhoneNumbers: phone.slice(3), SignName: signName, TemplateCode: templateCode, TemplateParam: JSON.stringify(variables) } }), data => data?.Code === 'OK' && typeof data.BizId === 'string' && data.BizId.length > 0);
  };
}

export function aliyunMail(env) {
  const auth = credentials(env, 'STORE_EMAIL');
  const region = env.STORE_EMAIL_ALI_REGION || 'cn-hangzhou';
  const host = MAIL_HOSTS[region]; if (!host) throw new Error('Unsupported STORE_EMAIL_ALI_REGION');
  const sender = singleEmail(env.STORE_EMAIL_ALI_FROM_ADDRESS, 'STORE_EMAIL_ALI_FROM_ADDRESS');
  return async ({ to, reference, product, amountFen, adminLink, idempotencyKey }) => {
    // Message-ID helps operator reconciliation; it is not a provider idempotency guarantee.
    const messageId = `<store-${sha256(idempotencyKey)}@${sender.split('@')[1]}>`;
    const amount = amountFen === null ? '待报价' : `CNY ${(amountFen / 100).toFixed(2)}`;
    const text = `订单号：${reference}\n商品：${product}\n商品金额：${amount}\n请登录商家后台查看：${adminLink}`;
    await invoke(signAliyunRequest({ ...auth, host, action: 'SingleSendMail', version: '2015-11-23',
      params: { RegionId: region, AccountName: sender, AddressType: '1', ReplyToAddress: 'false', ToAddress: to,
        Subject: '商店订单通知', TextBody: text, ClickTrace: '0', Headers: JSON.stringify({ 'Message-ID': messageId }) } }), data => typeof data?.EnvId === 'string' && data.EnvId.length > 0 && typeof data.RequestId === 'string' && !data.Code);
  };
}
