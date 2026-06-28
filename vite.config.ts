/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Static, backend-free build. `base: './'` keeps asset paths relative so the
// bundle can be hosted from any subpath (GitHub Pages, file://, S3, etc.).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
