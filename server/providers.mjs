import { ApiError } from './auth.mjs';
import { aliyunSms, aliyunMail, singleEmail } from './aliyun-providers.mjs';

function approvedGateway(env, prefix) {
  if (env[`${prefix}_MODE`] !== 'approved-gateway' || env[`${prefix}_DELIVERY_APPROVED`] !== 'true') return null;
  const endpoint = env[`${prefix}_GATEWAY_URL`]; const token = env[`${prefix}_GATEWAY_TOKEN`];
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new Error(`${prefix}_GATEWAY_URL is required`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !token || token.length < 20) {
    throw new Error(`${prefix} requires an HTTPS gateway and a configured gateway token`);
  }
  return async payload => {
    let response;
    try {
      response = await fetch(parsed, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
    } catch {
      const error = new ApiError('PROVIDER_UNAVAILABLE', 503, '通知服务暂时不可用。');
      error.deliveryUncertain = true; throw error;
    }
    // Never log or persist provider response bodies, which may echo secrets or personal data.
    await response.body?.cancel().catch(() => {});
    if (!response.ok) {
      const error = new ApiError('PROVIDER_UNAVAILABLE', 503, '通知服务暂时不可用。');
      // A gateway may have accepted delivery before returning 5xx or losing the response.
      error.deliveryUncertain = ![400, 401, 403, 404, 410, 422, 429].includes(response.status);
      throw error;
    }
  };
}
function selectProvider(env, prefix, direct) {
  if (env[`${prefix}_DELIVERY_APPROVED`] !== 'true') return null;
  if (env[`${prefix}_MODE`] === 'aliyun') return direct(env);
  if (env[`${prefix}_MODE`] === 'approved-gateway') return approvedGateway(env, prefix);
  throw new Error(`Unsupported ${prefix}_MODE`);
}
/** No credentials are generated, no provider is contacted until a specifically enabled operation runs. */
export function createProviders(env = process.env) {
  const smsSend = selectProvider(env, 'STORE_SMS', aliyunSms);
  const emailSend = selectProvider(env, 'STORE_EMAIL', aliyunMail);
  let emailOrigin; let orderEmailTo;
  if (emailSend) {
    orderEmailTo = singleEmail(env.STORE_ORDER_EMAIL_TO, 'STORE_ORDER_EMAIL_TO');
    try { emailOrigin = new URL(env.STORE_PUBLIC_ORIGIN); } catch { throw new Error('Email delivery requires STORE_PUBLIC_ORIGIN'); }
    if (emailOrigin.protocol !== 'https:' || emailOrigin.origin !== env.STORE_PUBLIC_ORIGIN) throw new Error('Email delivery requires a canonical HTTPS STORE_PUBLIC_ORIGIN');
  }
  return {
    sms: { available: Boolean(smsSend), async sendOtp({ phone, code, expiresInSeconds }) {
      if (!smsSend) throw new ApiError('SMS_UNAVAILABLE', 503);
      await smsSend({ type: 'login_otp', phone, code, expiresInSeconds });
    } },
    email: { available: Boolean(emailSend), async sendOrderNotice(notice) {
      if (!emailSend) throw new ApiError('EMAIL_UNAVAILABLE', 503);
      // Whitelist, rather than forwarding an order or arbitrary outbox object.
      const { orderRef: reference, product, amountFen, adminLink: adminPath, idempotencyKey } = notice;
      if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(reference) || typeof product !== 'string' || !product.trim() || product.length > 100 || /[\r\n\0]/.test(product) ||
          typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey) ||
          !(amountFen === null || (Number.isSafeInteger(amountFen) && amountFen >= 0)) || typeof adminPath !== 'string' ||
          !/^\/admin(?:\?order=[A-Za-z0-9_-]+)?$/.test(adminPath)) throw new ApiError('INVALID_NOTICE', 400);
      await emailSend({ to: orderEmailTo, type: 'order_notice', reference, product, amountFen, adminLink: new URL(adminPath, emailOrigin).href, idempotencyKey });
    } },
  };
}

/** Called only by the operator's worker when email delivery has been explicitly configured. */
export async function drainEmailOutbox({ store, email, limit = 20 }) {
  if (!email?.available) return { enabled: false, sent: 0, failed: 0 };
  const pending = store.internal.listPendingOutbox({ limit });
  let sent = 0; let failed = 0; let held = 0;
  for (const row of pending) {
    const claim = store.internal.claimOutbox({ id: row.id });
    if (!claim) continue;
    try {
      await email.sendOrderNotice({ ...row.payload, idempotencyKey: row.id });
    } catch (error) {
      const uncertain = error?.deliveryUncertain === true;
      store.internal.recordOutboxResult({ id: row.id, deliveryToken: claim.token, success: false, error: uncertain ? 'DELIVERY_UNCERTAIN' : 'DELIVERY_FAILED' });
      failed += 1; if (uncertain) held += 1;
      continue;
    }
    // If persistence fails after acceptance, leave the claim held; do not turn it into a retry.
    store.internal.recordOutboxResult({ id: row.id, deliveryToken: claim.token, success: true }); sent += 1;
  }
  return { enabled: true, sent, failed, held };
}
