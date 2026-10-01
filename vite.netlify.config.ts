import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Isolated browser-only build. The original Vinext/Cloudflare build stays intact.
export default defineConfig(({mode}) => {
  const frontendPreview = mode === 'frontend-preview';
  return {
  define: {__STORE_FRONTEND_PREVIEW__: JSON.stringify(frontendPreview)},
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
        stockPriceCny: 99,
        customPriceCny: 159,
      }, null, 2)});
    },
  }],
  resolve: {alias: {'@': fileURLToPath(new URL('.', import.meta.url))}},
  build: {outDir: frontendPreview ? 'dist-netlify-preview' : 'dist-netlify', emptyOutDir: true, sourcemap: false},
  server: {host: '0.0.0.0', proxy: {'/api/store': {target: 'http://127.0.0.1:8788', changeOrigin: false}}},
  preview: {host: '0.0.0.0'},
  };
});
