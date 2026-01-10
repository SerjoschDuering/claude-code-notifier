import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pair: resolve(__dirname, 'pair.html'),
        approve: resolve(__dirname, 'approve.html'),
      },
    },
  },
  publicDir: 'public',
});
