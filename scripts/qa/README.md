# Store UI interaction checks

`store-ui.mjs` mounts the real React store components into jsdom and mocks only the network. All account, address, order, phone and provider data are synthetic. It never contacts a live API, sends SMS, logs into a real account, collects a payment or deploys the application.

Run with Node 22+ and optional development-only `jsdom` and `esbuild` packages:

```sh
# Keep optional QA dependencies outside production package.json/package-lock.json.
# If not already available, install into a separate temporary QA project.
npm install --prefix /tmp/dlcj-qa --no-save jsdom esbuild
STORE_UI_QA_DIR=/tmp/dlcj-qa node scripts/qa/store-ui.mjs
```

If the dependencies are installed in the application itself, `STORE_UI_QA_DIR` may be omitted. `STORE_UI_REPORT` can select the output JSON location; the default is the system temporary directory's `dlcj-store-ui-results.json`. Bundled component output is temporary and deleted after testing.

This checks login provider-disabled/error/retry/interruption states, safe return routes, actual checkout form behavior and server failures, amounts and quote boundaries, duplicate submits/idempotency, private account/consent/logout behavior, material consent, guest/admin authorization states, public gallery projections, and basic labels/landmarks. It is not a substitute for backend authorization tests or real browser visual/mobile/accessibility QA. Screenshots were blocked in this execution environment by Chromium socket permissions and the cloud browser's loopback navigation restriction; these checks do not bypass those restrictions.

The full UI regression command is:

```sh
STORE_UI_QA_DIR=/tmp/dlcj-qa npm run test:ui
```

This also runs `homepage.mjs` (26 carousel/terms/navigation checks) and `studio.mjs` (33 editor/local-storage/import/export checks). The studio suite additionally needs the optional `fake-indexeddb` QA package. It validates the real local-storage adapter against a maintained IndexedDB implementation and never transmits local saved designs. All three scripts resolve optional dependencies through `STORE_UI_QA_DIR`, create temporary bundles outside the repository, and leave production dependencies unchanged.

`brand-store.mjs` exercises the actual static entry for the brand home, floor mats and tissue-box collection in both languages, trailing-slash routes, floor-mat interactions, preview service blocking and referral capture in both build modes. All network responses are synthetic. It also checks that floor mats have no checkout form or editor. These DOM checks do not prove responsive pixel layout or WebGL behavior.
