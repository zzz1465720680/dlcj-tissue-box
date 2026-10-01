// Only the dedicated Netlify frontend-preview build defines this flag.
// Next/Vinext and ordinary Netlify builds retain the complete store behavior.
declare const __STORE_FRONTEND_PREVIEW__: boolean;
export const frontendPreview = typeof __STORE_FRONTEND_PREVIEW__ !== 'undefined' && __STORE_FRONTEND_PREVIEW__;
