import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Isolated browser-only build. The original Vinext/Cloudflare build stays intact.
export default defineConfig({
  plugins: [react(), {
    name: 'netlify-static-metadata',
    generateBundle() {
      this.emitFile({type: 'asset', fileName: '_redirects', source: ['/customize','/model-review','/my','/login','/checkout','/admin','/gallery'].map(path => `${path} /index.html 200\n${path}/ /index.html 200\n`).join('')});
      this.emitFile({type: 'asset', fileName: '_headers', source: '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: public, max-age=0, must-revalidate\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n'});
      this.emitFile({type: 'asset', fileName: 'deployment-version.json', source: JSON.stringify({
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
        builtAt: new Date().toISOString(),
        build: 'store-v2-payment-deferred',
        modelRevision: 9,
        designStorage: 'private-api-with-browser-local-recovery',
        authentication: 'phone-otp-provider-required',
        paymentEnabled: false,
        stockPriceCny: 99,
        customPriceCny: 159,
      }, null, 2)});
    },
  }],
  resolve: {alias: {'@': fileURLToPath(new URL('.', import.meta.url))}},
  build: {outDir: 'dist-netlify', emptyOutDir: true, sourcemap: false},
  server: {host: '0.0.0.0', proxy: {'/api/store': {target: 'http://127.0.0.1:8788', changeOrigin: false}}},
  preview: {host: '0.0.0.0'},
});
