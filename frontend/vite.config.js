import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const api = env.VITE_API_BASE_URL;
    const socket = env.VITE_SOCKET_URL;

    let valid = false;
    try {
      const apiUrl = new URL(api);
      const socketUrl = new URL(socket);
      valid = apiUrl.protocol === 'https:'
        && apiUrl.pathname === '/api/v1'
        && !apiUrl.search && !apiUrl.hash && !apiUrl.username && !apiUrl.password
        && socketUrl.protocol === 'https:'
        && socketUrl.pathname === '/'
        && !socketUrl.search && !socketUrl.hash && !socketUrl.username && !socketUrl.password
        && apiUrl.origin === socketUrl.origin;
    } catch {
      // Missing or malformed deployment URLs fail the production build below.
    }

    if (!valid) {
      throw new Error('Production builds require VITE_API_BASE_URL=https://<backend>/api/v1 and VITE_SOCKET_URL=https://<backend> on the same origin.');
    }
  }

  const pwa = VitePWA({
    registerType: 'prompt',
    injectRegister: 'script',
    manifest: {
      id: '/',
      name: 'Synkro — Shared workspace',
      short_name: 'Synkro',
      description: 'A calm, shared space for teams to think and write together.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#08090b',
      theme_color: '#08090b',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{html,js,css,png,svg,webp,woff2}'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api\//],
      cleanupOutdatedCaches: true,
      maximumFileSizeToCacheInBytes: 1024 * 1024,
    },
  });

  // The Android WebView draws edge-to-edge; keep this viewport setting out of the web/PWA build.
  const androidViewport = {
    name: 'android-viewport-fit',
    transformIndexHtml: (html) => html.replace('initial-scale=1.0', 'initial-scale=1.0, viewport-fit=cover'),
  };

  // Capacitor packages the same UI, but native builds do not register a second web service worker.
  return { plugins: [react(), ...(mode === 'android' ? [androidViewport] : []), ...(mode === 'production' ? [pwa] : [])] };
});
