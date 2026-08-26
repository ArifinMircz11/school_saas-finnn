import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@saas/api-client': resolve(__dirname, '../packages/api-client/src/index.ts'),
      '@saas/shared-ui/styles.css': resolve(__dirname, '../packages/shared-ui/src/system.css'),
      '@saas/shared-ui': resolve(__dirname, '../packages/shared-ui/src/index.ts'),
    },
  },
  server: { port: 5178, fs: { allow: ['..'] } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          // recharts (+ its d3 deps) is heavy — split it so it loads only on pages that chart.
          charts: ['recharts'],
        },
      },
    },
  },
});