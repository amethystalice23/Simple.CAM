import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // base './' → built index.html references ./assets/… (relative) instead of
  // /assets/…, so the deploy works under any subpath without a hardcoded root
  base: './',
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});