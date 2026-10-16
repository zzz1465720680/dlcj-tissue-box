import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {INITIAL_PRICING} from './lib/pricing';
import {BRAND_COPY} from './lib/brand-copy';
import {SHOWCASE_COPY} from './lib/showcase-copy';
import {FLOOR_MAT_COPY} from './lib/floor-mats/catalog';

// Static share metadata (crawlers such as WeChat do not run JS). Brand: 鼎立车眷 only.
const SITE_ORIGIN = 'https://dingli-tissue-box.netlify.app';
const OG_IMAGE = SITE_ORIGIN + '/share/og-1200x630.jpg';
const SHARE_PAGES: Record<string, {title: string; description: string}> = {
  '/': BRAND_COPY.zh.meta,
  '/tissue-box': SHOWCASE_COPY.zh.meta,
  '/mats': FLOOR_MAT_COPY.zh.meta,
  '/customize': {title: '自由定制 · 鼎立车眷', description: '在线搭配车载纸巾盒的主体、包角、封边与缝线配色，保存方案后加微信下单。'},
};
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function shareHead(html: string, path: string) {
  const {title, description} = SHARE_PAGES[path];
  const url = SITE_ORIGIN + (path === '/' ? '/' : path);
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="鼎立车眷" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="鼎立车眷" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    `<meta itemprop="name" content="${esc(title)}" />`,
    `<meta itemprop="description" content="${esc(description)}" />`,
    `<meta itemprop="image" content="${OG_IMAGE}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="keywords" content="鼎立车眷,车载纸巾盒,汽车纸巾盒,定制纸巾盒,汽车脚垫,定制脚垫,汽车内饰,福州" />`,
    ...(path === '/' ? [`<script type="application/ld+json">${JSON.stringify({'@context': 'https://schema.org', '@type': 'Organization', name: '鼎立车眷', alternateName: 'DINGLI CHEJUAN', url: SITE_ORIGIN + '/', logo: OG_IMAGE, telephone: '+86-13859235588', address: {'@type': 'PostalAddress', addressLocality: '福州', addressRegion: '福建', addressCountry: 'CN'}})}</script>`] : []),
  ].join('\n    ');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `    ${tags}\n  </head>`);
}

// Large public/ files are not content-hashed, so they get a 7-day browser cache (not
// `immutable`): an in-place replacement can stay stale for returning visitors up to 7 days.
// Changed 3D models/textures are referenced with ?v=<sha256> so code updates bust that cache.
// Netlify applies the most specific matching rule, so these override the `/*` rule.
const LONG_CACHE_PATHS = ['/models/*', '/materials/*', '/products/*', '/floor-mats/*', '/showcase/*', '/presets/*', '/references/*', '/share/*', '/brand/*'];

// public/ files that no customer-facing page (/, /tissue-box, /customize, /mats) loads.
// They stay in the repo (sources, scripts, internal review) but are removed from dist-netlify.
const NOT_SHIPPED = [
  // Unreferenced legacy/trial models.
  'models/revision7', 'models/presentation-trial', 'models/tissuebox-v2.glb',
  // Approved meshopt r9 asset and PNG leather maps: the site loads the Draco/WebP derivatives
  // made by scripts/shrink-web-assets.mjs. perforation-*.png are not referenced by any code.
  'models/revision9/tissuebox-r9.glb', 'models/leather-normal.png', 'models/leather-roughness.png',
  'models/perforation-mask.png', 'models/perforation-rim.png',
  // Blender reference renders for the internal /model-review page (its two <img> will 404 on
  // Netlify; the page's 3D view still works). ~16 MB.
  'model-review',
  // Full-size reference photos (~15 MB). The studio's 实物参考 dialog uses white-1280/pattern-1280.webp.
  'references/white.jpg', 'references/pattern.jpg', 'references/blue.jpg', 'references/black.jpg',
  'references/detail-reference.jpg', 'references/end-reference.jpg',
  // Logo source raster (dc-logo.svg embeds a small tinted copy), docs, unused product photo.
  'brand/dc-mark-source.png', 'brand/README.md', 'showcase/ASSETS.md', 'products/black-coral-in-car.webp',
];

// Isolated browser-only build. The original Vinext/Cloudflare build stays intact.
export default defineConfig(({mode}) => {
  const frontendPreview = mode === 'frontend-preview';
  const netlifyPricing = process.env.STORE_NETLIFY_PRICING === '1' && !frontendPreview;
  const apiPort = Number(process.env.STORE_DEV_API_PORT || 8788);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('Invalid local store API port');
  return {
  define: {__STORE_FRONTEND_PREVIEW__: JSON.stringify(frontendPreview), __STORE_LOCAL_PRICING_PREVIEW__: JSON.stringify(mode !== 'production' && process.env.STORE_LOCAL_PRICING_PREVIEW === '1'), __STORE_NETLIFY_PRICING__: JSON.stringify(netlifyPricing)},
  plugins: [react(), {
    name: 'netlify-static-metadata',
    transformIndexHtml(html) {
      html = shareHead(html, '/');
      return frontendPreview ? html.replace('</head>', '<meta name="robots" content="noindex, nofollow" /></head>') : html;
    },
    generateBundle() {
      this.emitFile({type: 'asset', fileName: '_redirects', source: ['/mats','/tissue-box','/customize','/model-review','/my','/login','/checkout','/admin','/admin/login','/gallery'].map(path => {const target = SHARE_PAGES[path] ? `/share-pages${path}.html` : '/index.html'; return `${path} ${target} 200\n${path}/ ${target} 200\n`;}).join('')});
      this.emitFile({type: 'asset', fileName: '_headers', source: '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: public, max-age=0, must-revalidate\n' + (frontendPreview ? '  X-Robots-Tag: noindex, nofollow\n' : '') + '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n' + LONG_CACHE_PATHS.map(path => `${path}\n  Cache-Control: public, max-age=604800\n`).join('')});
      this.emitFile({type: 'asset', fileName: 'robots.txt', source: frontendPreview ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nDisallow: /admin\nDisallow: /my\nDisallow: /login\nDisallow: /checkout\nDisallow: /model-review\nDisallow: /api/\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`});
      this.emitFile({type: 'asset', fileName: 'sitemap.xml', source: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + Object.keys(SHARE_PAGES).map(path => `  <url><loc>${SITE_ORIGIN}${path}</loc><changefreq>weekly</changefreq><priority>${path === '/' ? '1.0' : '0.8'}</priority></url>\n`).join('') + '</urlset>\n'});
      this.emitFile({type: 'asset', fileName: 'deployment-version.json', source: JSON.stringify({
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
        sourceWorkingTreeDirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {encoding: 'utf8'}).trim().length > 0,
        builtAt: new Date().toISOString(),
        build: frontendPreview ? 'store-v2-frontend-test-preview' : 'store-v2-payment-deferred',
        frontendPreview,
        modelRevision: 9,
        designStorage: frontendPreview || netlifyPricing ? 'browser-local-only' : 'private-api-with-browser-local-recovery',
        authentication: frontendPreview ? 'disabled-in-preview' : netlifyPricing ? 'merchant-password;customer-otp-disabled' : 'phone-otp-provider-required',
        paymentEnabled: false,
        pricingSource: netlifyPricing ? 'netlify-postgres' : 'persistent-store-api',
        ...(netlifyPricing ? {customerAccountsEnabled:false,ordersEnabled:false,cloudDesignsEnabled:false,galleryEnabled:false} : {}),
        pricingEndpoint: '/api/store/pricing',
        ...(frontendPreview ? {previewReferencePrices: INITIAL_PRICING} : {}),
      }, null, 2)});
    },
  }, {
    // Unreferenced/internal-only public files stay in the repo but are not shipped (NOT_SHIPPED).
    name: 'netlify-drop-unused-models',
    apply: 'build',
    async closeBundle() {
      const {rm} = await import('node:fs/promises');
      const out = fileURLToPath(new URL(frontendPreview ? './dist-netlify-preview/' : './dist-netlify/', import.meta.url));
      const {readFile, writeFile, mkdir} = await import('node:fs/promises');
      const home = await readFile(out + 'index.html', 'utf8');
      await mkdir(out + 'share-pages', {recursive: true});
      for (const path of Object.keys(SHARE_PAGES)) if (path !== '/') await writeFile(out + 'share-pages' + path + '.html', shareHead(home.replace(/\n\s*<meta (property="og:|name="twitter:|itemprop="|name="keywords")[^>]*>/g, '').replace(/\n\s*<link rel="canonical"[^>]*>/g, '').replace(/\n\s*<script type="application\/ld\+json">.*?<\/script>/g, ''), path));
      for (const rel of NOT_SHIPPED) await rm(out + rel, {recursive: true, force: true});
    },
  }],
  resolve: {alias: {'@': fileURLToPath(new URL('.', import.meta.url))}},
  cacheDir: 'checks/pricing-vite-cache',
  build: {outDir: frontendPreview ? 'dist-netlify-preview' : 'dist-netlify', emptyOutDir: true, sourcemap: false},
  server: {
    host: '127.0.0.1',
    fs: {deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.store-data/**']},
    watch: {ignored: ['**/dist/**', '**/dist-netlify/**', '**/dist-netlify-preview/**', '**/.store-data/**', '**/.wrangler/**', '**/checks/**']},
    proxy: {'/api/store': {target: `http://127.0.0.1:${apiPort}`, changeOrigin: false}},
  },
  preview: {host: '0.0.0.0'},
  };
});
