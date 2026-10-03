import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {INITIAL_PRICING} from './lib/pricing';

// Isolated browser-only build. The original Vinext/Cloudflare build stays intact.
export default defineConfig(({mode}) => {
  const frontendPreview = mode === 'frontend-preview';
  const apiPort = Number(process.env.STORE_DEV_API_PORT || 8788);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('Invalid local store API port');
  return {
  define: {__STORE_FRONTEND_PREVIEW__: JSON.stringify(frontendPreview), __STORE_LOCAL_PRICING_PREVIEW__: JSON.stringify(mode !== 'production' && process.env.STORE_LOCAL_PRICING_PREVIEW === '1')},
  plugins: [react(), {
    name: 'netlify-static-metadata',
    transformIndexHtml(html) {
      return frontendPreview ? html.replace('</head>', '<meta name="robots" content="noindex, nofollow" /></head>') : html;
    },
    generateBundle() {
      this.emitFile({type: 'asset', fileName: '_redirects', source: ['/mats','/tissue-box','/customize','/model-review','/my','/login','/checkout','/admin','/gallery'].map(path => `${path} /index.html 200\n${path}/ /index.html 200\n`).join('')});
      this.emitFile({type: 'asset', fileName: '_headers', source: '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: public, max-age=0, must-revalidate\n' + (frontendPreview ? '  X-Robots-Tag: noindex, nofollow\n' : '') + '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n'});
      this.emitFile({type: 'asset', fileName: 'deployment-version.json', source: JSON.stringify({
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
        sourceWorkingTreeDirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {encoding: 'utf8'}).trim().length > 0,
        builtAt: new Date().toISOString(),
        build: frontendPreview ? 'store-v2-frontend-test-preview' : 'store-v2-payment-deferred',
        frontendPreview,
        modelRevision: 9,
        designStorage: frontendPreview ? 'browser-local-only' : 'private-api-with-browser-local-recovery',
        authentication: frontendPreview ? 'disabled-in-preview' : 'phone-otp-provider-required',
        paymentEnabled: false,
        pricingSource: 'persistent-store-api',
        pricingEndpoint: '/api/store/pricing',
        ...(frontendPreview ? {previewReferencePrices: INITIAL_PRICING} : {}),
      }, null, 2)});
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
