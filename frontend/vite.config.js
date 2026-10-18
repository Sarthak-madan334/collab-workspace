import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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

  return { plugins: [react()] };
});
