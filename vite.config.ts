import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

export default defineConfig({
  plugins: [react()],
  // the about box shows the release number without shipping package.json
  define: { __APP_VERSION__: JSON.stringify(version) },
  // base './' → built index.html references ./assets/… (relative) instead of
  // /assets/…, so the deploy works under any subpath without a hardcoded root
  base: './',
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});