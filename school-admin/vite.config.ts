import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// School Admin dashboard - deployable independently (admin.schoolname.yoursaas.com)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': resolve(__dirname, '../shared/src') },
  },
  server: { port: 5174, fs: { allow: ['..'] } },
});