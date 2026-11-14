import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'lucide-react'],
  },
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
    proxy: { '/api': `http://localhost:${process.env.INKARR_PORT ?? 8585}` },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
