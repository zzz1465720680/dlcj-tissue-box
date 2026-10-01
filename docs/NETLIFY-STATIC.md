# Netlify static build

This is an isolated deployment mode for the existing storefront and revision9 studio. It does not replace the original `npm run build` / Vinext / Cloudflare setup.

## Build and preview

```sh
npm ci
npm run build:netlify
npm run preview:netlify -- --host 127.0.0.1
```

Publish the contents of `dist-netlify`, with `index.html`, `_redirects` and `_headers` at the deployment root. The source checkout includes `netlify.toml` for a future authorized Git-connected build. No repository push is required for a manual upload.

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
