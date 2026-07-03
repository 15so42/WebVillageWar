import { defineConfig } from 'vite';

export default defineConfig({
  preview: {
    allowedHosts: ['.trycloudflare.com']
  },
  optimizeDeps: {
    exclude: ['recast-navigation']
  }
});
