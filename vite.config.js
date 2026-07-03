import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  preview: {
    allowedHosts: ['.trycloudflare.com']
  },
  optimizeDeps: {
    exclude: ['recast-navigation']
  }
});
