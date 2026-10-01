# Netlify static build

This is an isolated deployment mode for the brand homepage (`/`), floor-mat showcase (`/mats`), tissue-box storefront (`/tissue-box`) and revision9 studio. It does not replace the original `npm run build` / Vinext / Cloudflare setup.

## Build and preview

```sh
npm ci
npm run build:netlify
npm run preview:netlify -- --host 127.0.0.1
```

Publish the contents of `dist-netlify`, with `index.html`, `_redirects` and `_headers` at the deployment root. The source checkout includes `netlify.toml` for a future authorized Git-connected build. No repository push is required for a manual upload.

## Frontend-only review preview

Run `npm run build:netlify -- --mode frontend-preview` to produce the separate `dist-netlify-preview` directory. This opt-in build adds a visible test notice, forces local-only design storage, blocks store API transport and referral capture, and replaces account, login, checkout, gallery and admin routes with a service-unavailable explanation. No real personal information should be entered into this preview. The normal build retains the complete store behavior.

The preview emits both a robots meta tag and `X-Robots-Tag: noindex, nofollow`; these discourage indexing but do not provide access control. Anyone with an unprotected preview link can open it. Preview browser storage belongs to that preview's origin, so export JSON before moving to another link.

Deploy this output only as an explicitly authorized non-production draft. The current site's Netlify Drop upload UI has automatic production publishing enabled, so uploading there would replace the public site. The Netlify CLI's default `deploy` command supports a draft URL; do not use `--prod`. CLI authentication requires its own authorization if no login already exists. Do not create credentials or change site publishing settings just to get around that requirement.

## Earlier static-only behavior

The store expansion supersedes the static-only default described below. See [STORE-IMPLEMENTATION.md](STORE-IMPLEMENTATION.md). Local saved designs remain available at `/customize?storage=local`; the legacy header-trusting Cloudflare API is now retired with HTTP 410.

## Original scope

- Seven existing styles at CNY 99; custom combinations at CNY 159
- Current Chinese/English storefront and direct `/customize` and `/model-review` routes
- Approved revision9 model and existing material, colour, artwork and perforation controls
- Local drafts and named saved designs in IndexedDB
- Inquiry text, editable JSON and PNG export

Named saves are specific to the current origin, device and browser. They do not require an account and are not sent to a backend. Clearing browser data, switching browsers or using a different domain does not carry saved designs across. Customers should export JSON backups. The former Cloudflare route is now retired; it is not an authentication fallback.

`Studio` receives an explicit request adapter in this build rather than modifying global `fetch`. The adapter validates the existing version-1 schema and reports blocked or full storage without claiming a save succeeded. Transactions resolve only after commit.

Two small reliability fixes also apply to the original studio: temporarily clearing the name input no longer overwrites a valid draft with an invalid empty name, and importing an inquiry JSON file restores its quantity and notes along with the design.

## Checks and limitations

The cloud checkout passed TypeScript and production build checks. New Netlify code passed focused lint. The unchanged source has existing ESLint errors; the full repository is not lint-clean.

Independent check scripts and detailed local reports are under ignored `checks/`. DOM tests use JSDOM and fake-indexeddb; these are not a substitute for live browser visual, WebGL, mobile or PNG verification. The original geometry audit needs unpublished Blender/raw audit inputs and cannot run from this repository alone. A separate shipped-asset check verifies compressed revision9 contents and atlas hashes.

The existing editor permits extreme artwork documents beyond the schema's 200 layers per surface, 6,000 points per stroke, and the 12 MB import/save cap. Ordinary documents are covered by roundtrip tests; very large artwork should be simplified before relying on save or reimport. This limitation predates the static adapter.
