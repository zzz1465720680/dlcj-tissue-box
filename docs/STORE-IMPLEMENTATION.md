# Store expansion: local review build

This checkout contains the V3 storefront and an executable private store API. Source synchronization is limited to a review branch; this implementation does not deploy a site, enable SMS/email delivery, create merchant credentials, or activate payment. Existing live deployment stays unchanged until a separate publication step.

Current researched hosting/provider choices and activation sequence: [STORE-LAUNCH.zh.md](STORE-LAUNCH.zh.md) (2026-10-01). Consistent SQLite backup and read-only verification are available through `npm run store:backup -- --output-dir ABSOLUTE_PRIVATE_DIR` (with `STORE_DB_PATH`) and `npm run store:verify-backup -- --backup-dir ABSOLUTE_BACKUP_DIR`. They do not configure scheduling, copy data off-host or restore production. Keep backups outside source/static directories; see the launch checklist for recovery precautions.

## Deployment boundary

- The existing Vite/Netlify browser build is retained. `npm run build:netlify` writes `dist-netlify`.
- The new API is a Node 24 service using built-in SQLite transactions, a persistent private database, and a private object-storage adapter. It belongs on an approved durable host with persistent storage and backups, behind the storefront's same-origin `/api/store` reverse proxy.
- **Do not run this database on Netlify Functions' temporary filesystem.** No durable production API host, database service, SMS/email provider, object-storage provider, or credentials are configured by this change.
- The browser always uses relative API URLs. The development Vite proxy targets loopback port 8788; a production reverse proxy must point to the approved host, preserve the configured public Origin, and strip untrusted forwarding headers.
- There is no payment screen, payment provider, payment callback, client-set paid flag, or development login bypass in the production app. Payment/refund transitions are internal, tested service methods reserved for a future independently verified provider event handler.

## Local checks

```sh
npm run test:store
npm run typecheck
npm run build:netlify
npm run dev:netlify -- --host 127.0.0.1
```

The Node API entry point is `npm run dev:api`. Review its documented environment requirements before supplying operator-owned configuration. Tests inject isolated providers and test identities into temporary databases; these fixtures do not create public login routes or send external messages.

## Existing designs remain recoverable

Local drafts keep their original IndexedDB storage. `/customize?storage=local` opens the original named local-design library and export/import flow. These records are tied to the current origin, browser and device; a new domain cannot read them. Export editable JSON on the original live origin first, import it on the new origin, and explicitly save after phone login. Signing in never silently uploads earlier private designs.

Historical smooth/suede materials remain readable and exportable. New production offers fine-grain leather only. Any old design requiring unavailable material must be adjusted before an order is created. Colour pickers communicate close-match stock choices, not an exact RGB manufacturing promise.

## Business boundaries

- Seven existing styles: CNY 99 each. Custom colour combinations: CNY 159 each. Personal artwork, embroidery and special requirements require a bespoke quote.
- Browse and design before authentication. Phone login protects saved cloud designs, orders, addresses and private material photos.
- Gallery publication requires a separate explicit consent for that saved version and merchant curation. Saving is not publication consent. Public derivatives omit private uploaded artwork, custom names and labels.
- A valid newly verified invited friend must materially change a design and save. Both parties receive a CNY 5 coupon valid for 90 days. Existing accounts, self-referral and trivial/repeated qualifying designs do not create new rewards. Rules are configurable, conservative controls, not a claim that abuse is impossible.
- Coupon redemption is capped at CNY 30 per **order's goods total**, including standard or custom goods, with no shipping offset. Earliest-expiry coupons are reserved first. Reservation, redemption, cancellation release and verified refund returns are transactionally recorded and idempotent.
- Full confirmed refunds return used coupon value. Partial confirmed goods refunds allocate proportional coupon value. Expired coupon value returned due to merchant inability receives 30 additional days. Payment/refund effects cannot be invoked by an ordinary customer or merchant HTTP request.
- Orders capture immutable server-priced product/design snapshots and private delivery details. The current customer action creates a draft/confirmation request, never a paid order.
- Standard production: 1–2 calendar days after verified payment. Custom: 5–7 calendar days after customer confirms the latest actual material/design record, with payment also required. Weekends count; transit is additional.
- Origin: Fuzhou. Freight contract and free-shipping regions are unresolved. Unknown routes require a merchant quote; the system must never imply nationwide free shipping. The Northeast retail CNY 15/1 kg figure is context, not a configured tariff.
- Email outbox notices to the privately configured merchant recipient include only order reference, product, amount and authenticated admin link. Names, phone numbers, addresses and private designs stay behind authentication. WeChat notifications remain deferred.

## Before production activation

1. Approve a durable Node host and private storage/backup/restore plan, set exact HTTPS public Origin and narrow trusted ingress configuration
2. Choose approved SMS and email providers; complete applicable provider identity/template/domain setup and secure secret handoff; verify delivery, retries and limits using approved test recipients
3. Provision the merchant admin identity deliberately through the operator boundary; never promote the first signup or trust a client-selected role
4. Set shipping regions/rates or retain manual quote-required behavior; confirm after-sales policy and final customer-facing terms
5. Verify public gallery sanitization, image delivery permissions, upload quotas, database backups and restoration, dependency security, logs and abuse thresholds
6. Run staging end-to-end OTP and merchant/customer flows on the real HTTPS origin; screenshots/tests in this checkout are local, not proof of live provider operation
7. Payment UI and gateway work await separate user confirmation and verified merchant API eligibility. Existing collection QR is not evidence of H5/API entitlement
8. Source may be synchronized to the authorized review branch; production deployment remains a separate approval

## Platform references

- Node 24 built-in SQLite API: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html (synchronous transactional local database; durable hosting and backups are application responsibilities)
- Netlify buffered function request/response limits: https://docs.netlify.com/build/functions/configuration/ (6 MB; binary encoding reduces effective request headroom). Design uploads use bounded 1 MB chunks rather than a single 12 MB function request.

## Configuration contract (no services configured here)

Local API: `npm run dev:api`, then `npm run dev:netlify`. Default public Origin is `http://localhost:5173` and API binds `127.0.0.1:8788`. Use that exact frontend origin, because mutations require an exact Origin match. Cookies remain Secure/HttpOnly, including local development; use a browser that accepts Secure localhost cookies or an approved local HTTPS setup. There is deliberately no insecure-cookie toggle. The development signing key is process-local and restarting invalidates its sessions; there is no development OTP or login bypass.

Production requires:
- `NODE_ENV=production`
- `STORE_PUBLIC_ORIGIN`: exact canonical HTTPS storefront origin
- `STORE_DB_PATH`: absolute path on private persistent storage, outside all static/build directories
- `STORE_AUTH_SECRET`: operator-provided random secret of at least32 bytes; never put it in frontend/Vite variables or source
- Optional `STORE_PORT` (default8788), `STORE_HOST` (default127.0.0.1), and exact ingress IPs in `STORE_TRUSTED_PROXY_IPS`. Ingress must replace forwarded client-IP headers; broad trust is unsafe

The provider boundary retains an approved HTTPS gateway adapter and now includes optional Aliyun SMS/DirectMail adapters; see [STORE-PROVIDERS.md](STORE-PROVIDERS.md) for private configuration, official API references and uncertainty handling. Gateway mode requires all of `STORE_SMS_MODE=approved-gateway`, `STORE_SMS_DELIVERY_APPROVED=true`, `STORE_SMS_GATEWAY_URL`, and `STORE_SMS_GATEWAY_TOKEN`; email uses the corresponding `STORE_EMAIL_*` names and requires `STORE_ORDER_EMAIL_TO` as a private server environment variable. There is no real-address default: enabling delivery with a missing or invalid recipient fails closed. Public examples use `orders@example.com`; never commit the actual value. The database stores the logical recipient `merchant`, and the adapter chooses the configured address when sending. Other vendors still need a reviewed gateway implementation; every selected provider requires real delivery verification. Never set the delivery approval flag merely to silence an unavailable-service message.

SMS gateway payload: `type`, verified-format phone, one-time code, expiry seconds. Email gateway payload is explicitly limited to fixed merchant recipient, notice type, order reference, generic product, amount in integer fen (or null for pending bespoke quote), authenticated admin path, and idempotency key. Gateways must enforce idempotency, origin/account restrictions, approved recipients/templates and retries; secrets are operator-owned. The API never returns or logs OTP values or raw provider replies.

The email outbox is retried only while the approved email adapter is enabled. Atomic claims prevent concurrent sends; uncertain direct-provider or gateway results and abandoned claims require operator reconciliation. Pending notices remain queued while disabled. Before enabling an existing queue, the merchant must review whether historical test/order notices should be sent. Fixture data belongs only in temporary test databases.

Admin role setup is operator-only and not executed by this implementation. After a real account is OTP-verified and the merchant approves the role grant, the protected `server/manage.mjs` command can promote that existing account. It requires the deliberately supplied account phone, private API configuration and `--confirm-role-change`; there is no first-user promotion or web bootstrap route. Back up and restrict access to the database before operating this command.

## Review checks and remaining acceptance

Source lint had17 pre-existing errors before expansion; the broad `npm run lint` also walks ignored local QA bundles (80 errors at initial baseline). Report focused new-file lint separately rather than calling the whole repository clean. No pre-existing errors are silently waived by a package change.

The local Chromium process and cloud browser currently cannot open the isolated local preview in this execution environment. DOM/interaction checks and build checks can still run, but actual responsive screenshots, browser history/back behavior and real HTTPS mobile OTP/provider acceptance must be checked on an approved reachable staging host before production.

### October 1: approved frontend review and ingress preparation

An independently authorized Netlify draft preview has been built and visually reviewed; the user approved its appearance. The preview is private under Netlify account access, has a visible test banner and noindex metadata, forces browser-local design storage and blocks store transport. Live browser checks covered homepage selection, unavailable checkout, saved local designs and reload recovery. Cloud WebGL is disabled, so full 3D rendering and mobile viewport acceptance remain unverified. The production deployment was not replaced.

Optional Netlify HS256 ingress verification and a read-only `store:check-config` command are now implemented; actual proxy endpoints and signing credentials remain unconfigured. See [STORE-INGRESS.md](STORE-INGRESS.md) for the exact scope, inactive routing example and remaining client-IP validation. Startup validates enabled providers before creating storage. Database configuration rejects known static output paths, normalized traversal and unresolved symbolic links. Gateway timeouts/ambiguous responses now hold notifications for operator reconciliation.

Final checks for this increment: 79 backend/client/security tests, historical design round-trip, TypeScript, focused lint and both Netlify/Vinext builds passed. The latest frontend change also passed 119 DOM checks before preview deployment. Existing broad source-lint failures remain separate; this is not a claim that production hosting, real SMS/email or payment are activated.

### Persistence and financial-interface details

SQLite/WAL is the durable single-host reference adapter. Keep it on a local persistent volume, with private backups and tested restore; do not point concurrent hosts at a shared network filesystem. Private material images use a SQLite BLOB adapter, not a public directory. A separate cloud object vendor is optional for later scale, and has not been configured. Design files retain their embedded editable images privately. Lists return bounded metadata, with API pagination, while specific detail endpoints retrieve private contents.

Default design quotas are128 MiB logical storage,500 saved versions and100 active designs per verified account; conservative referral thresholds and quotas are configurable in the server service constructor. Each request is bounded; uploads use1,000,000-byte chunks and a12,000,000-byte design limit. Actual stock identity cannot be proven from a verified phone alone. OTP throttling, new-account restriction, canonical visual fingerprints and meaningful-edit thresholds reduce abuse without claiming to eliminate it.

Internal confirmed-refund `goodsRefundFen` means the pre-discount goods allocation, not cash paid; the service computes cumulative proportional coupon and cash portions and checks a supplied `cashRefundFen`. Shipping refunds are separate. For expired coupons returned because the merchant cannot fulfill, only the returned tranche receives a new30-day coupon; unrelated old expired balance stays expired. Full refund returns exactly the originally allocated coupon value.

An expired reservation cannot be recorded as paid by the internal payment interface. The future payment integration must establish a payable quote/window and reconcile stale reservations before charging; it must never silently reprice an already charged order. No public route can call these payment/refund transitions today.
