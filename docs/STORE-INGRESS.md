# Store API ingress and configuration checks

The current Netlify review remains a frontend-only preview. This document and the example configuration do not activate an API, create credentials, change Netlify settings, or enable notifications.

## Read-only production configuration check

After the operator has supplied the approved private server environment, run:

```sh
npm run store:check-config
```

The command validates production configuration even if `NODE_ENV` was omitted. It checks HTTPS origin, private database path, authentication secret length, bind address, exact trusted-proxy addresses, optional ingress verification and enabled provider settings. It does not create a database, bind a port, generate credentials, contact providers or print configured secrets, addresses and database paths. A zero exit status means configuration format is valid; warnings can still identify disabled SMS/email. It does not prove TLS, disk persistence, provider approval or delivery.

Database paths are normalized and resolved through existing filesystem ancestors. Paths inside the repository or working directory's served outputs, including `dist-netlify-preview`, are rejected, as are unresolved symbolic links. Keep the parent directory private and operator-controlled; validation does not prevent a privileged operator from changing the filesystem later.

## Optional Netlify signed proxy

`STORE_INGRESS_MODE=direct` is the default. For a future Netlify-to-external-API proxy, explicitly select `netlify-signed` and configure these private server values:

| Variable | Meaning |
| --- | --- |
| `STORE_NETLIFY_PROXY_SECRET` | Independently supplied private signing key, at least 32 bytes; never a `VITE_*` or browser variable |
| `STORE_NETLIFY_SITE_ID` | Exact allowed Netlify project UUID |
| `STORE_NETLIFY_SITE_URL` | Exact canonical HTTPS `site_url` expected in the signed claims; verify the actual value during staging |
| `STORE_NETLIFY_DEPLOY_CONTEXTS` | Explicit comma-separated contexts; defaults to `production`; supported values are `production`, `deploy-preview`, `branch-deploy` |

Configuring Netlify-specific values while leaving ingress in direct mode is rejected, rather than silently leaving verification off. Production and staging should use separate databases and keys; do not allow preview contexts to reach customer production data.

The server validates `x-nf-sign` as canonical compact HS256 JWS, verifies the signature before using payload claims, requires `iss=netlify`, the exact site ID and URL, an allowed context, a future integer `exp`, and a valid optional `nbf`. Missing, duplicated, malformed, expired or mismatched headers receive a generic 403 without echoing tokens or claims. Every store route, including health, is covered. Session ownership, administrator checks, mutation Origin validation and existing rate limits still run afterward.

Netlify's documented claims do **not** sign the HTTP method, URL, body or client IP, and contain no request nonce. This is an ingress-origin check, not payload integrity or one-time request replay protection. Keep TLS, sessions, idempotency and private signing-key handling in place. Do not log the JWS. No undocumented token lifetime is assumed; expiration is checked against server time.

[Netlify signed proxy reference](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)

## Routing example and remaining network validation

`examples/netlify-store-proxy.toml` is an inactive example under this documentation directory. Only after host selection, credential authorization and staging validation should the relevant rules be merged into the actual Netlify configuration. The destination is deliberately an invalid example domain. The named signing environment variable must be available at Netlify Runtime, with the same private key supplied separately to the API. No key is included in the TOML.

The example uses two code-based, per-domain-and-IP limits, within the documented Free plan allowance. These are defense in depth: Netlify enforcement can lag by up to ten seconds, invalid rate rules do not necessarily fail a deploy, and successful deployment alone is not proof a rule applied. Inspect deploy logs and test limits during staging. Proxy requests have a documented 26-second timeout; upload chunking stays bounded, and slow operations must not assume a long synchronous proxy connection.

[Netlify rate-limit configuration and limits](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)

The API deliberately does not start trusting forwarded IP headers merely because a Netlify JWS is valid. Its existing `STORE_TRUSTED_PROXY_IPS` accepts exact directly connected ingress IPs only, and that ingress must replace `X-Forwarded-For` with a verified single client IP. Do not use wildcards, CIDRs, arbitrary public proxy IPs or client-provided header values. Netlify-signed mode does not establish the authenticity of an unsigned client-IP header.

Before real SMS activation, verify the deployed chain's client-IP semantics and spoof resistance. Without this, the API may conservatively group customers under a proxy IP, causing shared throttling. The new code does not claim to complete that deployment-specific step.

Also verify same-origin cookies, cross-site request rejection, private-object ownership, response `no-store`, the configured HTTPS hostname, and restart persistence. Signed proxy settings and real target URLs remain unconfigured in the current preview.

## Gateway delivery uncertainty

The approved-gateway adapter now treats network failures, timeouts, 5xx and ambiguous responses (including 408/409) as uncertain delivery. Such email jobs stay held for operator reconciliation instead of automatic retry. Explicit rejection statuses 400/401/403/404/410/422/429 remain retryable. A successful response is not converted to a retry because response-body cleanup failed. The gateway must still implement the documented idempotency contract; held jobs require the existing provider-review workflow in `STORE-PROVIDERS.md`.
