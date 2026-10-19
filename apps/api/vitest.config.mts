import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  // SWC emite os metadados de decorators que o esbuild do Vite não emite (necessário para DI do NestJS).
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
