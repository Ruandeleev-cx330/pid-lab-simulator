import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In dev the CSP meta tag would block Vite's inline react-refresh preamble, so it
 * is stripped from the served HTML. The production build keeps it (see index.html)
 * and the Electron main process additionally refuses every remote navigation.
 */
function stripCspInDev() {
  return {
    name: 'pidlab-strip-csp-in-dev',
    apply: 'serve' as const,
    transformIndexHtml(html: string) {
      return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), stripCspInDev()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome128'
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 30000
  }
});
