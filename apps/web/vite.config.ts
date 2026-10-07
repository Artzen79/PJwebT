import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// keep the browser's Host so the API document's server URL (and its Test Request) stays on this origin
const api = { target: 'http://localhost:3000', changeOrigin: false };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': api, '/uploads': api, '/docs': api, '/openapi.json': api },
  },
});
