# Brand and store integration · 2026-10-01

This integration combines frontend commit `700ef07410d9313e59c24e80b5b1d46cbcd131e3` with store commit `ab55b2ac79f594bcf2405953c6b463e07d0acf5d` in an independent branch. Neither original branch is overwritten.

## Resulting routes

- `/`: the new brand homepage, with the original floor-mat and tissue-box cards and photographs
- `/mats`: the nine-photo display-only collection, with its existing styles, carousel controls and bilingual copy
- `/tissue-box`: the completed seven-style tissue-box store and its CNY 99 / CNY 159 prices, checkout selection, account entry, contact and purchase information
- `/customize`: the existing editor, private/local design adapters, draft preservation and import/export behavior
- `/my`, `/login`, `/checkout`, `/gallery`, `/admin`, `/api/store`: existing store routes

The frontend branch had moved the earlier tissue-box page from `/` to `/tissue-box`. The integration places the completed store at that destination instead, preserving the latest store features. Brand and floor-mat designs and image assets are unchanged.

## Conflict resolutions

The three Git conflicts were `app/page.tsx`, `components/studio.tsx` and `README.md`. The brand page owns `/`; the studio keeps all store/save fixes and adopts `/tissue-box` for its save-before-return action; both README sections are retained.

Additional semantic fixes add both collection routes to the static entry and generated Netlify rewrites, keep tissue-box language switching inside its collection, and route product-selection/back links to `/tissue-box`. The logo still returns to the brand home. Framework landing pages now capture invitation links as the static entry already did. Preview mode continues to block store transport and invitation capture.

## Validation and release boundaries

Run `npm run test:store`, `STORE_UI_QA_DIR=/tmp/dlcj-qa npm run test:ui`, `npm run test:design-roundtrip`, `npm run typecheck`, `npm run build:netlify` and `npm run build`. Optional DOM test packages are documented in `scripts/qa/README.md`.

Existing brand screenshots are upstream reference images, not fresh screenshots of this integration. DOM tests do not replace real-browser visual, mobile and WebGL acceptance. The merge does not activate floor-mat ordering, payments, real SMS/email, hosting credentials or a production deployment. Private order-email configuration remains server-only with no real recipient in source.

Verified in the cloud checkout: 79 backend tests; 146 DOM/UI checks (26 tissue-box, 34 editor/local storage, 60 account/order/admin/gallery, 26 brand/static-route checks); design roundtrip; TypeScript; normal and preview Netlify builds; Vinext build. Full-source lint reports 15 pre-existing errors, compared with 17 at the store parent; no new error categories or affected files were introduced. No real browser/WebGL acceptance or deployment was performed for this merge.
