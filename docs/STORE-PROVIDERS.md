# Optional notification providers

The server supports `approved-gateway` and optional `aliyun` modes. Both SMS and email are disabled unless their corresponding `STORE_*_DELIVERY_APPROVED` variable is exactly `true`. No credentials, accounts, signatures, domains or live recipients are provisioned by this code. All automated provider tests use synthetic values and mocked HTTP responses. Payment remains disabled.

## Private configuration

Store all actual values in the approved server's private environment. Never put credentials or the merchant's order-notice address in source, browser variables, screenshots or git. The public examples below use reserved example addresses only.

For Aliyun domestic SMS:

- `STORE_SMS_MODE=aliyun`
- `STORE_SMS_DELIVERY_APPROVED=true`, only after provider/template approval and authorization to send
- `STORE_SMS_ALI_ACCESS_KEY_ID`, `STORE_SMS_ALI_ACCESS_KEY_SECRET`; optionally `STORE_SMS_ALI_SECURITY_TOKEN` for operator-managed STS credentials
- `STORE_SMS_ALI_SIGN_NAME`: approved signature; `STORE_SMS_ALI_TEMPLATE_CODE`: approved OTP template
- `STORE_SMS_ALI_CODE_VARIABLE`: defaults to `code`; optional `STORE_SMS_ALI_MINUTES_VARIABLE` when the approved template also expects validity in minutes
- `STORE_SMS_ALI_MAINLAND_EGRESS_CONFIRMED=true`: operator confirmation that the API server's actual egress is mainland China. This is not an IP-location detector and does not overcome provider restrictions. Do not select this provider for an unverified overseas egress route

The adapter accepts one canonical `+86` mainland mobile number and a 4–8 digit OTP. It uses HTTPS POST to the fixed `dysmsapi.aliyuncs.com` host with ACS3-HMAC-SHA256 signing; business parameters are form-encoded in the body rather than placed in the URL. Each request has a fresh nonce. There are no automatic transport retries. The existing OTP service still controls expiry, throttling and failed-request behavior.

For Aliyun DirectMail:

- `STORE_EMAIL_MODE=aliyun`
- `STORE_EMAIL_DELIVERY_APPROVED=true`, only after provider/domain setup and approval of the intended notifications
- `STORE_EMAIL_ALI_ACCESS_KEY_ID`, `STORE_EMAIL_ALI_ACCESS_KEY_SECRET`; optionally `STORE_EMAIL_ALI_SECURITY_TOKEN`
- `STORE_EMAIL_ALI_FROM_ADDRESS`: verified sender, for example `notice@example.com`
- `STORE_ORDER_EMAIL_TO`: the private merchant recipient, for example `orders@example.com`; no real-address default and no caller override
- `STORE_PUBLIC_ORIGIN`: exact HTTPS storefront origin, for example `https://shop.example.test`
- `STORE_EMAIL_ALI_REGION`: `cn-hangzhou` (default), `ap-southeast-1`, `us-east-1`, or `eu-central-1`. The sender must be verified in that same region; the closed Sydney region is rejected

The DirectMail adapter sends only a fixed subject and plain text containing order reference, generic product, goods amount and an authenticated admin URL. It never forwards checkout details or private artwork. It does not add attachments, CC/BCC, reply-to overrides or click tracking. Sender and recipient accept one address only. Service endpoints are selected from an explicit allowlist.

The original HTTPS gateway mode retains its `STORE_SMS_GATEWAY_*` / `STORE_EMAIL_GATEWAY_*` configuration and requires server-side deduplication by the event's idempotency key. Email still requires the private recipient and canonical HTTPS origin in this mode.

## Acceptance, retries and uncertainty

API acceptance does not prove handset/inbox delivery. SMS requires `Code=OK` plus a receipt ID; DirectMail requires an envelope ID and request ID. No raw provider response, URL, credential or provider error message is logged or retained. Responses are size-bounded, redirects are rejected and requests have a 10-second timeout.

An explicit service rejection can enter the existing exponential retry queue. An uncertain DirectMail outcome, including timeout, connection failure, malformed response, unexplained success or server error, is held for operator review. It is not automatically resent. A stable Message-ID helps reconcile a notice but is not a provider deduplication guarantee. Aliyun SMS also lacks provider idempotency; its adapter never blindly retries a timed-out call.

Migration `002_outbox_claims.sql` preserves existing queued notices and adds an atomic claim. Two API workers cannot claim the same notice concurrently. Claims do not automatically expire: a process crash, or failed local bookkeeping after provider acceptance, leaves the notice held rather than risking a duplicate send. Inspect held notices during routine operations and after a restart.

Before reconciliation, stop the email worker, inspect the provider's delivery records and review the specific notice. With an existing private `STORE_DB_PATH`:

- `npm run store:outbox -- list-held`: read-only metadata, at most 100 held notices; no message payload or recipient printed
- `npm run store:outbox -- mark-accepted NOTICE_ID --confirm-provider-review`: record that the provider already accepted the notice
- `npm run store:outbox -- retry NOTICE_ID --confirm-provider-review`: return it to the pending queue only after confirming retry is appropriate

Reconciliation creates an audit record and never sends a message itself. Restarting an approved worker can then send notices explicitly returned to pending. No reconciliation route is exposed over HTTP. Review old/test queued notices before first enabling delivery.

## Official references checked 2026-10-01

- [SendSms API: parameters, result codes, retry and non-idempotency warning](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms)
- [ACS3 signing and fixed-parameter validation vector](https://help.aliyun.com/zh/sdk/product-overview/v3-request-structure-and-signature)
- [RPC query parameters may be carried as an encoded POST body](https://help.aliyun.com/en/sdk/product-overview/v3-request-structure-and-signature)
- [SingleSendMail API](https://help.aliyun.com/zh/direct-mail/api-dm-2015-11-23-singlesendmail)
- [DirectMail regional endpoints](https://help.aliyun.com/zh/direct-mail/api-dm-2015-11-23-endpoint)
- [Aliyun SMS eligibility and mainland egress requirements](https://help.aliyun.com/zh/sms/product-overview/faq)

The integration is locally implemented and tested, with live credentials, real delivery acceptance, provider receipts, capacity limits and production hosting still unconfigured. Provider selection remains an operator/user decision.
