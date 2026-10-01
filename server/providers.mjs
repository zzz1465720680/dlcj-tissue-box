import { ApiError } from './auth.mjs';

function approvedGateway(env, prefix) {
  if (env[`${prefix}_MODE`] !== 'approved-gateway' || env[`${prefix}_DELIVERY_APPROVED`] !== 'true') return null;
  const endpoint = env[`${prefix}_GATEWAY_URL`]; const token = env[`${prefix}_GATEWAY_TOKEN`];
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new Error(`${prefix}_GATEWAY_URL is required`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !token || token.length < 20) {
    throw new Error(`${prefix} requires an HTTPS gateway and a configured gateway token`);
  }
  return async payload => {
    const response = await fetch(parsed, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    // Never log or persist provider response bodies, which may echo secrets or personal data.
    await response.body?.cancel();
    if (!response.ok) throw new ApiError('PROVIDER_UNAVAILABLE', 503, '通知服务暂时不可用。');
  };
}
/** No credentials are generated, no provider is contacted until a specifically enabled operation runs. */
export function createProviders(env = process.env) {
  const smsSend = approvedGateway(env, 'STORE_SMS');
  const emailSend = approvedGateway(env, 'STORE_EMAIL');
  let emailOrigin; let orderEmailTo;
  if (emailSend) {
    orderEmailTo = env.STORE_ORDER_EMAIL_TO;
    const parts = typeof orderEmailTo === 'string' ? orderEmailTo.split('@') : [];
    const labels = parts.length === 2 ? parts[1].split('.') : [];
    if (typeof orderEmailTo !== 'string' || orderEmailTo.length > 254 || orderEmailTo.trim() !== orderEmailTo ||
        parts.length !== 2 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/.test(parts[0]) ||
        parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..') || labels.length < 2 ||
        labels.some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
      throw new Error('Email delivery requires one private STORE_ORDER_EMAIL_TO address');
    }
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
      if (typeof reference !== 'string' || reference.length > 100 || typeof product !== 'string' || product.length > 100 ||
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
  let sent = 0; let failed = 0;
  for (const row of pending) {
    try {
      await email.sendOrderNotice({ ...row.payload, idempotencyKey: row.id });
      store.internal.recordOutboxResult({ id: row.id, success: true }); sent += 1;
    } catch {
      store.internal.recordOutboxResult({ id: row.id, success: false, error: 'DELIVERY_FAILED' }); failed += 1;
    }
  }
  return { enabled: true, sent, failed };
}
