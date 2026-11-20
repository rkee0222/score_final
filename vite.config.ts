import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Inject a build timestamp so the running app can show which version it is.
const BUILD_ID = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
});
