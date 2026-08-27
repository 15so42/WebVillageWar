import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    watch: {
      // 忽略编辑器/工具原子写入留下的临时目录（windows 上 watch 会 EBUSY 崩溃）
      ignored: ['**/.createWorld.js.*.tmpdir/**', '**/.*tmpdir*/**', '**/*.tmp']
    }
  },
  preview: {
    allowedHosts: ['.trycloudflare.com']
  },
  optimizeDeps: {
    exclude: ['recast-navigation']
  }
});
